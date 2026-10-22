"""End-to-end integration tests verifying complete backend workflows and mock resilience."""

from fastapi.testclient import TestClient
from backend.app.main import app

client = TestClient(app)


def test_system_status_and_health_integration():
    """Verify system health, status, and mock mode reporting."""
    res_root = client.get("/health")
    assert res_root.status_code == 200
    assert res_root.json()["status"] == "ok"

    res_sys_status = client.get("/api/system/status")
    assert res_sys_status.status_code == 200
    data = res_sys_status.json()
    assert data["status"] in ("ok", "degraded")
    assert data["database"] == "connected"
    assert "mock_mode" in data

    res_sys_health = client.get("/api/system/health")
    assert res_sys_health.status_code == 200
    assert res_sys_health.json()["status"] in ("ok", "degraded")


def test_macro_workflow_e2e():
    """Verify macro summary, series catalog, and FX spreads."""
    # Summary via /api/macro/summary
    res_summary = client.get("/api/macro/summary")
    assert res_summary.status_code == 200
    summary = res_summary.json()
    assert "indicators" in summary
    assert len(summary["indicators"]) > 0

    # Summary via /api/macro/indicators/summary
    res_summary_alt = client.get("/api/macro/indicators/summary")
    assert res_summary_alt.status_code == 200

    # Catalog search with 'search' parameter
    res_catalog = client.get("/api/macro/catalog?search=Reservas")
    assert res_catalog.status_code == 200
    catalog = res_catalog.json()
    assert isinstance(catalog, list)
    assert any("Reservas" in item["name"] for item in catalog)

    # FX Spreads via /api/macro/fx/spreads
    res_fx = client.get("/api/macro/fx/spreads")
    assert res_fx.status_code == 200
    fx = res_fx.json()
    assert "spreads" in fx


def test_credit_risk_and_export_e2e():
    """Verify single debtor, batch screening, PDF export, and Excel export."""
    # 1. Debtor screening (30-71234567-1)
    distressed_cuit = "30-71234567-1"
    res_debtor = client.get(f"/api/risk/deudores/{distressed_cuit}")
    assert res_debtor.status_code == 200
    report = res_debtor.json()
    assert report["cuit"] == "30712345671"
    assert report["peor_situacion"] >= 1
    assert "denominacion" in report and len(report["denominacion"]) > 0
    assert "entidades" in report
    assert "historial_24m" in report

    # 2. PDF Dossier generation
    res_pdf = client.get(f"/api/export/cuit-dossier/{distressed_cuit}")
    assert res_pdf.status_code == 200
    assert res_pdf.headers["content-type"] == "application/pdf"
    assert res_pdf.content.startswith(b"%PDF")

    # 3. Clean CUIT with no debts (27-40987654-9)
    clean_cuit = "27-40987654-9"
    res_clean = client.get(f"/api/risk/deudores/{clean_cuit}")
    assert res_clean.status_code == 200
    clean_report = res_clean.json()
    assert clean_report["peor_situacion"] == 1
    assert clean_report["deuda_total"] == 0.0

    # 4. Batch evaluation
    batch_payload = {
        "portfolio_name": "E2E Test Portfolio",
        "cuits": [distressed_cuit, clean_cuit],
    }
    res_batch = client.post("/api/risk/batch", json=batch_payload)
    assert res_batch.status_code == 200
    batch_res = res_batch.json()
    assert batch_res["portfolio_name"] == "E2E Test Portfolio"
    assert batch_res["valid_count"] == 2
    assert len(batch_res["debtors"]) == 2

    # 5. Excel Batch Export
    res_excel = client.post("/api/export/batch-excel", json=batch_payload)
    assert res_excel.status_code == 200
    assert "spreadsheetml" in res_excel.headers["content-type"]
    assert len(res_excel.content) > 100
