"""Macroeconomic Data Ingestion, Synchronization, and Caching Service."""

from datetime import date, datetime
import logging
from typing import Any, Dict, List, Optional
from sqlalchemy import select
from sqlalchemy.dialects.sqlite import insert as sqlite_upsert
from sqlalchemy.orm import Session

from backend.app.clients.bcra_client import BCRAClient
from backend.app.clients.fx_client import FXClient
from backend.app.database import MacroSeries, MacroVariable

logger = logging.getLogger(__name__)

KEY_VARIABLES = {
    1: {"name": "Reservas Internacionales", "category": "Monetario", "unit": "Millones USD"},
    15: {"name": "Base Monetaria", "category": "Monetario", "unit": "Millones ARS"},
    7: {"name": "Tasa BADLAR", "category": "Tasas", "unit": "%"},
    11: {"name": "Tasa BAIBAR Interbancaria", "category": "Tasas", "unit": "%"},
    5: {"name": "Tipo de Cambio Mayorista A3500", "category": "Cambiario", "unit": "ARS/USD"},
    4: {"name": "Tipo de Cambio Minorista", "category": "Cambiario", "unit": "ARS/USD"},
    30: {"name": "CER", "category": "Precios", "unit": "Índice"},
    31: {"name": "UVA", "category": "Precios", "unit": "ARS"},
    6: {"name": "Tasa de Política Monetaria (Histórica)", "category": "Tasas", "unit": "%"},
    27: {"name": "Inflación Mensual", "category": "Precios", "unit": "%"},
}


