"""Unit tests for IndecClient with Bearer auth, SQLite caching, and error handling."""

from datetime import UTC, datetime, timedelta

import httpx
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.app.clients.indec_client import (
    DATASET_REGISTRY,
    IndecAuthenticationError,
    IndecAuthError,
    IndecClient,
    IndecNetworkError,
)
from backend.app.database import Base, IndecCache


@pytest.fixture
def test_db():
    """In-memory SQLite database session fixture."""
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    try:
        yield session
    finally:
        session.close()


def test_dataset_registry_contains_all_8_key_series():
    """Verify that DATASET_REGISTRY contains all 8 required key series and valid metadata."""
    required_series = [
        "ipc_general",
        "ipc_core",
        "emae_general",
        "ipi_manuf",
        "cbt",
        "eph_desempleo",
        "ica_saldo",
        "icc_general",
    ]

    for series_id in required_series:
        assert series_id in DATASET_REGISTRY, (
            f"Series '{series_id}' missing in DATASET_REGISTRY"
        )
        entry = DATASET_REGISTRY[series_id]
        assert "endpoint" in entry, f"Missing 'endpoint' in {series_id}"
        assert entry["endpoint"].startswith("/"), (
            f"Endpoint should start with / in {series_id}"
        )
        assert "name" in entry
        assert "category" in entry
        assert "unit" in entry
        assert "frequency" in entry

    # Verify specific expected endpoints
    assert DATASET_REGISTRY["ipc_general"]["endpoint"] == "/ipc_nacional"
    assert DATASET_REGISTRY["ipc_core"]["endpoint"] == "/ipc_nacional"
    assert DATASET_REGISTRY["emae_general"]["endpoint"] == "/estimador-mensual-de-actividad-economica-nivel-general"
    assert DATASET_REGISTRY["ipi_manuf"]["endpoint"] == "/ipi_manufacturero"
    assert DATASET_REGISTRY["cbt"]["endpoint"] == "/valorizacion_canastas_cba_cbt"
    assert DATASET_REGISTRY["eph_desempleo"]["endpoint"] == "/mercado_trabajo_eph"
    assert DATASET_REGISTRY["icc_general"]["endpoint"] == "/icc_precios_construccion"


def test_bearer_header_injection_on_request():
    """Verify that Authorization: Bearer <token> is injected in outgoing requests."""
    captured_requests = []

    def handler(request: httpx.Request) -> httpx.Response:
        captured_requests.append(request)
        return httpx.Response(200, json=[{"periodo": "2026-09", "valor": 3.5}])

    mock_transport = httpx.MockTransport(handler)
    client = IndecClient(token="test_jwt_secret_token", transport=mock_transport)

    result = client.fetch_series("ipc_general")
    assert len(result) == 1
    assert result[0]["valor"] == 3.5

    assert len(captured_requests) == 1
    req = captured_requests[0]
    assert req.headers.get("authorization") == "Bearer test_jwt_secret_token"
    assert req.headers.get("accept") == "application/json"
    assert "api.indec.gob.ar" in str(req.url)
    assert "ipc" in str(req.url)
    client.close()


def test_exception_raised_when_token_is_missing():
    """Verify that an authentication error is raised without network calls when token is missing."""
    client = IndecClient(token="")

    with pytest.raises(IndecAuthError) as exc_info:
        client.fetch_series("ipc_general")

    assert "INDEC_API_TOKEN" in str(exc_info.value)
    # Also verify IndecAuthenticationError alias works
    assert issubclass(IndecAuthError, IndecAuthenticationError)


def test_http_401_unauthorized_handling():
    """Verify that HTTP 401 raises IndecAuthError."""

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, text="Unauthorized: Token expired or invalid")

    mock_transport = httpx.MockTransport(handler)
    client = IndecClient(token="expired_token", transport=mock_transport)

    with pytest.raises(IndecAuthError) as exc_info:
        client.fetch_series("emae_general")

    assert "401" in str(exc_info.value)
    client.close()


def test_http_403_forbidden_handling():
    """Verify that HTTP 403 raises IndecAuthError."""

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(403, text="Forbidden: Access denied")

    mock_transport = httpx.MockTransport(handler)
    client = IndecClient(token="invalid_token", transport=mock_transport)

    with pytest.raises(IndecAuthError) as exc_info:
        client.fetch_series("ipi_manuf")

    assert "403" in str(exc_info.value)
    client.close()


def test_http_500_server_error_handling():
    """Verify that HTTP 500 raises IndecNetworkError and does NOT fallback to mock data."""

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="Internal Server Error")

    mock_transport = httpx.MockTransport(handler)
    client = IndecClient(token="valid_token", transport=mock_transport)

    with pytest.raises(IndecNetworkError) as exc_info:
        client.fetch_series("cbt")

    assert "500" in str(exc_info.value)
    client.close()


