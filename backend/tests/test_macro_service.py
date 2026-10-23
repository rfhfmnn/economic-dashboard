"""Unit tests for MacroService data ingestion, caching, and series querying."""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.app.clients.bcra_client import BCRAClient
from backend.app.clients.fx_client import FXClient
from backend.app.database import Base, MacroSeries, MacroVariable, init_db
from backend.app.services.macro_service import MacroService


@pytest.fixture
def db_session():
    """In-memory SQLite session fixture."""
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    init_db(bind_engine=engine)
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = TestingSession()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture
def macro_service():
    """MacroService instance configured with mock BCRA and FX clients."""
    bcra = BCRAClient(force_mock=True)
    fx = FXClient(force_mock=True)
    return MacroService(bcra_client=bcra, fx_client=fx)


def test_sync_catalog(db_session, macro_service):
    """Verify catalog synchronization and database persistence."""
    catalog = macro_service.sync_catalog(db_session)
    assert len(catalog) > 0

    # Verify query directly from database
    db_vars = db_session.query(MacroVariable).all()
    assert len(db_vars) == len(catalog)
    var_ids = {v.variable_id for v in db_vars}
    assert 1 in var_ids
    assert 27 in var_ids


def test_sync_variable_series_and_deduplication(db_session, macro_service):
    """Verify series points ingestion and deduplication on repeated sync."""
    # First sync
    count_1 = macro_service.sync_variable_series(db_session, variable_id=1)
    assert count_1 > 0

    total_in_db = db_session.query(MacroSeries).filter(MacroSeries.variable_id == 1).count()
    assert total_in_db == count_1

    # Second sync of identical points must not duplicate rows
    count_2 = macro_service.sync_variable_series(db_session, variable_id=1)
    assert count_2 == count_1

    total_after_resync = db_session.query(MacroSeries).filter(MacroSeries.variable_id == 1).count()
    assert total_after_resync == count_1


def test_get_variable_history_with_date_filters(db_session, macro_service):
    """Verify historical points query with date range filtering and ascending sort."""
    # Query without pre-sync triggers automatic initial sync
    history = macro_service.get_variable_history(
        db_session, variable_id=1, desde="2026-02-01", hasta="2026-03-01"
    )
    assert len(history) > 0
    # Ensure sorted ascending
    dates = [h["date"] for h in history]
    assert dates == sorted(dates)
    assert all("2026-02-01" <= d <= "2026-03-01" for d in dates)


def test_get_indicators_summary(db_session, macro_service):
    """Verify indicators summary aggregates key metrics and FX spreads."""
    summary = macro_service.get_indicators_summary(db_session)
    assert "indicators" in summary
    assert "fx_spreads" in summary
    assert "last_updated" in summary

    indicators = summary["indicators"]
    assert "1" in indicators
    assert indicators["1"]["value"] is not None
    assert "27" in indicators
    assert "28" in indicators

    fx_spreads = summary["fx_spreads"]
    assert "base" in fx_spreads
    assert "spreads" in fx_spreads
    assert "mep" in fx_spreads["spreads"]
    assert "blue" in fx_spreads["spreads"]


def test_get_catalog_search(db_session, macro_service):
    """Verify catalog search filtering by name or category."""
    # Search specific term
    res_reservas = macro_service.get_catalog(db_session, query="Reservas")
    assert len(res_reservas) >= 1
    assert any("Reservas" in item["name"] for item in res_reservas)

    # Search category
    res_tasas = macro_service.get_catalog(db_session, query="Tasas")
    assert len(res_tasas) >= 1
    assert any(item["category"] == "Tasas" for item in res_tasas)

    # Search non-existent term
    res_empty = macro_service.get_catalog(db_session, query="NonExistentVariableTerm999")
    assert len(res_empty) == 0
