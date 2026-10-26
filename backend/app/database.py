"""SQLite database connection, session management, and SQLAlchemy ORM models."""

import os
from pathlib import Path
from datetime import date as date_type, datetime
from typing import Any, Dict, Generator, Optional

from sqlalchemy import (
    Date,
    DateTime,
    Float,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
    create_engine,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

BACKEND_DIR = Path(__file__).resolve().parent.parent
DEFAULT_DB_PATH = BACKEND_DIR / "economic_dashboard.db"
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DEFAULT_DB_PATH.as_posix()}")

# Standardize postgres:// to postgresql:// for SQLAlchemy 2.0+ compatibility
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine_kwargs: Dict[str, Any] = {"connect_args": connect_args}
if not DATABASE_URL.startswith("sqlite"):
    engine_kwargs.update({
        "pool_pre_ping": True,
        "pool_size": int(os.getenv("DB_POOL_SIZE", "10")),
        "max_overflow": int(os.getenv("DB_MAX_OVERFLOW", "20")),
    })

engine = create_engine(DATABASE_URL, **engine_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_upsert_stmt(model: Any, db: Optional[Session] = None):
    """Return dialect-specific insert statement supporting on_conflict_do_update for PostgreSQL or SQLite."""
    dialect_name = "sqlite"
    if db is not None:
        try:
            bind = getattr(db, "bind", None) or db.get_bind()
            if bind:
                dialect_name = bind.dialect.name
        except Exception:
            dialect_name = "sqlite"
    elif engine is not None:
        dialect_name = engine.dialect.name

    if dialect_name == "postgresql":
        from sqlalchemy.dialects.postgresql import insert as pg_insert
        return pg_insert(model)
    else:
        from sqlalchemy.dialects.sqlite import insert as sqlite_insert
        return sqlite_insert(model)



class Base(DeclarativeBase):
    """Base class for all SQLAlchemy ORM models."""
    pass


class MacroSeries(Base):
    """Cached macroeconomic time-series data."""

    __tablename__ = "macro_series"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    variable_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    date: Mapped[date_type] = mapped_column(Date, nullable=False)
    value: Mapped[float] = mapped_column(Float, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint("variable_id", "date", name="uq_macro_series_var_date"),
    )


class MacroVariable(Base):
    """Catalog of BCRA macroeconomic indicator series."""

    __tablename__ = "macro_variables"

    variable_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    unit: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    category: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)


class CuitCache(Base):
    """Cached CUIT queries from Central de Deudores to prevent repetitive BCRA API hits."""

    __tablename__ = "cuit_cache"

    cuit: Mapped[str] = mapped_column(String(20), primary_key=True)
    denomination: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    worst_situation: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    total_debt: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    raw_payload: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)
    last_updated: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )


class PortfolioItem(Base):
    """Debtors added to portfolio watchlists for batch comparative analysis."""

    __tablename__ = "portfolio_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    portfolio_name: Mapped[str] = mapped_column(
        String(100), default="Default", nullable=False
    )
    cuit: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )


class RemReport(Base):
    """Cached REM (Relevamiento de Expectativas de Mercado) report publications."""

    __tablename__ = "rem_reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    period: Mapped[str] = mapped_column(String(20), nullable=False, unique=True, index=True)
    raw_payload: Mapped[Any] = mapped_column(JSON, nullable=False)
    cached_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )


def init_db(bind_engine=None) -> None:
    """Create all tables in the database."""
    target_engine = bind_engine or engine
    Base.metadata.create_all(bind=target_engine)


def get_db() -> Generator[Session, None, None]:
    """Dependency generator yielding an active database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
