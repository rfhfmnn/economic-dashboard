"""REST API routes for ArgentinaDatos REM market expectations and forecast cones."""

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.services.rem_service import RemService

router = APIRouter(prefix="/api/macro/rem", tags=["REM Market Expectations"])
rem_service = RemService()


@router.get("/reports")
def get_available_reports() -> List[str]:
    """Get list of available canonical REM report periods (e.g. ['2026-09', '2026-08', ...])."""
    return rem_service.get_available_reports()


@router.get("/summary")
def get_rem_summary(
    period: str = Query("ultimo", description="Report period ('ultimo' or 'YYYY-MM')"),
    cohort: str = Query("todos", description="Cohort ('todos' or 'top_10')"),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Get executive KPI summary (next month CPI, 12M CPI, year-end FX, policy rate) with Top 10 divergence."""
    return rem_service.get_rem_summary(period=period, cohort=cohort, db=db)


@router.get("/modular-kpis")
def get_rem_modular_kpis(
    period: str = Query("ultimo", description="Report period ('ultimo' or 'YYYY-MM')"),
    cohort: str = Query("todos", description="Cohort ('todos' or 'top_10')"),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Get multi-variable modular KPI dataset with configurable horizons and dual sparklines (forecast trajectory & revision history)."""
    return rem_service.get_rem_modular_kpis(period=period, cohort=cohort, db=db)


@router.get("/cpi-comparison")
def get_cpi_comparison(
    lookback: int = Query(12, ge=3, le=36, description="Number of historical months to compare"),
    cohort: str = Query("todos", description="Cohort ('todos' or 'top_10')"),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Get monthly actual INDEC inflation paired with preceding REM market forecasts and surprise delta."""
    return rem_service.get_cpi_expectation_vs_reality(lookback_months=lookback, cohort=cohort, db=db)


@router.get("/forecast-cone")
def get_forecast_cone(
    variable: str = Query("ipc_nivel_general", description="Forecast variable ('ipc_nivel_general', 'ipc_nucleo', 'tipo_de_cambio', 'tasa_politica')"),
    period: str = Query("ultimo", description="Report period ('ultimo' or 'YYYY-MM')"),
    cohort: str = Query("todos", description="Cohort ('todos' or 'top_10')"),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Get forward-looking forecast cone with median, mean, P25-P75 interquartile band, and P10-P90 band."""
    return rem_service.get_rem_forecast_cone(variable=variable, period=period, cohort=cohort, db=db)


@router.get("/table")
def get_breakdown_table(
    period: str = Query("ultimo", description="Report period ('ultimo' or 'YYYY-MM')"),
    cohort: str = Query("todos", description="Cohort ('todos' or 'top_10')"),
    category: Optional[str] = Query("all", description="Category filter ('Precios', 'Tipo de Cambio', 'Tasas', 'Actividad', or 'all')"),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Get multi-indicator consensus breakdown table with category filters and Top 10 divergence flags."""
    return rem_service.get_rem_breakdown_table(period=period, cohort=cohort, category=category, db=db)
