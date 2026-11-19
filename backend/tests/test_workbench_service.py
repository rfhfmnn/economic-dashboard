"""Tests for workbench backend service and catalog endpoint."""

from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.services.workbench_service import get_unified_catalog, _strip_accents

client = TestClient(app)


def test_get_unified_catalog():
    catalog = get_unified_catalog()
    assert len(catalog) > 10

    # Ensure all sources are present in top items
    sources = {item["source"] for item in catalog}
    assert "BCRA" in sources
    assert "INDEC" in sources
    assert "FX" in sources
    assert "REM" in sources

    # Filter test with accent stripping
    filtered = get_unified_catalog(q="inflacion")
    assert len(filtered) > 0
    for item in filtered:
        text = _strip_accents(f"{item['name']} {item['category']} {item.get('description', '')} {item['id']}".lower())
        assert "inflacion" in text


def test_get_unified_catalog_full_count_and_sources():
    # Without limit, should expose > 1,100 series
    full_catalog = get_unified_catalog(limit=None)
    assert len(full_catalog) >= 1100

    bcra_items = [item for item in full_catalog if item["source"] == "BCRA"]
    indec_items = [item for item in full_catalog if item["source"] == "INDEC"]
    fx_items = [item for item in full_catalog if item["source"] == "FX"]
    rem_items = [item for item in full_catalog if item["source"] == "REM"]

    # Over 1000 BCRA series from database/catalog
    assert len(bcra_items) >= 1000
    # 118 datasets from INDEC DATASET_REGISTRY
    assert len(indec_items) == 118
    # All FX quotes (oficial mayorista, minorista, mep, ccl, blue, tarjeta, cripto)
    assert len(fx_items) >= 7
    fx_ids = {item["id"] for item in fx_items}
    for expected_fx in ["fx_oficial", "fx_minorista", "fx_mep", "fx_ccl", "fx_blue", "fx_tarjeta", "fx_cripto"]:
        assert expected_fx in fx_ids

    # REM forecast series (mediana and top 10)
    assert len(rem_items) >= 8
    rem_ids = {item["id"] for item in rem_items}
    assert "rem_ipc_general" in rem_ids
    assert "rem_ipc_general_top10" in rem_ids
    assert "rem_tipo_cambio" in rem_ids
    assert "rem_tipo_cambio_top10" in rem_ids


def test_get_unified_catalog_filters():
    # Filter by source
    bcra_only = get_unified_catalog(source="BCRA", limit=20)
    assert len(bcra_only) > 0
    assert all(item["source"] == "BCRA" for item in bcra_only)

    fx_only = get_unified_catalog(source="FX")
    assert len(fx_only) >= 7
    assert all(item["source"] == "FX" for item in fx_only)

    rem_only = get_unified_catalog(source="REM")
    assert len(rem_only) >= 8
    assert all(item["source"] == "REM" for item in rem_only)

    indec_only = get_unified_catalog(source="INDEC", limit=10)
    assert len(indec_only) == 10
    assert all(item["source"] == "INDEC" for item in indec_only)

    # Accent-insensitive search
    res_accent = get_unified_catalog(q="dólar")
    res_no_accent = get_unified_catalog(q="dolar")
    assert len(res_accent) == len(res_no_accent)
    assert len(res_accent) > 0

    # Limit parameter
    limited = get_unified_catalog(limit=5)
    assert len(limited) == 5


def test_workbench_catalog_endpoint():
    response = client.get("/api/macro/workbench/catalog")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 50  # Default limit is 50

    # Test with query
    response_filtered = client.get("/api/macro/workbench/catalog?q=dolar")
    assert response_filtered.status_code == 200
    filtered_data = response_filtered.json()
    assert len(filtered_data) > 0

    # Test with source parameter
    response_fx = client.get("/api/macro/workbench/catalog?source=FX")
    assert response_fx.status_code == 200
    fx_data = response_fx.json()
    assert len(fx_data) >= 7
    assert all(item["source"] == "FX" for item in fx_data)

    # Test with custom limit
    response_limit = client.get("/api/macro/workbench/catalog?limit=15")
    assert response_limit.status_code == 200
    assert len(response_limit.json()) == 15