class MacroService:
    """Service layer coordinating BCRA series caching, time-series querying, and FX spreads."""

    def __init__(
        self,
        bcra_client: Optional[BCRAClient] = None,
        fx_client: Optional[FXClient] = None,
    ) -> None:
        self.bcra_client = bcra_client or BCRAClient()
        self.fx_client = fx_client or FXClient()

    def sync_catalog(self, db: Session) -> List[MacroVariable]:
        """Fetch primary BCRA variables catalog and upsert into macro_variables table."""
        items = self.bcra_client.get_principales_variables()
        persisted: List[MacroVariable] = []

        for item in items:
            var_id = int(item.get("idVariable", 0))
            if not var_id:
                continue

            name = item.get("descripcion") or f"Variable {var_id}"
            category = item.get("categoria") or KEY_VARIABLES.get(var_id, {}).get("category", "General")
            unit = KEY_VARIABLES.get(var_id, {}).get("unit") or item.get("unidadExpresion") or item.get("unidad") or ""

            stmt = (
                sqlite_upsert(MacroVariable)
                .values(
                    variable_id=var_id,
                    name=name,
                    category=category,
                    unit=unit,
                )
                .on_conflict_do_update(
                    index_elements=["variable_id"],
                    set_={"name": name, "category": category, "unit": unit},
                )
            )
            db.execute(stmt)

        db.commit()

        # Query all catalog variables
        catalog = list(db.scalars(select(MacroVariable).order_by(MacroVariable.variable_id)).all())
        return catalog

    def sync_variable_series(
        self,
        db: Session,
        variable_id: int,
        desde: Optional[str] = None,
        hasta: Optional[str] = None,
    ) -> int:
        """Fetch observations from BCRA client and upsert into macro_series avoiding duplicates."""
        points = self.bcra_client.get_datos_variable(
            id_variable=variable_id, desde=desde, hasta=hasta
        )
        if not points:
            return 0

        upsert_count = 0
        for pt in points:
            raw_date = pt.get("fecha")
            val = pt.get("valor")
            if not raw_date or val is None:
                continue

            if isinstance(raw_date, str):
                parsed_date = datetime.strptime(raw_date[:10], "%Y-%m-%d").date()
            elif isinstance(raw_date, date):
                parsed_date = raw_date
            else:
                continue

            float_val = float(val)

            stmt = (
                sqlite_upsert(MacroSeries)
                .values(
                    variable_id=variable_id,
                    date=parsed_date,
                    value=float_val,
                )
                .on_conflict_do_update(
                    index_elements=["variable_id", "date"],
                    set_={"value": float_val},
                )
            )
            db.execute(stmt)
            upsert_count += 1

        db.commit()
        return upsert_count

    def get_variable_history(
        self,
        db: Session,
        variable_id: int,
        desde: Optional[str] = None,
        hasta: Optional[str] = None,
        refresh: bool = False,
    ) -> List[Dict[str, Any]]:
        """Retrieve historical series from DB cache, auto-syncing if empty or refresh requested."""
        if refresh:
            self.sync_variable_series(db, variable_id=variable_id, desde=desde, hasta=hasta)

        stmt = select(MacroSeries).where(MacroSeries.variable_id == variable_id)

        parsed_desde: Optional[date] = None
        parsed_hasta: Optional[date] = None

        if desde:
            parsed_desde = datetime.strptime(desde[:10], "%Y-%m-%d").date()
            stmt = stmt.where(MacroSeries.date >= parsed_desde)
        if hasta:
            parsed_hasta = datetime.strptime(hasta[:10], "%Y-%m-%d").date()
            stmt = stmt.where(MacroSeries.date <= parsed_hasta)

        stmt = stmt.order_by(MacroSeries.date.asc())
        records = list(db.scalars(stmt).all())

        # If cache is completely empty for this variable, trigger sync and re-fetch
        if not records:
            self.sync_variable_series(db, variable_id=variable_id, desde=desde, hasta=hasta)
            records = list(db.scalars(stmt).all())

        return [
            {
                "variable_id": r.variable_id,
                "date": r.date.isoformat(),
                "value": r.value,
            }
            for r in records
        ]

    def get_indicators_summary(self, db: Session, refresh: bool = False) -> Dict[str, Any]:
        """Aggregate latest snapshot of key macro indicators and parallel FX spreads."""
        # Ensure catalog is populated
        catalog_count = db.query(MacroVariable).count()
        if catalog_count == 0 or refresh:
            self.sync_catalog(db)

        indicators_data: Dict[str, Any] = {}

        for var_id, meta in KEY_VARIABLES.items():
            if refresh:
                self.sync_variable_series(db, variable_id=var_id)

            latest = db.scalar(
                select(MacroSeries)
                .where(MacroSeries.variable_id == var_id)
                .order_by(MacroSeries.date.desc())
                .limit(1)
            )

            # If not in cache, sync this variable
            if not latest:
                self.sync_variable_series(db, variable_id=var_id)
                latest = db.scalar(
                    select(MacroSeries)
                    .where(MacroSeries.variable_id == var_id)
                    .order_by(MacroSeries.date.desc())
                    .limit(1)
                )

            indicators_data[str(var_id)] = {
                "variable_id": var_id,
                "name": meta["name"],
                "category": meta["category"],
                "unit": meta["unit"],
                "value": latest.value if latest else None,
                "date": latest.date.isoformat() if latest else None,
            }

        fx_summary = self.fx_client.get_spreads_summary(official_base="mayorista")

        return {
            "indicators": indicators_data,
            "fx_spreads": fx_summary,
            "last_updated": datetime.now().isoformat(),
        }

    def get_catalog(self, db: Session, query: Optional[str] = None) -> List[Dict[str, Any]]:
        """Return variables metadata with optional search filter."""
        catalog_count = db.query(MacroVariable).count()
        if catalog_count == 0:
            self.sync_catalog(db)

        stmt = select(MacroVariable)
        if query:
            pattern = f"%{query.strip()}%"
            stmt = stmt.where(
                MacroVariable.name.ilike(pattern) | MacroVariable.category.ilike(pattern)
            )

        stmt = stmt.order_by(MacroVariable.variable_id.asc())
        variables = list(db.scalars(stmt).all())

        return [
            {
                "variable_id": v.variable_id,
                "name": v.name,
                "category": v.category,
                "unit": v.unit,
            }
            for v in variables
        ]
