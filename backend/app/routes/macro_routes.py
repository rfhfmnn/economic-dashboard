"""REST API routes for macroeconomic indicators, time-series, and FX spreads."""

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.services.macro_service import MacroService

router = APIRouter(prefix="/api/macro", tags=["Macro & FX"])
macro_service = MacroService()


@router.get("/indicators/summary")
@router.get("/summary")
def get_indicators_summary(
    refresh: bool = Query(False, description="Force sync latest observations from BCRA v4.0"),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Get latest snapshot of primary BCRA indicators and parallel FX market spreads."""
    return macro_service.get_indicators_summary(db, refresh=refresh)


@router.get("/series/{variable_id}")
def get_variable_series(
    variable_id: int,
    desde: Optional[str] = Query(None, description="Start date YYYY-MM-DD"),
    hasta: Optional[str] = Query(None, description="End date YYYY-MM-DD"),
    refresh: bool = Query(False, description="Force sync latest series from BCRA v4.0"),
    db: Session = Depends(get_db),
) -> List[Dict[str, Any]]:
    """Get historical time-series observations for a specific BCRA variable."""
    return macro_service.get_variable_history(db, variable_id=variable_id, desde=desde, hasta=hasta, refresh=refresh)


@router.get("/fx-spreads")
@router.get("/fx/spreads")
def get_fx_spreads(
    official_base: str = Query("mayorista", description="Official rate baseline ('mayorista' or 'oficial')"),
) -> Dict[str, Any]:
    """Get parallel foreign exchange rates and brecha cambiaria spread percentages."""
    return macro_service.fx_client.get_spreads_summary(official_base=official_base)


@router.get("/catalog")
def get_variable_catalog(
    q: Optional[str] = Query(None, description="Search query by name or category"),
    search: Optional[str] = Query(None, description="Search query alias"),
    db: Session = Depends(get_db),
) -> List[Dict[str, Any]]:
    """List available BCRA series metadata with optional search filter."""
    query_term = q or search
    return macro_service.get_catalog(db, query=query_term)
