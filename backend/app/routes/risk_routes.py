"""REST API routes for single debtor credit screening and batch portfolio evaluations."""

import csv
from datetime import datetime
import io
import re
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.services.risk_service import RiskService, clean_cuit, validate_cuit

router = APIRouter(prefix="/api/risk", tags=["Credit Risk & Central de Deudores"])
risk_service = RiskService()


class BatchRequest(BaseModel):
    cuits: List[str] = []
    portfolio_name: Optional[str] = "Default"


@router.get("/deudores/{cuit}")
def get_debtor_report(
    cuit: str,
    bypass_cache: bool = Query(False, description="Bypass local SQLite cache"),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Retrieve full credit report, bank debt distribution, history, and risk badges for a single CUIT."""
    cleaned = clean_cuit(cuit)
    if not validate_cuit(cleaned):
        from backend.app.metrics import track_cuit_validation_failure
        track_cuit_validation_failure("modulo_11")
        raise HTTPException(
            status_code=400,
            detail=f"CUIT inválido '{cuit}' según el algoritmo Módulo 11 de AFIP.",
        )

    try:
        return risk_service.get_debtor_report(cleaned, db=db, bypass_cache=bypass_cache)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error al procesar el reporte crediticio: {exc}")


@router.post("/batch")
async def evaluate_batch_portfolio(
    request: Request,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Evaluate multi-debtor batch portfolio uploaded via CSV/TXT or provided as JSON list of CUITs."""
    raw_cuits: List[str] = []
    portfolio_name = "Default"

    content_type = request.headers.get("content-type", "")

    # 1. Parse uploaded multipart file
    if "multipart/form-data" in content_type:
        form = await request.form()
        uploaded_file = form.get("file")
        if uploaded_file and hasattr(uploaded_file, "read"):
            portfolio_name = getattr(uploaded_file, "filename", "Uploaded Portfolio") or "Uploaded Portfolio"
            content_bytes = await uploaded_file.read()
            try:
                content_text = content_bytes.decode("utf-8-sig")
            except UnicodeDecodeError:
                content_text = content_bytes.decode("latin-1", errors="ignore")

            tokens = re.split(r"[\r\n,;\t]+", content_text)
            for token in tokens:
                candidate = token.strip()
                if candidate and not candidate.lower().startswith("cuit") and len(clean_cuit(candidate)) >= 10:
                    raw_cuits.append(candidate)
    else:
        # 2. Parse JSON payload
        try:
            body = await request.json()
        except Exception:
            body = {}

        if isinstance(body, dict):
            raw_cuits = body.get("cuits") or []
            portfolio_name = body.get("portfolio_name") or "Default"
        elif isinstance(body, list):
            raw_cuits = body

    if not raw_cuits:
        raise HTTPException(
            status_code=400,
            detail="No se proporcionaron CUITs válidos en la solicitud. Suba un archivo CSV/TXT o envíe un JSON con la lista de CUITs.",
        )

    import time
    from backend.app.metrics import track_cuit_screen, track_cuit_validation_failure

    start_batch_time = time.perf_counter()
    debtors: List[Dict[str, Any]] = []
    invalid_items: List[Dict[str, Any]] = []

    for raw in raw_cuits:
        clean = clean_cuit(raw)
        if not validate_cuit(clean):
            track_cuit_validation_failure("modulo_11")
            invalid_items.append(
                {
                    "raw": raw,
                    "error": "Dígito verificador inválido o formato incorrecto (Módulo 11)",
                }
            )
            continue

        try:
            report = risk_service.get_debtor_report(clean, db=db)
            debtors.append(
                {
                    "cuit": report["cuit"],
                    "cuit_formateado": report["cuit_formateado"],
                    "denominacion": report["denominacion"],
                    "deuda_total": report["deuda_total"],
                    "peor_situacion": report["peor_situacion"],
                    "nivel_riesgo": report.get("nivel_riesgo", "LOW"),
                    "cantidad_entidades": len(report.get("entidades", [])),
                    "total_cheques_rechazados": report.get("total_cheques_rechazados", 0),
                    "alertas_tempranas": report.get("alertas_tempranas", []),
                    "entidades": report.get("entidades", []),
                }
            )
        except Exception as exc:
            invalid_items.append({"raw": raw, "error": str(exc)})

    # Sort debtors: worst situation descending, then debt total descending
    debtors.sort(key=lambda d: (d["peor_situacion"], d["deuda_total"]), reverse=True)

    total_debt = round(sum(d["deuda_total"] for d in debtors), 2)
    worst_portfolio_sit = max((d["peor_situacion"] for d in debtors), default=1)
    batch_duration = time.perf_counter() - start_batch_time
    track_cuit_screen("batch", batch_duration, worst_situation=worst_portfolio_sit)

    return {
        "portfolio_name": portfolio_name,
        "total_cuits": len(raw_cuits),
        "valid_count": len(debtors),
        "invalid_count": len(invalid_items),
        "total_debt": total_debt,
        "peor_situacion_portfolio": worst_portfolio_sit,
        "debtors": debtors,
        "invalid_items": invalid_items,
        "timestamp": datetime.now().isoformat(),
    }
