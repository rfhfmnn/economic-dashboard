"""Tests for workbench Excel export endpoint and generator."""

from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.services.export_service import generate_workbench_excel

client = TestClient(app)


def test_generate_workbench_excel():
    aligned_data = [
        {"fecha": "2026-01-01", "serie_a": 100.5, "serie_b": 200.0},
        {"fecha": "2026-01-02", "serie_a": 105.0, "serie_b": 202.0},
    ]
    stats_data = [
        {
            "id": "serie_a",
            "name": "Serie A",
            "source": "BCRA",
            "ultimoValor": 105.0,
            "fechaUltimo": "2026-01-02",
            "variacionPeriodo": 4.48,
            "minimo": 100.5,
            "maximo": 105.0,
            "desvioEstandar": 3.18,
        }
    ]
    headers = [
        {"key": "serie_a", "name": "Base monetaria"},
        {"key": "serie_b", "name": "Dólar blue"},
    ]

    excel_bytes = generate_workbench_excel(aligned_data, stats_data, headers)
    assert len(excel_bytes) > 0
    assert excel_bytes.startswith(b"PK")  # Zip/Excel signature


def test_workbench_excel_endpoint():
    payload = {
        "aligned_data": [
            {"fecha": "2026-01-01", "serie_a": 100.5},
            {"fecha": "2026-01-02", "serie_a": 105.0},
        ],
        "stats_data": [
            {
                "id": "serie_a",
                "name": "Serie A",
                "source": "BCRA",
                "ultimoValor": 105.0,
                "fechaUltimo": "2026-01-02",
                "variacionPeriodo": 4.48,
                "minimo": 100.5,
                "maximo": 105.0,
                "desvioEstandar": 3.18,
            }
        ],
    }
    response = client.post("/api/export/workbench-excel", json=payload)
    assert response.status_code == 200
    assert (
        response.headers["content-type"]
        == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    assert len(response.content) > 0
