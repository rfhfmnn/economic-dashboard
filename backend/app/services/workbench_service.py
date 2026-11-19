"""Service for managing the universal multi-variable catalog across BCRA, INDEC, FX, and REM."""

from __future__ import annotations

import logging
import unicodedata
from typing import Any, Dict, List, Optional
from sqlalchemy.orm import Session

from backend.app.clients.indec_client import DATASET_REGISTRY
from backend.app.services.macro_service import KEY_VARIABLES

logger = logging.getLogger(__name__)

# FX Variables (all financial FX quotes: oficial mayorista, minorista, MEP, CCL, blue, tarjeta, cripto)
FX_CATALOG_ITEMS = [
    {
        "id": "fx_oficial",
        "source": "FX",
        "name": "Dólar oficial mayorista",
        "category": "Cambiario",
        "unit": "ARS/USD",
        "frequency": "diaria",
        "isArs": False,
        "description": "Cotización oficial mayorista (BCRA / DolarApi)",
    },
    {
        "id": "fx_minorista",
        "source": "FX",
        "name": "Dólar minorista",
        "category": "Cambiario",
        "unit": "ARS/USD",
        "frequency": "diaria",
        "isArs": False,
        "description": "Cotización minorista en entidades bancarias",
    },
    {
        "id": "fx_mep",
        "source": "FX",
        "name": "Dólar MEP (bolsa)",
        "category": "Cambiario",
        "unit": "ARS/USD",
        "frequency": "diaria",
        "isArs": False,
        "description": "Cotización implícita en bonos soberanos MEP",
    },
    {
        "id": "fx_ccl",
        "source": "FX",
        "name": "Dólar contado con liquidación (CCL)",
        "category": "Cambiario",
        "unit": "ARS/USD",
        "frequency": "diaria",
        "isArs": False,
        "description": "Cotización para liquidación de divisas en el exterior",
    },
    {
        "id": "fx_blue",
        "source": "FX",
        "name": "Dólar blue",
        "category": "Cambiario",
        "unit": "ARS/USD",
        "frequency": "diaria",
        "isArs": False,
        "description": "Cotización del mercado informal de divisas",
    },
    {
        "id": "fx_tarjeta",
        "source": "FX",
        "name": "Dólar tarjeta",
        "category": "Cambiario",
        "unit": "ARS/USD",
        "frequency": "diaria",
        "isArs": False,
        "description": "Cotización minorista oficial más recargo impositivo",
    },
    {
        "id": "fx_cripto",
        "source": "FX",
        "name": "Dólar cripto",
        "category": "Cambiario",
        "unit": "ARS/USD",
        "frequency": "diaria",
        "isArs": False,
        "description": "Cotización implícita en stablecoins cripto (USDT / USDC)",
    },
]

# REM Variables (forecast series: mediana y top 10)
REM_CATALOG_ITEMS = [
    {
        "id": "rem_ipc_general",
        "source": "REM",
        "name": "REM - inflación esperada (mediana)",
        "category": "Expectativas",
        "unit": "% mensual",
        "frequency": "mensual",
        "isArs": False,
        "description": "Mediana de proyección del IPC nivel general nacional (REM)",
    },
    {
        "id": "rem_ipc_general_top10",
        "source": "REM",
        "name": "REM - inflación esperada (top 10)",
        "category": "Expectativas",
        "unit": "% mensual",
        "frequency": "mensual",
        "isArs": False,
        "description": "Top 10 de pronosticadores para el IPC nivel general nacional (REM)",
    },
    {
        "id": "rem_tipo_cambio",
        "source": "REM",
        "name": "REM - tipo de cambio nominal esperado (mediana)",
        "category": "Expectativas",
        "unit": "ARS/USD",
        "frequency": "mensual",
        "isArs": False,
        "description": "Mediana proyectada del tipo de cambio oficial mayorista (REM)",
    },
    {
        "id": "rem_tipo_cambio_top10",
        "source": "REM",
        "name": "REM - tipo de cambio nominal esperado (top 10)",
        "category": "Expectativas",
        "unit": "ARS/USD",
        "frequency": "mensual",
        "isArs": False,
        "description": "Top 10 proyectado del tipo de cambio oficial mayorista (REM)",
    },
    {
        "id": "rem_badlar",
        "source": "REM",
        "name": "REM - tasa Badlar proyectada (mediana)",
        "category": "Expectativas",
        "unit": "% TNA",
        "frequency": "mensual",
        "isArs": False,
        "description": "Mediana esperada de la tasa Badlar para depósitos a plazo fijo (REM)",
    },
    {
        "id": "rem_badlar_top10",
        "source": "REM",
        "name": "REM - tasa Badlar proyectada (top 10)",
        "category": "Expectativas",
        "unit": "% TNA",
        "frequency": "mensual",
        "isArs": False,
        "description": "Top 10 esperado de la tasa Badlar para depósitos a plazo fijo (REM)",
    },
    {
        "id": "rem_tasa_politica",
        "source": "REM",
        "name": "REM - tasa de política monetaria proyectada (mediana)",
        "category": "Expectativas",
        "unit": "% TNA",
        "frequency": "mensual",
        "isArs": False,
        "description": "Mediana esperada de la tasa de política monetaria del BCRA (REM)",
    },
    {
        "id": "rem_tasa_politica_top10",
        "source": "REM",
        "name": "REM - tasa de política monetaria proyectada (top 10)",
        "category": "Expectativas",
        "unit": "% TNA",
        "frequency": "mensual",
        "isArs": False,
        "description": "Top 10 esperado de la tasa de política monetaria del BCRA (REM)",
    },
]


