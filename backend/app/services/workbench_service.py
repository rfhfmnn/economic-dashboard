"""Service for managing the universal multi-variable catalog across BCRA, INDEC, FX, and REM."""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from sqlalchemy.orm import Session

from backend.app.clients.indec_client import DATASET_REGISTRY
from backend.app.services.macro_service import KEY_VARIABLES, MacroService


# FX Variables
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
]

# REM Variables
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
        "id": "rem_tipo_cambio",
        "source": "REM",
        "name": "REM - tipo de cambio nominal esperado",
        "category": "Expectativas",
        "unit": "ARS/USD",
        "frequency": "mensual",
        "isArs": False,
        "description": "Mediana proyectada del tipo de cambio oficial mayorista",
    },
    {
        "id": "rem_badlar",
        "source": "REM",
        "name": "REM - tasa Badlar proyectada",
        "category": "Expectativas",
        "unit": "% TNA",
        "frequency": "mensual",
        "isArs": False,
        "description": "Mediana esperada de la tasa para depósitos a plazo fijo de más de 1M ARS",
    },
]


def _strip_accents(text: str) -> str:
    """Strip accents from a string for robust case- and accent-insensitive searching."""
    import unicodedata
    return "".join(
        c for c in unicodedata.normalize("NFD", text)
        if unicodedata.category(c) != "Mn"
    )


def get_unified_catalog(db: Optional[Session] = None, q: Optional[str] = None) -> List[Dict[str, Any]]:
    """Aggregate and unify series across BCRA, INDEC, FX, and REM."""
    catalog: List[Dict[str, Any]] = []

    # 1. BCRA Variables
    # Fetch from macro_service or KEY_VARIABLES
    bcra_vars = KEY_VARIABLES
    for var_id, meta in bcra_vars.items():
        is_ars = meta.get("unit") in ["Millones ARS", "ARS"]
        catalog.append({
            "id": f"bcra_{var_id}",
            "source": "BCRA",
            "name": meta["name"],
            "category": meta["category"],
            "unit": meta["unit"],
            "frequency": "mensual" if "intermensual" in meta["name"].lower() or "interanual" in meta["name"].lower() else "diaria",
            "isArs": is_ars,
            "description": f"Variable {var_id} del catálogo oficial del BCRA",
        })

    # 2. INDEC Variables
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

    # 3. FX Variables
    catalog.extend(FX_CATALOG_ITEMS)

    # 4. REM Variables
    catalog.extend(REM_CATALOG_ITEMS)

    # Optional query filter
    if q:
        query_str = _strip_accents(q.lower().strip())
        catalog = [
            item for item in catalog
            if query_str in _strip_accents(item["name"].lower())
            or query_str in _strip_accents(item["category"].lower())
            or query_str in _strip_accents(item["source"].lower())
            or query_str in _strip_accents(item["id"].lower())
            or query_str in _strip_accents(item.get("description", "").lower())
        ]

    return catalog

