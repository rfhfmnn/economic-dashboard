"""SQLite database connection, session management, and SQLAlchemy ORM models."""

import os
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

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./economic_dashboard.db")

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


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
