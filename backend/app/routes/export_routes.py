"""Export API routes for PDF executive dossiers and Excel batch workbooks."""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.services.export_service import (
    generate_batch_excel_portfolio,
    generate_cuit_pdf_dossier,
)
from backend.app.services.risk_service import (
    RiskService,
    clean_cuit,
    validate_cuit,
)

router = APIRouter(prefix="/api/export", tags=["Export"])
risk_service = RiskService()


class BatchExcelRequest(BaseModel):
    cuits: Optional[List[str]] = None
    results: Optional[List[Dict[str, Any]]] = None
    metrics: Optional[Dict[str, Any]] = None


@router.get("/cuit-dossier/{cuit}")
def export_cuit_pdf(cuit: str, db: Session = Depends(get_db)):
    """Generate and download a 1-page executive PDF credit dossier."""
    clean = clean_cuit(cuit)
    if not validate_cuit(clean):
        raise HTTPException(
            status_code=400,
            detail=f"CUIT inválido '{cuit}' según el algoritmo Módulo 11 de AFIP.",
        )

    try:
        report = risk_service.get_debtor_report(clean, db=db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    pdf_bytes = generate_cuit_pdf_dossier(report)

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="dossier_{clean}.pdf"',
            "Content-Type": "application/pdf",
        },
    )


@router.post("/batch-excel")
async def export_batch_excel(request: Request, db: Session = Depends(get_db)):
    """Generate and download an Excel workbook (.xlsx) summarizing evaluated batch portfolio."""
    try:
        body = await request.json()
    except Exception:
        body = {}

    results = body.get("results") or body.get("debtors")
    metrics = body.get("metrics")
    cuits = body.get("cuits")

    # If already evaluated portfolio is provided
    if results is not None:
        batch_data = {
            "debtors": results,
            "metrics": metrics
            or {
                "total_cuits": len(results),
                "valid_cuits": len(results),
                "invalid_cuits": 0,
                "max_situacion": max(
                    (r.get("peor_situacion") or r.get("worst_situation") or 1 for r in results),
                    default=1,
                ),
                "total_alerts": sum(
                    len(r.get("alertas_tempranas") or r.get("alert_badges") or []) for r in results
                ),
            },
        }
    elif cuits:
        debtors = []
        invalid_items = []
        for raw in cuits:
            cl = clean_cuit(raw)
            if not validate_cuit(cl):
                invalid_items.append({"raw": raw, "error": "CUIT inválido"})
                continue
            try:
                rep = risk_service.get_debtor_report(cl, db=db)
                debtors.append(rep)
            except Exception as e:
                invalid_items.append({"raw": raw, "error": str(e)})

        batch_data = {
            "debtors": debtors,
            "metrics": {
                "total_cuits": len(cuits),
                "valid_cuits": len(debtors),
                "invalid_cuits": len(invalid_items),
                "max_situacion": max((d.get("peor_situacion", 1) for d in debtors), default=1),
                "total_alerts": sum(len(d.get("alertas_tempranas", [])) for d in debtors),
            },
        }
    else:
        raise HTTPException(
            status_code=400,
            detail="Debe proveer una lista de CUITs ('cuits') o resultados evaluados ('results').",
        )

    excel_bytes = generate_batch_excel_portfolio(batch_data)

    return Response(
        content=excel_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": 'attachment; filename="portfolio_batch.xlsx"',
            "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
    )
