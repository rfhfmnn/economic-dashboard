"""REST API routes for system health, connectivity status, and configuration."""

from datetime import datetime
from typing import Any, Dict
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.services.macro_service import MacroService

router = APIRouter(prefix="/api/system", tags=["System"])
macro_service = MacroService()


@router.get("/status")
def get_system_status(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Check system operational status, database connectivity, and mock mode configuration."""
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
        "timestamp": datetime.now().isoformat(),
    }
