"""Tests for workbench backend service and catalog endpoint."""

from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.services.workbench_service import get_unified_catalog

client = TestClient(app)


def test_get_unified_catalog():
    catalog = get_unified_catalog()
    assert len(catalog) > 10

    # Ensure all sources are present
    sources = {item["source"] for item in catalog}
    assert "BCRA" in sources
    assert "INDEC" in sources
    assert "FX" in sources
    assert "REM" in sources

    # Filter test
    filtered = get_unified_catalog(q="inflacion")
    assert len(filtered) > 0
    from backend.app.services.workbench_service import _strip_accents
    for item in filtered:
        text = _strip_accents(f"{item['name']} {item['category']} {item.get('description', '')} {item['id']}".lower())
        assert "inflacion" in text



def test_workbench_catalog_endpoint():
    response = client.get("/api/macro/workbench/catalog")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) > 0

    response_filtered = client.get("/api/macro/workbench/catalog?q=dolar")
    assert response_filtered.status_code == 200
    filtered_data = response_filtered.json()
    assert len(filtered_data) > 0
