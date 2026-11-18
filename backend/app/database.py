"""SQLite database connection, session management, and SQLAlchemy ORM models."""

import os
from collections.abc import Generator
from datetime import date as date_type
from datetime import datetime
from pathlib import Path
from typing import Any

from sqlalchemy import (
    JSON,
    Date,
    DateTime,
    Float,
    Integer,
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

# If running on host outside Docker and DATABASE_URL points to unreachable Docker service name 'postgres'
if "@postgres:" in DATABASE_URL:
    import socket

    try:
        socket.gethostbyname("postgres")
    except socket.gaierror:
        DATABASE_URL = f"sqlite:///{DEFAULT_DB_PATH.as_posix()}"

# Standardize postgres:// or generic postgresql:// to postgresql+psycopg2:// for SQLAlchemy & psycopg2-binary compatibility
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+psycopg2://", 1)
elif DATABASE_URL.startswith("postgresql://") and not DATABASE_URL.startswith(
    "postgresql+"
):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg2://", 1)

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine_kwargs: dict[str, Any] = {"connect_args": connect_args}
if not DATABASE_URL.startswith("sqlite"):
    engine_kwargs.update(
        {
            "pool_pre_ping": True,
            "pool_size": int(os.getenv("DB_POOL_SIZE", "10")),
            "max_overflow": int(os.getenv("DB_MAX_OVERFLOW", "20")),
        }
    )

engine = create_engine(DATABASE_URL, **engine_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_upsert_stmt(model: Any, db: Session | None = None):
    """Return dialect-specific insert statement supporting on_conflict_do_update for PostgreSQL or SQLite."""
    dialect_name = "sqlite"
    if db is not None:
        try:
            bind = getattr(db, "bind", None) or db.get_bind()
            if bind:
                dialect_name = bind.dialect.name
        except Exception:  # noqa: BLE001
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
    unit: Mapped[str | None] = mapped_column(String(100), nullable=True)
    category: Mapped[str | None] = mapped_column(String(100), nullable=True)


class CuitCache(Base):
    """Cached CUIT queries from Central de Deudores to prevent repetitive BCRA API hits."""

    __tablename__ = "cuit_cache"

    cuit: Mapped[str] = mapped_column(String(20), primary_key=True)
    denomination: Mapped[str | None] = mapped_column(String(255), nullable=True)
    worst_situation: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_debt: Mapped[float | None] = mapped_column(Float, nullable=True)
    raw_payload: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
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
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )


class RemReport(Base):
    """Cached REM (Relevamiento de Expectativas de Mercado) report publications."""

    __tablename__ = "rem_reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    period: Mapped[str] = mapped_column(
        String(20), nullable=False, unique=True, index=True
    )
    raw_payload: Mapped[Any] = mapped_column(JSON, nullable=False)
    cached_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )


class MacroSyncLog(Base):
    """Tracks last synchronization timestamp per variable or catalog to enforce cache TTL."""

    __tablename__ = "macro_sync_log"

    variable_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    last_synced_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )


class IndecCache(Base):
    """Cached raw responses from INDEC official API to minimize external requests and enforce TTL."""

    __tablename__ = "indec_cache"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    variable_id: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    period: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    raw_payload: Mapped[Any] = mapped_column(JSON, nullable=False)
    cached_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint("variable_id", "period", name="uq_indec_cache_var_period"),
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
