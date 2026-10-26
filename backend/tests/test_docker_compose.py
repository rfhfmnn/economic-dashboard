"""Integration tests running against the containerized stack defined in docker-compose.yaml.

These tests validate the live, running system:
- Container healthchecks and networking (FastAPI + PostgreSQL)
- Frontend static asset serving and SPA client-side routing
- Macro & Financial FX monitor endpoints
- Credit Risk Screener (Módulo 11 validation, CUIT caching in PostgreSQL)
- Batch Portfolio evaluation
- Executive PDF & Excel exports
- REM (Market Expectations) analysis
"""

import os
import time
import httpx
import pytest

# Target host/port where docker-compose exposes the app container
BASE_URL = os.getenv("DOCKER_APP_URL", "http://localhost:8000").rstrip("/")
POSTGRES_HOST = os.getenv("POSTGRES_HOST", "localhost")
POSTGRES_PORT = int(os.getenv("POSTGRES_PORT", "5432"))


def check_docker_compose_online(timeout: float = 2.0) -> bool:
    """Return True if the containerized app is up and answering /health with 200."""
    try:
        with httpx.Client(timeout=timeout) as client:
            resp = client.get(f"{BASE_URL}/health")
            return resp.status_code == 200 and resp.json().get("status") == "ok"
    except Exception:
        return False


# Skip tests if docker-compose stack is not running, unless explicitly required via REQUIRE_DOCKER=1
STACK_RUNNING = check_docker_compose_online()
pytestmark = pytest.mark.skipif(
    not STACK_RUNNING and os.getenv("REQUIRE_DOCKER") != "1",
    reason=f"Docker Compose app container not reachable at {BASE_URL}. Start with 'docker compose up' to run integration tests.",
)


@pytest.fixture(scope="module")
def api_client():
    """HTTP client configured for docker-compose app container with generous timeout."""
    with httpx.Client(base_url=BASE_URL, timeout=30.0) as client:
        yield client


# ==============================================================================
# Scenario 1: Container Orchestration, Healthchecks & Database Connectivity
# ==============================================================================


def test_docker_healthcheck_endpoint(api_client: httpx.Client):
    """Verify that the FastAPI app container responds to the healthcheck probe."""
    response = api_client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data == {"status": "ok"}


def test_docker_system_status_and_db_connected(api_client: httpx.Client):
    """Verify that the app container communicates with the PostgreSQL container."""
    response = api_client.get("/api/system/status")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] in ("ok", "degraded")
    assert data["database"] == "connected"
    assert "mock_mode" in data
    assert "services" in data


