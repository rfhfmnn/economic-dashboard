"""Unit tests for BCRAClient resilience and mock fallback mechanisms."""

from unittest.mock import MagicMock, patch
import httpx
import pytest

from backend.app.clients.bcra_client import BCRAClient
from backend.app.clients.mock_data import (
    MOCK_PRINCIPALES_VARIABLES,
    get_mock_cheques_rechazados,
    get_mock_deudas,
    get_mock_variable_series,
)


@pytest.fixture
def mock_bcra_client():
    """BCRAClient initialized in explicit mock mode."""
    client = BCRAClient(force_mock=True)
    yield client
    client.close()


@pytest.fixture
def network_bcra_client():
    """BCRAClient initialized with force_mock=False to test network fallback behavior."""
    client = BCRAClient(base_url="https://invalid-bcra-domain-test.gob.ar", force_mock=False, timeout=1.0)
    yield client
    client.close()


def test_get_principales_variables_force_mock(mock_bcra_client: BCRAClient):
    """Verify principales variables retrieval under force_mock."""
    variables = mock_bcra_client.get_principales_variables()
    assert isinstance(variables, list)
    assert len(variables) > 0
    ids = {v["idVariable"] for v in variables}
    assert 1 in ids  # Reservas
    assert 5 in ids  # Dólar Mayorista
    assert 27 in ids # Base Monetaria


def test_get_datos_variable_force_mock(mock_bcra_client: BCRAClient):
    """Verify historical variable series retrieval under force_mock."""
    series = mock_bcra_client.get_datos_variable(id_variable=1, desde="2026-01-01", hasta="2026-03-20")
    assert isinstance(series, list)
    assert len(series) > 0
    assert series[0]["idVariable"] == 1
    assert "fecha" in series[0]
    assert "valor" in series[0]


def test_get_deudas_profiles_force_mock(mock_bcra_client: BCRAClient):
    """Verify deudas profiles for normal, high-risk, and clean borrowers."""
    # 1. Normal Borrower
    res_normal = mock_bcra_client.get_deudas("20-30123456-7")
    assert res_normal["status"] == 200
    results_normal = res_normal["results"]
    assert results_normal["identificacion"] == "20301234567"
    assert len(results_normal["periodos"]) == 24
    assert results_normal["periodos"][0]["entidades"][0]["situacion"] == 1

    # 2. High Risk Borrower
    res_risk = mock_bcra_client.get_deudas("30712345678")
    assert res_risk["status"] == 200
    entities = res_risk["results"]["periodos"][0]["entidades"]
    entity_names = [e["entidad"] for e in entities]
    assert any("FINTECH" in name or "FIDEICOMISO" in name for name in entity_names)

    # 3. Clean Borrower
    res_clean = mock_bcra_client.get_deudas("27409876543")
    assert res_clean["status"] == 200
    assert len(res_clean["results"]["periodos"]) == 0


def test_get_cheques_rechazados_force_mock(mock_bcra_client: BCRAClient):
    """Verify bounced checks query for debtor with unpaid checks."""
    res_cheques = mock_bcra_client.get_cheques_rechazados("30712345678")
    assert res_cheques["status"] == 200
    causales = res_cheques["results"]["causales"]
    assert len(causales) >= 2
    assert causales[0]["causal"] == "Sin fondos suficientes"
    assert causales[0]["monto"] > 0
    assert causales[0]["estadoMulta"] == "Impaga"


def test_network_failure_triggers_seamless_fallback(network_bcra_client: BCRAClient):
    """Verify that network connection failure or DNS error triggers fallback without crashing."""
    # When querying an unreachable domain with force_mock=False, client must seamlessly fallback
    variables = network_bcra_client.get_principales_variables()
    assert isinstance(variables, list)
    assert len(variables) > 0

    deudas = network_bcra_client.get_deudas("20301234567")
    assert deudas["status"] == 200
    assert deudas["results"]["identificacion"] == "20301234567"


def test_http_error_status_triggers_fallback():
    """Verify that HTTP 500 error from external endpoint triggers graceful fallback."""
    client = BCRAClient(base_url="https://api.bcra.gob.ar", force_mock=False)
    try:
        mock_resp = MagicMock()
        mock_resp.status_code = 500
        mock_resp.raise_for_status.side_effect = httpx.HTTPStatusError(
            "Internal Server Error", request=MagicMock(), response=mock_resp
        )

        with patch.object(client.client, "get", return_value=mock_resp):
            res = client.get_principales_variables()
            assert isinstance(res, list)
            assert len(res) == len(MOCK_PRINCIPALES_VARIABLES)
    finally:
        client.close()
