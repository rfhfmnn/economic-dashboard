"""Integration tests for INDEC macroeconomic REST API endpoints."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
import httpx
import pytest
from starlette.testclient import TestClient

from backend.app.clients.indec_client import (
    DATASET_REGISTRY,
    IndecAuthError,
    IndecClient,
    IndecNetworkError,
)
from backend.app.database import SessionLocal, IndecCache
from backend.app.routes import indec_routes
from backend.app.services.indec_service import (
    KEY_INDEC_INDICATORS,
    IndecService,
    filter_by_timeframe,
    normalize_indec_date,
)


@pytest.fixture(autouse=True)
def clean_indec_cache():
    """Ensure clean IndecCache before and after each test."""
    db = SessionLocal()
    try:
        db.query(IndecCache).delete()
        db.commit()
    finally:
        db.close()
    yield
    db = SessionLocal()
    try:
        db.query(IndecCache).delete()
        db.commit()
    finally:
        db.close()


@pytest.fixture
def db_session():
    """Provides a transactional database session for tests."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def test_normalize_indec_date():
    """Verify normalize_indec_date handles monthly and quarterly periods."""
    # Monthly
    assert normalize_indec_date("2026-09") == "2026-09-01"
    assert normalize_indec_date("2026-09-15") == "2026-09-15"
    assert normalize_indec_date("2026/08") == "2026-08-01"

    # Quarterly T1-T4
    assert normalize_indec_date("2026-T1") == "2026-03-31"
    assert normalize_indec_date("2026-T2") == "2026-06-30"
    assert normalize_indec_date("2026-T3") == "2026-09-30"
    assert normalize_indec_date("2026-T4") == "2026-12-31"

    # Quarterly Q1-Q4
    assert normalize_indec_date("2026-Q1") == "2026-03-31"
    assert normalize_indec_date("2026-Q2") == "2026-06-30"
    assert normalize_indec_date("2026-Q3") == "2026-09-30"
    assert normalize_indec_date("2026-Q4") == "2026-12-31"

    # Quarterly alternate formats
    assert normalize_indec_date("2026T2") == "2026-06-30"
    assert normalize_indec_date("2026-2T") == "2026-06-30"
    assert normalize_indec_date("T3-2026") == "2026-09-30"


def test_filter_by_timeframe():
    """Verify filter_by_timeframe applies 1Y, 2Y, 5Y, and Max filters."""
    points = [
        {"fecha": "2020-01-01", "valor": 10.0},
        {"fecha": "2022-01-01", "valor": 20.0},
        {"fecha": "2024-09-01", "valor": 30.0},
        {"fecha": "2025-09-01", "valor": 40.0},
        {"fecha": "2026-09-01", "valor": 50.0},
    ]

    # Max: all points
    assert len(filter_by_timeframe(points, "Max")) == 5
    assert len(filter_by_timeframe(points, "all")) == 5

    # 1Y: points >= 2025-09-01
    tf_1y = filter_by_timeframe(points, "1Y")
    assert len(tf_1y) == 2
    assert tf_1y[0]["fecha"] == "2025-09-01"
    assert tf_1y[1]["fecha"] == "2026-09-01"

    # 2Y: points >= 2024-09-01
    tf_2y = filter_by_timeframe(points, "2Y")
    assert len(tf_2y) == 3
    assert tf_2y[0]["fecha"] == "2024-09-01"

    # 5Y: points >= 2021-09-01
    tf_5y = filter_by_timeframe(points, "5Y")
    assert len(tf_5y) == 4
    assert tf_5y[0]["fecha"] == "2022-01-01"


def test_get_indec_catalog_all(client: TestClient):
    """Verify GET /api/macro/indec/catalog returns all registered variables."""
    response = client.get("/api/macro/indec/catalog")
    assert response.status_code == 200
    catalog = response.json()
    assert isinstance(catalog, list)
    assert len(catalog) >= 8

    # Verify expected schema on every item
    for item in catalog:
        assert "variable_id" in item
        assert "name" in item
        assert "category" in item
        assert "unit" in item
        assert "frequency" in item
        assert "description" in item

    # Verify all 8 key indicators exist in catalog
    catalog_var_ids = {item["variable_id"] for item in catalog}
    for key_var in KEY_INDEC_INDICATORS:
        assert key_var in catalog_var_ids


