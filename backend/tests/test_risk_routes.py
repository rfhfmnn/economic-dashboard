"""Integration tests for Credit Risk and Batch Query REST API routes."""

import io
from starlette.testclient import TestClient


def test_get_single_debtor_success(client: TestClient):
    """Verify GET /api/risk/deudores/{cuit} returns 200 and complete credit report."""
    response = client.get("/api/risk/deudores/20-30123456-3")
    assert response.status_code == 200
    data = response.json()
    assert data["cuit"] == "20301234563"
    assert data["cuit_formateado"] == "20-30123456-3"
    assert "denominacion" in data
    assert "deuda_total" in data
    assert "peor_situacion" in data
    assert "entidades" in data
    assert "historial_24m" in data
    assert "alertas_tempranas" in data
    assert "nivel_riesgo" in data


def test_get_single_debtor_invalid_cuit_returns_400(client: TestClient):
    """Verify GET /api/risk/deudores/{invalid_cuit} returns 400 Bad Request."""
    response = client.get("/api/risk/deudores/20-99999999-1")
    assert response.status_code == 400
    detail = response.json().get("detail", "")
    assert "CUIT" in detail and "Módulo 11" in detail


def test_batch_evaluation_json(client: TestClient):
    """Verify POST /api/risk/batch with JSON list of CUITs."""
    payload = {
        "portfolio_name": "SME Portfolio",
        "cuits": [
            "20-30123456-3",  # Valid normal debtor
            "30-71234567-1",  # Valid distressed debtor
            "20-99999999-1",  # Invalid check digit
        ],
    }
    response = client.post("/api/risk/batch", json=payload)
    assert response.status_code == 200
    result = response.json()
    assert result["portfolio_name"] == "SME Portfolio"
    assert result["total_cuits"] == 3
    assert result["valid_count"] == 2
    assert result["invalid_count"] == 1
    assert len(result["debtors"]) == 2
    assert len(result["invalid_items"]) == 1

    # Check sorting: worst situation first
    assert result["debtors"][0]["peor_situacion"] >= result["debtors"][1]["peor_situacion"]


def test_batch_evaluation_file_upload(client: TestClient):
    """Verify POST /api/risk/batch with multipart CSV file upload."""
    csv_content = "cuit,notes\n20301234563,Cliente A\n30712345671,Cliente B\n27409876549,Cliente C\n"
    file_bytes = io.BytesIO(csv_content.encode("utf-8"))

    response = client.post(
        "/api/risk/batch",
        files={"file": ("portfolio_test.csv", file_bytes, "text/csv")},
    )
    assert response.status_code == 200
    result = response.json()
    assert result["valid_count"] == 3
    assert result["invalid_count"] == 0
    assert result["total_debt"] > 0


def test_batch_empty_request_returns_400(client: TestClient):
    """Verify POST /api/risk/batch with empty body returns 400."""
    response = client.post("/api/risk/batch", json={"cuits": []})
    assert response.status_code == 400
