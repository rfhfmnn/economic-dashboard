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