def _strip_accents(text: str) -> str:
    """Strip accents from a string for robust case- and accent-insensitive searching."""
    return "".join(
        c for c in unicodedata.normalize("NFD", text)
        if unicodedata.category(c) != "Mn"
    )


def get_unified_catalog(
    db: Optional[Session] = None,
    q: Optional[str] = None,
    source: Optional[str] = None,
    category: Optional[str] = None,
    limit: Optional[int] = 50,
) -> List[Dict[str, Any]]:
    """Aggregate and unify series across BCRA (>1000 variables), INDEC (118 datasets), FX, and REM."""
    should_close_db = False
    active_db = db
    if active_db is None:
        try:
            from backend.app.database import SessionLocal
            active_db = SessionLocal()
            should_close_db = True
        except Exception:
            active_db = None

    try:
        # 1. Fetch BCRA variables from database or fallback to KEY_VARIABLES
        key_items: List[Dict[str, Any]] = []
        other_items: List[Dict[str, Any]] = []

        if active_db is not None:
            try:
                from backend.app.database import MacroVariable
                db_vars = active_db.query(MacroVariable).order_by(MacroVariable.variable_id).all()
                if db_vars:
                    key_var_ids = set(KEY_VARIABLES.keys())
                    for v in db_vars:
                        var_id = v.variable_id
                        key_meta = KEY_VARIABLES.get(var_id, {})
                        name = key_meta.get("name") or v.name
                        cat = key_meta.get("category") or v.category or "General"
                        unit = key_meta.get("unit") or v.unit or ""
                        freq = (
                            "mensual"
                            if any(w in name.lower() for w in ["intermensual", "interanual", "mensual"])
                            else "diaria"
                        )
                        is_ars = any(
                            term in (unit.lower() + " " + name.lower())
                            for term in ["ars", "pesos", "millones ars"]
                        )
                        item = {
                            "id": f"bcra_{var_id}",
                            "source": "BCRA",
                            "name": name,
                            "category": cat,
                            "unit": unit,
                            "frequency": freq,
                            "isArs": is_ars,
                            "description": f"Variable {var_id} del catálogo oficial del BCRA",
                        }
                        if var_id in key_var_ids:
                            key_items.append(item)
                        else:
                            other_items.append(item)
            except Exception as ex:
                logger.warning("Could not query MacroVariable from db: %s", ex)

        if not key_items and not other_items:
            for var_id, meta in KEY_VARIABLES.items():
                is_ars = meta.get("unit") in ["Millones ARS", "ARS"]
                key_items.append({
                    "id": f"bcra_{var_id}",
                    "source": "BCRA",
                    "name": meta["name"],
                    "category": meta["category"],
                    "unit": meta["unit"],
                    "frequency": (
                        "mensual"
                        if "intermensual" in meta["name"].lower() or "interanual" in meta["name"].lower()
                        else "diaria"
                    ),
                    "isArs": is_ars,
                    "description": f"Variable {var_id} del catálogo oficial del BCRA",
                })

        # Build unified catalog with prioritized key series so all sources are represented in top items
        catalog: List[Dict[str, Any]] = []
        catalog.extend(key_items)
        catalog.extend(FX_CATALOG_ITEMS)
        catalog.extend(REM_CATALOG_ITEMS)

        # 2. INDEC Variables (all 118 datasets)
        for key, spec in DATASET_REGISTRY.items():
            catalog.append({
                "id": f"indec_{key}",
                "source": "INDEC",
                "name": spec.get("name", key),
                "category": spec.get("category", "Economía real"),
                "unit": spec.get("unit", ""),
                "frequency": spec.get("frequency", "mensual"),
                "isArs": "pesos" in spec.get("unit", "").lower() or "ars" in spec.get("unit", "").lower(),
                "description": spec.get("description", ""),
            })

        # 3. Remaining BCRA variables (>990 series)
        if other_items:
            catalog.extend(other_items)

        # Apply source filter
        if source and source.strip().lower() not in ("all", "todas"):
            target_source = source.strip().upper()
            catalog = [item for item in catalog if item["source"].upper() == target_source]

        # Apply category filter
        if category and category.strip().lower() not in ("all", "todas"):
            cat_str = _strip_accents(category.strip().lower())
            catalog = [
                item for item in catalog
                if cat_str in _strip_accents(item.get("category", "").lower())
            ]

        # Apply search query filter (accent- and case-insensitive, token-based)
        if q and q.strip():
            query_str = _strip_accents(q.strip().lower())
            tokens = query_str.split()
            catalog = [
                item for item in catalog
                if all(
                    token in _strip_accents(item["name"].lower())
                    or token in _strip_accents(item.get("category", "").lower())
                    or token in _strip_accents(item["source"].lower())
                    or token in _strip_accents(item["id"].lower())
                    or token in _strip_accents(item.get("description", "").lower())
                    or token in _strip_accents(item.get("unit", "").lower())
                    for token in tokens
                )
            ]

        # Apply limit if positive integer
        if limit is not None and limit > 0:
            catalog = catalog[:limit]

        return catalog

    finally:
        if should_close_db and active_db is not None:
            active_db.close()