def test_get_indec_catalog_with_query_filter(client: TestClient):
    """Verify GET /api/macro/indec/catalog?q=<term> filters by name or category."""
    # Filter by name: "IPC"
    res_ipc = client.get("/api/macro/indec/catalog?q=ipc")
    assert res_ipc.status_code == 200
    ipc_items = res_ipc.json()
    assert len(ipc_items) >= 2
    assert any(i["variable_id"] == "ipc_general" for i in ipc_items)

    # Filter by category: "Precios"
    res_cat = client.get("/api/macro/indec/catalog?q=Precios y Costos")
    assert res_cat.status_code == 200
    cat_items = res_cat.json()
    assert len(cat_items) >= 3
    for i in cat_items:
        assert (
            "Precios y Costos" in i["category"]
            or "precios" in i["name"].lower()
            or "precios" in i["description"].lower()
        )

    # Case-insensitive query
    res_upper = client.get("/api/macro/indec/catalog?q=EMAE")
    assert res_upper.status_code == 200
    assert any(i["variable_id"] == "emae_general" for i in res_upper.json())

    # Empty match returns empty list
    res_none = client.get("/api/macro/indec/catalog?q=nonexistent_xyz_query")
    assert res_none.status_code == 200
    assert res_none.json() == []


def test_get_indec_series_unknown_variable_returns_404(client: TestClient):
    """Verify GET /api/macro/indec/series/{unknown} returns 404 with structured detail."""
    response = client.get("/api/macro/indec/series/variable_desconocida_xyz")
    assert response.status_code == 404
    body = response.json()
    assert "detail" in body
    assert body["detail"] == "Variable 'variable_desconocida_xyz' no encontrada en catálogo INDEC"


def test_get_indec_series_missing_token_returns_401(client: TestClient, monkeypatch):
    """Verify GET /api/macro/indec/series/{var} returns 401 when token is not configured."""
    monkeypatch.delenv("INDEC_API_TOKEN", raising=False)
    # Configure indec_service with client having no token
    unauth_client = IndecClient(token="")
    monkeypatch.setattr(indec_routes, "indec_service", IndecService(client=unauth_client))

    response = client.get("/api/macro/indec/series/ipc_general")
    assert response.status_code == 401
    body = response.json()
    assert "detail" in body
    assert "INDEC_API_TOKEN no configurado en entorno" in body["detail"]


def test_get_indec_series_upstream_network_error_returns_502(client: TestClient, monkeypatch):
    """Verify GET /api/macro/indec/series/{var} returns 502 Bad Gateway on network failure."""
    def error_handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("Connection refused by api.indec.gob.ar", request=request)

    mock_transport = httpx.MockTransport(error_handler)
    mock_client = IndecClient(token="valid_test_token", transport=mock_transport)
    monkeypatch.setattr(indec_routes, "indec_service", IndecService(client=mock_client))

    response = client.get("/api/macro/indec/series/emae_general")
    assert response.status_code == 502
    body = response.json()
    assert "detail" in body
    assert "Error de conexión" in body["detail"]


