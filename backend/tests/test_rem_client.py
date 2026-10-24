"""Unit tests for ArgentinaDatos REMClient with caching and mock fallback."""

import pytest
from datetime import datetime, timedelta
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.app.clients.rem_client import REMClient
from backend.app.database import Base, RemReport


@pytest.fixture
def test_db():
    """In-memory SQLite database for test isolation."""
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    try:
        yield session
    finally:
        session.close()


def test_normalize_period():
    """Test canonical period formatting."""
    assert REMClient.normalize_period("/finanzas/rem/2026/09") == "2026-09"
    assert REMClient.normalize_period("2026/09") == "2026-09"
    assert REMClient.normalize_period("2026-9") == "2026-09"
    assert REMClient.normalize_period("/finanzas/rem/ultimo") == "ultimo"
    assert REMClient.normalize_period("ultimo") == "ultimo"


def test_get_available_reports_mock_mode():
    """Test available reports in forced mock mode."""
    client = REMClient(force_mock=True)
    reports = client.get_available_reports()
    assert isinstance(reports, list)
    assert len(reports) > 0
    # Must be sorted in reverse chronological order
    assert reports[0] > reports[-1]
    assert "2026-09" in reports
    client.close()


def test_get_report_indicators_structure_mock():
    """Test that indicator items have all required statistical keys."""
    client = REMClient(force_mock=True)
    report = client.get_report("2026-09")
    assert isinstance(report, list)
    assert len(report) > 0

    first = report[0]
    required_keys = [
        "informe", "fecha", "muestra", "indicador", "periodo", "periodoTipo",
        "mediana", "promedio", "desvio", "minimo", "maximo",
        "percentil10", "percentil25", "percentil75", "percentil90", "participantes"
    ]
    for key in required_keys:
        assert key in first, f"Missing key '{key}' in indicator record"

    # Verify both cohorts exist
    muestras = {item["muestra"] for item in report}
    assert "todos" in muestras
    assert "top_10" in muestras

    # Check percentile monotonicity
    for item in report:
        if all(isinstance(item.get(k), (int, float)) for k in ("minimo", "percentil10", "percentil90", "maximo")):
            assert item["minimo"] <= item["percentil10"] <= item["percentil90"] <= item["maximo"]

    client.close()


def test_get_report_sqlite_caching(test_db):
    """Test that reports are properly stored and read from the SQLite cache."""
    client = REMClient(force_mock=True)

    # Initially cache should be empty
    assert test_db.query(RemReport).count() == 0

    # First fetch should persist into DB
    data1 = client.get_report("2026-09", db=test_db)
    assert len(data1) > 0
    assert test_db.query(RemReport).count() == 1

    cached_row = test_db.query(RemReport).filter(RemReport.period == "2026-09").first()
    assert cached_row is not None
    assert cached_row.period == "2026-09"

    # Inject dummy payload in DB to confirm second call hits cache
    dummy_payload = [{"indicador": "TEST_CACHE", "mediana": 999.0}]
    cached_row.raw_payload = dummy_payload
    test_db.commit()

    data2 = client.get_report("2026-09", db=test_db)
    assert data2 == dummy_payload
    assert data2[0]["indicador"] == "TEST_CACHE"

    client.close()


def test_cache_ttl_expiration(test_db):
    """Test that expired cache entries are re-fetched."""
    # Set TTL to 10 seconds
    client = REMClient(force_mock=True, cache_ttl_seconds=10)

    # Populate cache with old timestamp
    old_time = datetime.utcnow() - timedelta(seconds=20)
    stale_payload = [{"indicador": "STALE_DATA", "mediana": 1.0}]
    stale_entry = RemReport(period="2026-09", raw_payload=stale_payload, cached_at=old_time)
    test_db.add(stale_entry)
    test_db.commit()

    # Call get_report: because entry is older than TTL, it should refresh
    fresh_data = client.get_report("2026-09", db=test_db)
    assert fresh_data != stale_payload
    assert fresh_data[0]["indicador"] != "STALE_DATA"

    client.close()


def test_network_fallback_on_invalid_endpoint():
    """Test that non-existent/failing remote endpoint gracefully falls back to mock."""
    client = REMClient(base_url="https://invalid.domain.that.does.not.exist.xyz/api", force_mock=False, timeout=1.0)
    # Should not raise exception
    reports = client.get_available_reports()
    assert isinstance(reports, list)
    assert len(reports) > 0

    report = client.get_report("2026-09")
    assert isinstance(report, list)
    assert len(report) > 0
    client.close()