def test_network_timeout_handling():
    """Verify that network timeout raises IndecNetworkError and does NOT fallback to mock data."""

    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("Connection timed out", request=request)

    mock_transport = httpx.MockTransport(handler)
    client = IndecClient(token="valid_token", transport=mock_transport)

    with pytest.raises(IndecNetworkError) as exc_info:
        client.fetch_series("eph_desempleo")

    assert "Tiempo de espera agotado" in str(exc_info.value)
    client.close()


def test_network_connection_failure_handling():
    """Verify that network connect error raises IndecNetworkError."""

    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("Could not resolve host", request=request)

    mock_transport = httpx.MockTransport(handler)
    client = IndecClient(token="valid_token", transport=mock_transport)

    with pytest.raises(IndecNetworkError) as exc_info:
        client.fetch_series("ica_saldo")

    assert "Error de conexión" in str(exc_info.value)
    client.close()


def test_cache_miss_fetches_and_persists_to_sqlite(test_db):
    """Verify that cache miss fetches via HTTP and writes payload into IndecCache."""

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=[{"periodo": "2026-08", "indice": 105.2}])

    mock_transport = httpx.MockTransport(handler)
    client = IndecClient(token="valid_token", transport=mock_transport)

    # Initial state: cache empty
    assert test_db.query(IndecCache).count() == 0

    data = client.fetch_series("icc_general", db=test_db)
    assert len(data) == 1
    assert data[0]["indice"] == 105.2

    # Verification: entry stored in SQLite
    assert test_db.query(IndecCache).count() == 1
    cached_entry = (
        test_db.query(IndecCache)
        .filter(
            IndecCache.variable_id == "icc_general",
            IndecCache.period == "all",
        )
        .first()
    )
    assert cached_entry is not None
    assert cached_entry.raw_payload == [{"periodo": "2026-08", "indice": 105.2}]
    client.close()


def test_cache_hit_returns_stored_payload_without_http(test_db):
    """Verify that cache hit returns stored payload without making HTTP request."""
    # Seed cache
    cached_payload = [{"periodo": "2026-09", "valor": 99.9, "cached": True}]
    entry = IndecCache(
        variable_id="ipc_general",
        period="2026-09",
        raw_payload=cached_payload,
        cached_at=datetime.now(UTC),
    )
    test_db.add(entry)
    test_db.commit()

    http_called = []

    def handler(request: httpx.Request) -> httpx.Response:
        http_called.append(True)
        return httpx.Response(500, text="Should not be called")

    mock_transport = httpx.MockTransport(handler)
    # Even with missing token or broken transport, cache hit must return payload
    client = IndecClient(token=None, transport=mock_transport)

    result = client.fetch_series("ipc_general", period="2026-09", db=test_db)
    assert result == cached_payload
    assert len(http_called) == 0  # No HTTP request made!
    client.close()


def test_cache_ttl_expiration_triggers_network_fetch(test_db):
    """Verify that expired cache entry triggers a network re-fetch."""
    old_time = datetime.now(UTC) - timedelta(seconds=7200)  # 2 hours ago
    stale_payload = [{"periodo": "2026-01", "valor": 1.0}]
    entry = IndecCache(
        variable_id="emae_general",
        period="all",
        raw_payload=stale_payload,
        cached_at=old_time,
    )
    test_db.add(entry)
    test_db.commit()

    fresh_payload = [{"periodo": "2026-09", "valor": 2.5}]

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=fresh_payload)

    mock_transport = httpx.MockTransport(handler)
    # Set TTL to 3600s (1 hour)
    client = IndecClient(
        token="valid_token", cache_ttl_seconds=3600, transport=mock_transport
    )

    result = client.fetch_series("emae_general", db=test_db)
    assert result == fresh_payload

    # Check that SQLite was updated with fresh payload
    updated_entry = (
        test_db.query(IndecCache)
        .filter(
            IndecCache.variable_id == "emae_general",
            IndecCache.period == "all",
        )
        .first()
    )
    assert updated_entry.raw_payload == fresh_payload
    client.close()


def test_unregistered_variable_raises_value_error():
    """Verify that querying an unknown variable raises ValueError."""
    client = IndecClient(token="valid_token")
    with pytest.raises(ValueError) as exc_info:
        client.fetch_series("variable_inexistente_xyz")
    assert "variable_inexistente_xyz" in str(exc_info.value)
    client.close()


def test_context_manager_and_close():
    """Verify context manager protocol __enter__, __exit__, and close()."""

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=[])

    mock_transport = httpx.MockTransport(handler)
    with IndecClient(token="valid_token", transport=mock_transport) as client:
        assert client.client is not None
        assert not client.client.is_closed
        client.fetch_series("ipc_general")

    # Outside with block, client should be closed
    assert client.client.is_closed


