"""Unit tests for SQLite database schema, ORM models, and CRUD operations."""

from datetime import date
import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

from backend.app.database import (
    Base,
    CuitCache,
    MacroSeries,
    MacroVariable,
    PortfolioItem,
    init_db,
    get_db,
)


@pytest.fixture
def test_db_session():
    """Provides an isolated in-memory SQLite database session."""
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    init_db(bind_engine=engine)

    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


def test_macro_variable_crud(test_db_session):
    """Verify insertion and querying of macro variables."""
    var = MacroVariable(
        variable_id=1,
        name="Reservas Internacionales",
        unit="Millones de USD",
        category="Monetario",
    )
    test_db_session.add(var)
    test_db_session.commit()

    retrieved = test_db_session.get(MacroVariable, 1)
    assert retrieved is not None
    assert retrieved.name == "Reservas Internacionales"
    assert retrieved.unit == "Millones de USD"
    assert retrieved.category == "Monetario"


def test_macro_series_crud_and_uniqueness(test_db_session):
    """Verify insertion, query, and unique constraint on (variable_id, date)."""
    point1 = MacroSeries(
        variable_id=1,
        date=date(2026, 1, 15),
        value=28450.5,
    )
    test_db_session.add(point1)
    test_db_session.commit()

    retrieved = test_db_session.scalar(
        select(MacroSeries).where(
            MacroSeries.variable_id == 1,
            MacroSeries.date == date(2026, 1, 15),
        )
    )
    assert retrieved is not None
    assert retrieved.value == 28450.5
    assert retrieved.id is not None
    assert retrieved.created_at is not None

    # Duplicate insertion must raise IntegrityError due to UniqueConstraint
    duplicate = MacroSeries(
        variable_id=1,
        date=date(2026, 1, 15),
        value=29000.0,
    )
    test_db_session.add(duplicate)
    with pytest.raises(IntegrityError):
        test_db_session.commit()
    test_db_session.rollback()


def test_cuit_cache_crud(test_db_session):
    """Verify CuitCache storage with JSON payload and updates."""
    cuit_record = CuitCache(
        cuit="20301234567",
        denomination="ACME CORP S.A.",
        worst_situation=2,
        total_debt=1250000.0,
        raw_payload={"entidades": [{"entidad": "BANCO NACION", "situacion": 2, "monto": 1250000}]},
    )
    test_db_session.add(cuit_record)
    test_db_session.commit()

    retrieved = test_db_session.get(CuitCache, "20301234567")
    assert retrieved is not None
    assert retrieved.denomination == "ACME CORP S.A."
    assert retrieved.worst_situation == 2
    assert retrieved.total_debt == 1250000.0
    assert retrieved.raw_payload["entidades"][0]["entidad"] == "BANCO NACION"


def test_portfolio_item_crud(test_db_session):
    """Verify portfolio items insertion and filtering."""
    item1 = PortfolioItem(
        portfolio_name="Tech Sector Watch",
        cuit="30112233445",
        notes="High leverage watch",
    )
    item2 = PortfolioItem(
        portfolio_name="Tech Sector Watch",
        cuit="30556677889",
        notes="Normal status",
    )
    test_db_session.add_all([item1, item2])
    test_db_session.commit()

    items = test_db_session.scalars(
        select(PortfolioItem).where(PortfolioItem.portfolio_name == "Tech Sector Watch")
    ).all()
    assert len(items) == 2
    assert {it.cuit for it in items} == {"30112233445", "30556677889"}


def test_get_db_generator():
    """Verify get_db dependency yields a working session and closes cleanly."""
    gen = get_db()
    session = next(gen)
    assert session is not None
    try:
        next(gen)
    except StopIteration:
        pass
