import os
from datetime import date, datetime, timedelta, timezone
import logging
from typing import Any, Dict, List, Optional
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.app.clients.bcra_client import BCRAClient
from backend.app.clients.fx_client import FXClient
from backend.app.clients.rem_client import REMClient
from backend.app.database import MacroSeries, MacroSyncLog, MacroVariable, get_upsert_stmt

logger = logging.getLogger(__name__)

DEFAULT_CACHE_TTL_HOURS = float(os.getenv("MACRO_CACHE_TTL_HOURS", "4.0"))

KEY_VARIABLES = {
    1: {"name": "Reservas internacionales", "category": "Monetario", "unit": "Millones USD"},
    4: {"name": "Tipo de cambio minorista", "category": "Cambiario", "unit": "ARS/USD"},
    5: {"name": "Tipo de cambio mayorista (A3500)", "category": "Cambiario", "unit": "ARS/USD"},
    28: {"name": "Inflación interanual", "category": "Precios", "unit": "%"},
    7: {"name": "Tasa BADLAR", "category": "Tasas", "unit": "%"},
    27: {"name": "Inflación intermensual", "category": "Precios", "unit": "%"},
    30: {"name": "CER", "category": "Precios", "unit": "Índice"},
    31: {"name": "UVA", "category": "Precios", "unit": "ARS"},
    15: {"name": "Base monetaria", "category": "Monetario", "unit": "Millones ARS"},
    11: {"name": "Tasa BAIBAR interbancaria", "category": "Tasas", "unit": "%"},
}



class MacroService:
    """Service layer coordinating BCRA series caching, time-series querying, and FX spreads."""

    def __init__(
        self,
        bcra_client: Optional[BCRAClient] = None,
        fx_client: Optional[FXClient] = None,
        rem_client: Optional[REMClient] = None,
    ) -> None:
        self.bcra_client = bcra_client or BCRAClient()
        self.fx_client = fx_client or FXClient()
        self.rem_client = rem_client or REMClient()

    def record_sync(self, db: Session, variable_id: int) -> None:
        """Record synchronization timestamp for a variable or catalog (variable_id=0)."""
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        stmt = (
            get_upsert_stmt(MacroSyncLog, db)
            .values(
                variable_id=variable_id,
                last_synced_at=now,
            )
            .on_conflict_do_update(
                index_elements=["variable_id"],
                set_={"last_synced_at": now},
            )
        )
        db.execute(stmt)
        db.commit()

    def is_variable_stale(
        self,
        db: Session,
        variable_id: int,
        ttl_hours: Optional[float] = None,
    ) -> bool:
        """Determine if cached data for variable_id is absent or exceeds TTL."""
        ttl = ttl_hours if ttl_hours is not None else DEFAULT_CACHE_TTL_HOURS
        threshold = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=ttl)

        # 1. Check sync log
        sync_log = db.scalar(
            select(MacroSyncLog).where(MacroSyncLog.variable_id == variable_id)
        )
        if sync_log and sync_log.last_synced_at:
            synced_time = sync_log.last_synced_at
            if synced_time.tzinfo is not None:
                synced_time = synced_time.replace(tzinfo=None)
            return synced_time < threshold

        # 2. Fallback to latest MacroSeries created_at if no sync log exists yet
        if variable_id > 0:
            latest_created = db.scalar(
                select(func.max(MacroSeries.created_at)).where(MacroSeries.variable_id == variable_id)
            )
            if not latest_created:
                return True
            if latest_created.tzinfo is not None:
                latest_created = latest_created.replace(tzinfo=None)
            return latest_created < threshold

        return True

    def sync_catalog(self, db: Session) -> List[MacroVariable]:
        """Fetch primary BCRA variables catalog and upsert into macro_variables table."""
        items = self.bcra_client.get_principales_variables()
        persisted: List[MacroVariable] = []

        for item in items:
            var_id = int(item.get("idVariable", 0))
            if not var_id:
                continue

            raw_name = item.get("descripcion") or f"Variable {var_id}"
            if var_id == 1:
                name = "Reservas internacionales"
            elif var_id == 77 and "variaci" not in raw_name.lower():
                name = "Reservas internacionales (variación diaria de saldos)"
            elif var_id == 28:
                name = "Inflación interanual"
            elif var_id == 27:
                name = "Inflación intermensual"
            else:
                name = raw_name.strip()
            category = item.get("categoria") or KEY_VARIABLES.get(var_id, {}).get("category", "General")
            unit = KEY_VARIABLES.get(var_id, {}).get("unit") or item.get("unidadExpresion") or item.get("unidad") or ""

            stmt = (
                get_upsert_stmt(MacroVariable, db)
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
        self.record_sync(db, variable_id=0)

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
                get_upsert_stmt(MacroSeries, db)
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
        self.record_sync(db, variable_id=variable_id)
        return upsert_count

    def get_variable_history(
        self,
        db: Session,
        variable_id: int,
        desde: Optional[str] = None,
        hasta: Optional[str] = None,
        refresh: bool = False,
    ) -> List[Dict[str, Any]]:
        """Retrieve historical series from DB cache, auto-syncing if empty, stale, or refresh requested."""
        if refresh or self.is_variable_stale(db, variable_id=variable_id):
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
        """Aggregate latest snapshot of key macro indicators and parallel FX spreads, auto-refreshing stale series."""
        # Ensure catalog is populated and fresh (catalog TTL: 24h)
        catalog_count = db.query(MacroVariable).count()
        if catalog_count == 0 or refresh or self.is_variable_stale(db, variable_id=0, ttl_hours=24.0):
            self.sync_catalog(db)

        indicators_data: Dict[str, Any] = {}

        for var_id, meta in KEY_VARIABLES.items():
            if refresh or self.is_variable_stale(db, variable_id=var_id):
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

    def get_cpi_history(
        self,
        db: Session,
        refresh: bool = False,
    ) -> List[Dict[str, Any]]:
        """Retrieve historical monthly INDEC CPI inflation rates and computed cumulative price index."""
        raw_items = self.rem_client.get_indec_inflation(db=db, refresh=refresh)
        if not raw_items:
            return []

        # Ensure sorted ascending by date
        sorted_items = sorted(raw_items, key=lambda x: str(x.get("fecha", "")))

        results: List[Dict[str, Any]] = []
        current_index = 100.0

        for i, item in enumerate(sorted_items):
            fecha = str(item.get("fecha", ""))
            try:
                rate = float(item.get("valor", 0.0))
            except (ValueError, TypeError):
                rate = 0.0

            if i == 0:
                indice = 100.0
            else:
                current_index = current_index * (1.0 + rate / 100.0)
                indice = round(current_index, 4)

            results.append({
                "fecha": fecha,
                "valor": rate,
                "indice": indice,
            })

        return results