def test_get_indec_series_success_with_timeframe_and_quarter_normalization(
    client: TestClient, monkeypatch
):
    """Verify GET /api/macro/indec/series/{variable_id} normalizes quarters and filters timeframe."""
    raw_payload = [
        {"periodo": "2024-T3", "valor": 7.6},
        {"periodo": "2024-T4", "valor": 7.0},
        {"periodo": "2025-T1", "valor": 7.7},
        {"periodo": "2025-T2", "valor": 7.6},
        {"periodo": "2025-T3", "valor": 6.9},
        {"periodo": "2025-T4", "valor": 6.5},
        {"periodo": "2026-T1", "valor": 7.7},
        {"periodo": "2026-T2", "valor": 7.6},
    ]

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=raw_payload)

    mock_transport = httpx.MockTransport(handler)
    mock_client = IndecClient(token="valid_test_token", transport=mock_transport)
    monkeypatch.setattr(indec_routes, "indec_service", IndecService(client=mock_client))

    # Test 1Y filter (latest is 2026-06-30, so 1Y cutoff is 2025-06-30)
    response_1y = client.get("/api/macro/indec/series/eph_desempleo?timeframe=1Y")
    assert response_1y.status_code == 200
    points_1y = response_1y.json()
    assert isinstance(points_1y, list)
    assert len(points_1y) >= 4

    # Verify chronological ascending order
    for idx in range(len(points_1y) - 1):
        assert points_1y[idx]["fecha"] < points_1y[idx + 1]["fecha"]

    # Verify quarter-end normalization
    assert points_1y[-1]["fecha"] == "2026-06-30"
    assert points_1y[-1]["valor"] == 7.6
    assert points_1y[-2]["fecha"] == "2026-03-31"
    assert points_1y[-2]["valor"] == 7.7

    # Test Max timeframe returns all points
    response_max = client.get("/api/macro/indec/series/eph_desempleo?timeframe=Max")
    assert response_max.status_code == 200
    points_max = response_max.json()
    assert len(points_max) == len(raw_payload)
    assert points_max[0]["fecha"] == "2024-09-30"


def test_get_indec_summary_success_with_8_indicators(client: TestClient, monkeypatch):
    """Verify GET /api/macro/indec/summary returns HTTP 200 with all 8 key indicators and deltas."""
    # Build realistic multi-month history for each of the 8 key series
    def handler(request: httpx.Request) -> httpx.Response:
        url_path = request.url.path
        if "ipc" in url_path:
            return httpx.Response(
                200,
                json=[
                    {"periodo": "2025-08", "valor": 4.2},
                    {"periodo": "2025-09", "valor": 3.8},
                    {"periodo": "2026-08", "valor": 4.0},
                    {"periodo": "2026-09", "valor": 3.5},
                ],
            )
        elif "emae" in url_path:
            return httpx.Response(
                200,
                json=[
                    {"periodo": "2025-08", "valor": 100.0},
                    {"periodo": "2026-07", "valor": 104.0},
                    {"periodo": "2026-08", "valor": 105.0},
                ],
            )
        elif "ipi" in url_path:
            return httpx.Response(
                200,
                json=[
                    {"periodo": "2026-07", "valor": 95.0},
                    {"periodo": "2026-08", "valor": 96.5},
                ],
            )
        elif "canastas" in url_path:
            return httpx.Response(
                200,
                json=[
                    {"periodo": "2025-09", "valor": 800000.0},
                    {"periodo": "2026-08", "valor": 950000.0},
                    {"periodo": "2026-09", "valor": 980000.0},
                ],
            )
        elif "eph" in url_path or "mercado_trabajo" in url_path:
            return httpx.Response(
                200,
                json=[
                    {"periodo": "2025-T2", "valor": 7.6},
                    {"periodo": "2026-T1", "valor": 7.7},
                    {"periodo": "2026-T2", "valor": 7.6},
                ],
            )
        elif "ica" in url_path or "comercio" in url_path:
            return httpx.Response(
                200,
                json=[
                    {"periodo": "2026-08", "valor": 1200.0},
                    {"periodo": "2026-09", "valor": 1500.0},
                ],
            )
        elif "icc" in url_path:
            return httpx.Response(
                200,
                json=[
                    {"periodo": "2026-08", "valor": 2.8},
                    {"periodo": "2026-09", "valor": 2.5},
                ],
            )
        return httpx.Response(200, json=[])

    mock_transport = httpx.MockTransport(handler)
    mock_client = IndecClient(token="valid_test_token", transport=mock_transport)
    monkeypatch.setattr(indec_routes, "indec_service", IndecService(client=mock_client))

    response = client.get("/api/macro/indec/summary")
    assert response.status_code == 200
    data = response.json()
    assert "indicators" in data
    indicators = data["indicators"]
    assert isinstance(indicators, list)
    assert len(indicators) == 8

    # Verify all 8 required series are present in the list
    var_ids = [ind["variable_id"] for ind in indicators]
    for expected_var in KEY_INDEC_INDICATORS:
        assert expected_var in var_ids, f"Indicator '{expected_var}' missing in summary"

    # Verify structure and fields of indicators
    for ind in indicators:
        assert "variable_id" in ind
        assert "name" in ind
        assert "category" in ind
        assert "unit" in ind
        assert "value" in ind
        assert "date" in ind
        assert "delta_mom" in ind
        assert "delta_yoy" in ind
        assert ind["value"] is not None
        assert ind["date"] is not None

    # Verify specific indicator values and calculated deltas
    ipc_ind = next(i for i in indicators if i["variable_id"] == "ipc_general")
    assert ipc_ind["value"] == 3.5
    assert ipc_ind["date"] == "2026-09-01"
    # MoM: (3.5 - 4.0) / 4.0 * 100 = -12.5%
    assert ipc_ind["delta_mom"] == -12.5
    # YoY: (3.5 - 3.8) / 3.8 * 100 = -7.89%
    assert ipc_ind["delta_yoy"] == -7.89

    cbt_ind = next(i for i in indicators if i["variable_id"] == "cbt")
    assert cbt_ind["value"] == 980000.0
    assert cbt_ind["date"] == "2026-09-01"
    # MoM: (980000 - 950000) / 950000 * 100 = 3.16%
    assert cbt_ind["delta_mom"] == 3.16
    # YoY: (980000 - 800000) / 800000 * 100 = 22.5%
    assert cbt_ind["delta_yoy"] == 22.5


