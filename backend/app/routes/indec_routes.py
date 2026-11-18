"""REST API routes for INDEC macroeconomic data, time-series, and catalogs."""

from __future__ import annotations

import os
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from backend.app.clients.indec_client import (
    DATASET_REGISTRY,
    IndecAuthError,
    IndecNetworkError,
    IndecResponseError,
)
from backend.app.database import get_db
from backend.app.services.indec_service import IndecService

router = APIRouter(prefix="/api/macro/indec", tags=["indec"])
indec_service = IndecService()


@router.get("/summary")
def get_indec_summary(
    refresh: bool = Query(
        False, description="Force sync latest observations from INDEC"
    ),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Get latest summary snapshot of the 8 key INDEC macroeconomic indicators."""
    try:
        return indec_service.get_summary(db=db, refresh=refresh)
    except IndecAuthError as exc:
        err_msg = str(exc)
        if "no configurado" in err_msg.lower() or not os.getenv("INDEC_API_TOKEN"):
            detail = "INDEC_API_TOKEN no configurado en entorno"
        else:
            detail = err_msg
        raise HTTPException(status_code=401, detail=detail) from exc
    except (IndecNetworkError, IndecResponseError) as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/catalog")
def get_indec_catalog(
    q: str | None = Query(
        None, description="Search query by variable name or category"
    ),
) -> list[dict[str, Any]]:
    """List available INDEC variables metadata from registry with optional text search."""
    return indec_service.get_catalog(q=q)


@router.get("/series/{variable_id}")
def get_indec_series(
    variable_id: str,
    timeframe: str = Query(
        "1Y", description="Timeframe filter ('1Y', '2Y', '5Y', 'Max')"
    ),
    refresh: bool = Query(
        False, description="Force sync latest series bypassing SQLite cache"
    ),
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    """Get chronological time-series observations for an INDEC variable."""
    if variable_id not in DATASET_REGISTRY:
        raise HTTPException(
            status_code=404,
            detail=f"Variable '{variable_id}' no encontrada en catálogo INDEC",
        )

    try:
        return indec_service.get_series(
            variable_id=variable_id,
            timeframe=timeframe,
            db=db,
            refresh=refresh,
        )
    except IndecAuthError as exc:
        err_msg = str(exc)
        if "no configurado" in err_msg.lower() or not os.getenv("INDEC_API_TOKEN"):
            detail = "INDEC_API_TOKEN no configurado en entorno"
        else:
            detail = err_msg
        raise HTTPException(status_code=401, detail=detail) from exc
    except (IndecNetworkError, IndecResponseError) as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
