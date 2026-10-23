"""Integration tests for Macroeconomic and System REST API endpoints."""

from starlette.testclient import TestClient


def test_get_indicators_summary_endpoint(client: TestClient):
    """Verify GET /api/macro/indicators/summary returns 200 and structured data."""
    response = client.get("/api/macro/indicators/summary")
    assert response.status_code == 200
    data = response.json()
    assert "indicators" in data
    assert "fx_spreads" in data
    assert "1" in data["indicators"]


def test_get_macro_series_endpoint(client: TestClient):
    """Verify GET /api/macro/series/{variable_id} with and without date range filtering."""
    # Full history
    res1 = client.get("/api/macro/series/1")
    assert res1.status_code == 200
    series = res1.json()
    assert isinstance(series, list)
    assert len(series) > 0
    assert "date" in series[0]
    assert "value" in series[0]

    # Filtered by date
    res2 = client.get("/api/macro/series/1?desde=2026-02-01&hasta=2026-02-20")
    assert res2.status_code == 200
    filtered = res2.json()
    assert isinstance(filtered, list)
    assert all("2026-02-01" <= item["date"] <= "2026-02-20" for item in filtered)


def test_get_fx_spreads_endpoint(client: TestClient):
    """Verify GET /api/macro/fx-spreads returns base and parallel spreads."""
    response = client.get("/api/macro/fx-spreads?official_base=mayorista")
    assert response.status_code == 200
    data = response.json()
    assert "base" in data
    assert "spreads" in data
    assert "mep" in data["spreads"]
    assert "blue" in data["spreads"]
    assert "brecha_pct" in data["spreads"]["mep"]


def test_get_catalog_endpoint(client: TestClient):
    """Verify GET /api/macro/catalog with and without search query."""
    # All catalog
    res_all = client.get("/api/macro/catalog")
    assert res_all.status_code == 200
    catalog = res_all.json()
    assert isinstance(catalog, list)
    assert len(catalog) >= 5

    # Filtered search
    res_search = client.get("/api/macro/catalog?q=Reservas")
    assert res_search.status_code == 200
    matched = res_search.json()
    assert len(matched) >= 1
    assert any("Reservas" in item["name"] for item in matched)


def test_get_system_status_endpoint(client: TestClient):
    """Verify GET /api/system/status returns 200 and operational metrics."""
    response = client.get("/api/system/status")
    assert response.status_code == 200
    status_data = response.json()
    assert status_data["status"] == "ok"
    assert status_data["database"] == "connected"
    assert "mock_mode" in status_data
    assert "timestamp" in status_data


def test_get_fx_history_endpoint(client: TestClient):
    """Verify GET /api/macro/fx/history returns rates for all 4 cotizaciones."""
    response = client.get("/api/macro/fx/history")
    assert response.status_code == 200
    data = response.json()
    assert "rates" in data
    rates = data["rates"]
    for key in ("oficial", "mep", "ccl", "blue"):
        assert key in rates
        assert len(rates[key]) > 0