def test_get_indec_summary_missing_token_returns_401(client: TestClient, monkeypatch):
    """Verify GET /api/macro/indec/summary returns 401 when token is missing."""
    monkeypatch.delenv("INDEC_API_TOKEN", raising=False)
    unauth_client = IndecClient(token="")
    monkeypatch.setattr(indec_routes, "indec_service", IndecService(client=unauth_client))

    response = client.get("/api/macro/indec/summary")
    assert response.status_code == 401
    body = response.json()
    assert "detail" in body
    assert "INDEC_API_TOKEN no configurado en entorno" in body["detail"]


def test_get_indec_summary_upstream_network_error_returns_502(
    client: TestClient, monkeypatch
):
    """Verify GET /api/macro/indec/summary returns 502 on upstream timeout or failure."""
    def timeout_handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("Server timeout after 10s", request=request)

    mock_transport = httpx.MockTransport(timeout_handler)
    mock_client = IndecClient(token="valid_test_token", transport=mock_transport)
    monkeypatch.setattr(indec_routes, "indec_service", IndecService(client=mock_client))

    response = client.get("/api/macro/indec/summary")
    assert response.status_code == 502
    body = response.json()
    assert "detail" in body
    assert "Tiempo de espera agotado" in body["detail"]


def test_sqlite_cache_hit_and_refresh_behavior(client: TestClient, db_session, monkeypatch):
    """Verify that cached data is served from SQLite and refresh=true forces refetch."""
    cached_payload = [
        {"periodo": "2026-09", "valor": 99.9},
    ]
    # Seed cache
    db_session.query(IndecCache).filter(IndecCache.variable_id == "ipc_general").delete()
    entry = IndecCache(
        variable_id="ipc_general",
        period="all",
        raw_payload=cached_payload,
        cached_at=datetime.now(UTC),
    )
    db_session.add(entry)
    db_session.commit()

    http_calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        http_calls.append(str(request.url))
        return httpx.Response(200, json=[{"periodo": "2026-09", "valor": 100.0}])

    mock_transport = httpx.MockTransport(handler)
    mock_client = IndecClient(token="valid_test_token", transport=mock_transport)
    monkeypatch.setattr(indec_routes, "indec_service", IndecService(client=mock_client))

    # 1. Normal call -> cache hit (no HTTP call)
    res_cached = client.get("/api/macro/indec/series/ipc_general")
    assert res_cached.status_code == 200
    data_cached = res_cached.json()
    assert len(data_cached) == 1
    assert data_cached[0]["valor"] == 99.9
    assert len(http_calls) == 0

    # 2. Call with refresh=true -> forces network refetch
    res_refreshed = client.get("/api/macro/indec/series/ipc_general?refresh=true")
    assert res_refreshed.status_code == 200
    data_refreshed = res_refreshed.json()
    assert len(data_refreshed) == 1
    assert data_refreshed[0]["valor"] == 100.0
    assert len(http_calls) == 1