def test_get_catalog_and_get_series_alias():
    """Verify get_catalog metadata retrieval and get_series method alias."""

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=[{"test": 123}])

    mock_transport = httpx.MockTransport(handler)
    client = IndecClient(token="valid_token", transport=mock_transport)

    catalog = client.get_catalog()
    assert isinstance(catalog, dict)
    assert len(catalog) >= 8
    assert "ipc_general" in catalog

    # Test get_series alias
    result = client.get_series("ipc_general")
    assert result == [{"test": 123}]
    client.close()


def test_expanded_dataset_registry_covers_all_official_datasets():
    """Verify that DATASET_REGISTRY covers all INDEC official datasets with valid sentence case metadata."""
    assert len(DATASET_REGISTRY) >= 30

    expected_endpoints = {
        "/ipc_nacional",
        "/icc_precios_construccion",
        "/sipm_precios_mayoristas",
        "/redeterminacion_precios_contratos_obras_publicas",
        "/indice_salarios",
        "/estimador-mensual-de-actividad-economica-nivel-general",
        "/estimador-mensual-de-actividad-economica-sectores",
        "/ipi_manufacturero",
        "/ipi_minero",
        "/mercado_trabajo_eph",
        "/valorizacion_canastas_cba_cbt",
        "/pobreza_eph",
        "/canasta-crianza",
        "/comercio_exterior_exportacion_bienes",
        "/comercio_exterior_importacion_bienes",
        "/proyecciones_poblacion_jurisdiccion_2022_2040",
        "/estimaciones_poblacion_departamento_2022_2035",
    }

    registered_endpoints = {entry["endpoint"] for entry in DATASET_REGISTRY.values()}
    for ep in expected_endpoints:
        assert ep in registered_endpoints, f"Expected endpoint {ep} not present in DATASET_REGISTRY"

    # Sentence case verification: no title case
    for var_id, entry in DATASET_REGISTRY.items():
        name = entry["name"]
        cat = entry["category"]
        desc = entry["description"]
        assert name and name[0].isupper(), f"Name in {var_id} should start with capital: {name}"
        assert cat and cat[0].isupper(), f"Category in {var_id} should start with capital: {cat}"
        assert desc and desc[0].isupper(), f"Description in {var_id} should start with capital: {desc}"


def test_normalize_indec_date_semesters_and_annual():
    """Verify normalize_indec_date parses semestral and annual formats to ISO dates."""
    from backend.app.services.indec_service import normalize_indec_date

    assert normalize_indec_date("20261S") == "2026-06-30"
    assert normalize_indec_date("20262S") == "2026-12-31"
    assert normalize_indec_date("2026-S1") == "2026-06-30"
    assert normalize_indec_date("2026-2S") == "2026-12-31"
    assert normalize_indec_date("2022") == "2022-01-01"
    assert normalize_indec_date("202610") == "2026-10-01"
    assert normalize_indec_date("20262T") == "2026-06-30"


def test_extract_indec_value_with_target_field():
    """Verify extract_indec_value correctly extracts target_field and falls back gracefully."""
    from backend.app.services.indec_service import extract_indec_value

    record = {
        "periodo": "20261S",
        "tasa_pobreza_personas": "32.3",
        "tasa_pobreza_hogares": 24.4,
        "tot_men1": 591320.30,
        "poblacion": "46135579",
    }

    assert extract_indec_value(record, target_field="tasa_pobreza_personas") == 32.3
    assert extract_indec_value(record, target_field="tasa_pobreza_hogares") == 24.4
    assert extract_indec_value(record, target_field="tot_men1") == 591320.30
    assert extract_indec_value(record, target_field="poblacion") == 46135579.0


def test_indec_service_aggregation_and_scaling():
    """Verify that get_series aggregates multi-row observations by date when aggregate='sum'."""
    from backend.app.services.indec_service import IndecService

    mock_records = [
        {"Periodo": "202609", "rubro_cod": "1", "pais_cod": "IT", "valor_FOB": 1000000.0},
        {"Periodo": "202609", "rubro_cod": "1", "pais_cod": "US", "valor_FOB": 2000000.0},
        {"Periodo": "202608", "rubro_cod": "1", "pais_cod": "IT", "valor_FOB": 500000.0},
    ]

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=mock_records)

    mock_transport = httpx.MockTransport(handler)
    client = IndecClient(token="valid_token", transport=mock_transport)
    service = IndecService(client=client)

    series = service.get_series("comex_exportaciones_primarios", timeframe="1Y")
    assert len(series) == 2
    # 2026-08: 500,000 * 1e-6 = 0.5
    assert series[0]["fecha"] == "2026-08-01"
    assert series[0]["valor"] == 0.5
    # 2026-09: (1,000,000 + 2,000,000) * 1e-6 = 3.0
    assert series[1]["fecha"] == "2026-09-01"
    assert series[1]["valor"] == 3.0
    client.close()