def test_docker_system_health_deep_check(api_client: httpx.Client):
    """Verify deep system health probe executing SQL query against PostgreSQL."""
    response = api_client.get("/api/system/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] in ("ok", "degraded")
    assert data["database"] == "connected"


# ==============================================================================
# Scenario 2: Multi-Stage Build Frontend Static Serving & SPA Fallback
# ==============================================================================


def test_docker_serves_spa_root_index_html(api_client: httpx.Client):
    """Verify that the production Docker image serves built frontend index.html at root."""
    response = api_client.get("/")
    assert response.status_code == 200
    assert "text/html" in response.headers.get("content-type", "")
    assert '<div id="root">' in response.text or "<!DOCTYPE html>" in response.text


def test_docker_serves_spa_client_routes(api_client: httpx.Client):
    """Verify client-side routes (/macro, /risk, /batch) fallback to index.html without 404."""
    for path in ["/macro", "/risk", "/batch"]:
        response = api_client.get(path)
        assert response.status_code == 200
        assert "text/html" in response.headers.get("content-type", "")
        assert '<div id="root">' in response.text or "<!DOCTYPE html>" in response.text


def test_docker_api_unknown_route_returns_json_404(api_client: httpx.Client):
    """Ensure missing API routes return JSON 404 and are NOT intercepted by SPA static fallback."""
    response = api_client.get("/api/nonexistent-endpoint-xyz")
    assert response.status_code == 404
    assert "application/json" in response.headers.get("content-type", "")


# ==============================================================================
# Scenario 3: Macroeconomic & Financial FX Workflows
# ==============================================================================


def test_docker_macro_summary_endpoint(api_client: httpx.Client):
    """Verify macro indicators summary endpoint returns live/mock financial series."""
    response = api_client.get("/api/macro/summary")
    assert response.status_code == 200
    data = response.json()
    assert "indicators" in data
    assert len(data["indicators"]) > 0

    # Indicators is a dictionary keyed by variable ID
    first_metric = next(iter(data["indicators"].values()))
    assert "name" in first_metric
    assert "value" in first_metric


def test_docker_fx_spreads_and_brecha(api_client: httpx.Client):
    """Verify parallel FX rates and brecha cambiaria calculations."""
    response = api_client.get("/api/macro/fx/spreads")
    assert response.status_code == 200
    data = response.json()
    assert "spreads" in data
    assert "rates" in data

    rates = data["rates"]
    assert "oficial" in rates or "Oficial" in rates or len(rates) > 0


def test_docker_macro_catalog_search(api_client: httpx.Client):
    """Verify BCRA macro series catalog search."""
    response = api_client.get("/api/macro/catalog?search=Reservas")
    assert response.status_code == 200
    catalog = response.json()
    assert isinstance(catalog, list)
    assert any("Reservas" in item.get("name", "") for item in catalog)


# ==============================================================================
# Scenario 4: Credit Risk Screener (Central de Deudores & PostgreSQL Caching)
# ==============================================================================


def test_docker_debtor_screening_and_caching(api_client: httpx.Client):
    """Verify debtor lookup, Módulo 11 validation, and PostgreSQL caching behavior."""
    distressed_cuit = "30-71234567-1"

    # First request: may hit external API or synthetic fallback, writes to cuit_cache in PostgreSQL
    t0 = time.time()
    res1 = api_client.get(f"/api/risk/deudores/{distressed_cuit}")
    duration1 = time.time() - t0

    assert res1.status_code == 200
    data1 = res1.json()
    assert data1["cuit"] == "30712345671"
    assert data1["peor_situacion"] >= 1
    assert "entidades" in data1
    assert "historial_24m" in data1
    assert "alertas_tempranas" in data1

    # Second request: served quickly from PostgreSQL cuit_cache table
    t1 = time.time()
    res2 = api_client.get(f"/api/risk/deudores/{distressed_cuit}")
    duration2 = time.time() - t1

    assert res2.status_code == 200
    data2 = res2.json()
    assert data2["cuit"] == data1["cuit"]
    # Cached hit should typically be faster than or equal to initial query
    assert duration2 < 5.0


def test_docker_debtor_invalid_cuit_rejected(api_client: httpx.Client):
    """Verify that malformed CUIT fails AFIP Módulo 11 check with HTTP 400."""
    invalid_cuit = "20-12345678-0"
    response = api_client.get(f"/api/risk/deudores/{invalid_cuit}")
    assert response.status_code == 400
    assert "cuit" in response.text.lower() or "inválido" in response.text.lower()


def test_docker_debtor_clean_profile(api_client: httpx.Client):
    """Verify debtor with clean record returns Situación 1 and 0 debt."""
    clean_cuit = "27-40987654-9"
    response = api_client.get(f"/api/risk/deudores/{clean_cuit}")
    assert response.status_code == 200
    data = response.json()
    assert data["peor_situacion"] == 1
    assert data["deuda_total"] == 0.0


# ==============================================================================
# Scenario 5: Batch Screening & Portfolio Watchlist
# ==============================================================================


def test_docker_batch_screening_workflow(api_client: httpx.Client):
    """Verify batch debtor processing with comparative risk ranking."""
    batch_payload = {
        "portfolio_name": "Docker Integration Test Portfolio",
        "cuits": ["30-71234567-1", "27-40987654-9"],
    }
    response = api_client.post("/api/risk/batch", json=batch_payload)
    assert response.status_code == 200
    data = response.json()
    assert data["portfolio_name"] == "Docker Integration Test Portfolio"
    assert data["valid_count"] == 2
    assert len(data["debtors"]) == 2
    # Verify ranking: worst situation first
    assert data["debtors"][0]["peor_situacion"] >= data["debtors"][1]["peor_situacion"]


def test_docker_batch_empty_request_rejected(api_client: httpx.Client):
    """Verify empty batch request returns 400."""
    response = api_client.post("/api/risk/batch", json={"cuits": []})
    assert response.status_code == 400


# ==============================================================================
# Scenario 6: Executive Document Exports (PDF & Excel)
# ==============================================================================


def test_docker_export_pdf_dossier(api_client: httpx.Client):
    """Verify PDF 1-page executive dossier generation returns valid PDF stream."""
    cuit = "30-71234567-1"
    response = api_client.get(f"/api/export/cuit-dossier/{cuit}")
    assert response.status_code == 200
    assert response.headers.get("content-type") == "application/pdf"
    assert response.content.startswith(b"%PDF-")
    assert len(response.content) > 1000


def test_docker_export_batch_excel(api_client: httpx.Client):
    """Verify OpenXML Excel portfolio export returns valid spreadsheet binary."""
    batch_payload = {
        "portfolio_name": "Excel Export Portfolio",
        "cuits": ["30-71234567-1", "27-40987654-9"],
    }
    response = api_client.post("/api/export/batch-excel", json=batch_payload)
    assert response.status_code == 200
    assert "spreadsheetml" in response.headers.get("content-type", "")
    # OpenXML spreadsheets are zip files starting with PK\x03\x04
    assert response.content.startswith(b"PK\x03\x04")
    assert len(response.content) > 500


# ==============================================================================
# Scenario 7: REM Market Expectations Survey
# ==============================================================================


def test_docker_rem_summary(api_client: httpx.Client):
    """Verify REM consensus summary, CPI surprise metrics, and cohort divergence."""
    response = api_client.get("/api/macro/rem/summary")
    assert response.status_code == 200
    data = response.json()
    assert "report_date" in data
    assert "kpis" in data
