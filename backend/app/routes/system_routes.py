"""REST API routes for system health, connectivity status, and configuration."""

from datetime import datetime
from typing import Any, Dict
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.services.macro_service import MacroService
from backend.app.telemetry import get_telemetry_info

router = APIRouter(prefix="/api/system", tags=["System"])
macro_service = MacroService()


@router.get("/status")
def get_system_status(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Check system operational status, database connectivity, mock mode, and telemetry configuration."""
    db_connected = False
    try:
        db.execute(text("SELECT 1"))
        db_connected = True
    except Exception:
        db_connected = False

    return {
        "status": "ok" if db_connected else "degraded",
        "database": "connected" if db_connected else "error",
        "mock_mode": macro_service.bcra_client.force_mock,
        "services": {
            "bcra_api": "active",
            "fx_api": "active",
        },
        "telemetry": get_telemetry_info(),
        "timestamp": datetime.now().isoformat(),
    }


@router.get("/health")
def get_system_health(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Healthcheck endpoint returning system health and connectivity."""
    return get_system_status(db=db)


@router.get("/telemetry")
def get_system_telemetry() -> Dict[str, Any]:
    """Return OpenTelemetry metadata including service name, environment, and deployed version."""
    return get_telemetry_info()
