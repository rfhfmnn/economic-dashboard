"""Credit risk service, Central de Deudores integration, and CUIT validation."""

from datetime import datetime
import logging
import re
from typing import Any, Dict, List, Optional
from sqlalchemy import select
from sqlalchemy.dialects.sqlite import insert as sqlite_upsert
from sqlalchemy.orm import Session

from backend.app.clients.bcra_client import BCRAClient
from backend.app.database import CuitCache

logger = logging.getLogger(__name__)


def clean_cuit(cuit: Any) -> str:
    """Strip all non-numeric characters from a CUIT string."""
    if cuit is None:
        return ""
    return re.sub(r"\D", "", str(cuit))


def format_cuit(cuit: Any) -> str:
    """Format an 11-digit CUIT into XX-XXXXXXXX-X format."""
    digits = clean_cuit(cuit)
    if len(digits) != 11:
        return str(cuit) if cuit is not None else ""
    return f"{digits[:2]}-{digits[2:10]}-{digits[10]}"


def validate_cuit(cuit: Any) -> bool:
    """Validates an Argentine tax ID (CUIT/CUIL) using the official AFIP Módulo 11 checksum.

    Rules:
    - Must be exactly 11 numeric digits.
    - Prefix must be one of {20, 23, 24, 27, 30, 33, 34}.
    - Sum = sum(digit_i * multiplier_i) for i in 0..9 with multipliers [5,4,3,2,7,6,5,4,3,2].
    - remainder = Sum % 11.
    - If remainder == 0: verifier = 0.
    - If remainder == 1: verifier = 9 for prefix 20/27, or 4 for prefix 23.
    - Else: verifier = 11 - remainder.
    """
    digits_str = clean_cuit(cuit)
    if len(digits_str) != 11 or not digits_str.isdigit():
        return False

    prefix = digits_str[:2]
    if prefix not in {"20", "23", "24", "27", "30", "33", "34"}:
        return False

    multipliers = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
    total = sum(int(digits_str[i]) * multipliers[i] for i in range(10))
    remainder = total % 11

    if remainder == 0:
        expected_verifier = 0
    elif remainder == 1:
        expected_verifier = 4 if prefix == "23" else 9
    else:
        expected_verifier = 11 - remainder

    return int(digits_str[10]) == expected_verifier


class RiskService:
    """Service for querying, parsing, and caching credit risk and Central de Deudores data."""

    def __init__(self, bcra_client: Optional[BCRAClient] = None) -> None:
        self.bcra_client = bcra_client or BCRAClient()

    def get_debtor_report(
        self,
        cuit: str,
        db: Optional[Session] = None,
        bypass_cache: bool = False,
    ) -> Dict[str, Any]:
        """Fetch, consolidate, and parse Central de Deudores credit report for a given CUIT."""
        clean = clean_cuit(cuit)
        if not validate_cuit(clean):
            raise ValueError(f"CUIT inválido '{cuit}' según el algoritmo Módulo 11 de AFIP.")

        # Check local SQLite cache first if db session is provided
        if db is not None and not bypass_cache:
            cached = db.get(CuitCache, clean)
            if cached and cached.raw_payload:
                logger.info("Serving debtor report for CUIT %s from database cache", clean)
                return cached.raw_payload

        # Fetch from external BCRA client (with automatic synthetic fallback)
        raw_deudas = self.bcra_client.get_deudas(clean)
        raw_cheques = self.bcra_client.get_cheques_rechazados(clean)

        parsed_report = self._parse_debtor_data(clean, raw_deudas, raw_cheques)

        # Store in cache table if db session provided
        if db is not None:
            stmt = (
                sqlite_upsert(CuitCache)
                .values(
                    cuit=clean,
                    denomination=parsed_report.get("denominacion"),
                    worst_situation=parsed_report.get("peor_situacion"),
                    total_debt=parsed_report.get("deuda_total"),
                    raw_payload=parsed_report,
                )
                .on_conflict_do_update(
                    index_elements=["cuit"],
                    set_={
                        "denomination": parsed_report.get("denominacion"),
                        "worst_situation": parsed_report.get("peor_situacion"),
                        "total_debt": parsed_report.get("deuda_total"),
                        "raw_payload": parsed_report,
                    },
                )
            )
            db.execute(stmt)
            db.commit()

        return parsed_report

    def _parse_debtor_data(
        self,
        cuit: str,
        raw_deudas: Dict[str, Any],
        raw_cheques: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Normalize raw BCRA Central de Deudores response into structured credit dossier."""
        results = raw_deudas.get("results") or {}
        denomination = results.get("denominacion") or f"CONTRIBUYENTE {cuit}"
        periods = results.get("periodos") or []

        # If no debt registered at all (clean profile)
        if not periods:
            return {
                "cuit": cuit,
                "cuit_formateado": format_cuit(cuit),
                "denominacion": denomination,
                "periodo_reciente": None,
                "deuda_total": 0.0,
                "peor_situacion": 1,
                "entidades": [],
                "historial_24m": [],
                "cheques_rechazados": [],
                "total_cheques_rechazados": 0,
                "monto_total_cheques": 0.0,
                "fecha_consulta": datetime.now().isoformat(),
            }

        # Latest period is the first element
        latest_period_obj = periods[0]
        latest_period = latest_period_obj.get("periodo")
        latest_entities = latest_period_obj.get("entidades") or []

        total_debt = round(sum(float(e.get("monto", 0.0)) for e in latest_entities), 2)
        worst_situation = max((int(e.get("situacion", 1)) for e in latest_entities), default=1)

        # Build 24-month trajectory
        historial_24m: List[Dict[str, Any]] = []
        for p in periods:
            p_period = p.get("periodo")
            p_entities = p.get("entidades") or []
            p_debt = round(sum(float(e.get("monto", 0.0)) for e in p_entities), 2)
            p_worst = max((int(e.get("situacion", 1)) for e in p_entities), default=1)
            historial_24m.append(
                {
                    "periodo": p_period,
                    "deuda_total": p_debt,
                    "peor_situacion": p_worst,
                    "cantidad_entidades": len(p_entities),
                    "entidades": p_entities,
                }
            )

        # Parse bounced checks
        cheques_results = raw_cheques.get("results") or {}
        causales = cheques_results.get("causales") or []
        parsed_cheques: List[Dict[str, Any]] = []
        monto_total_cheques = 0.0

        for ch in causales:
            monto = float(ch.get("monto", 0.0))
            monto_total_cheques += monto
            parsed_cheques.append(
                {
                    "causal": ch.get("causal", "Sin causal"),
                    "entidad": ch.get("entidad", "Desconocida"),
                    "numeroCheque": ch.get("numeroCheque"),
                    "fechaRechazo": ch.get("fechaRechazo"),
                    "monto": monto,
                    "fechaPago": ch.get("fechaPago"),
                    "estadoMulta": ch.get("estadoMulta", "Impaga"),
                    "pagado": bool(ch.get("fechaPago")),
                }
            )

        return {
            "cuit": cuit,
            "cuit_formateado": format_cuit(cuit),
            "denominacion": denomination,
            "periodo_reciente": latest_period,
            "deuda_total": total_debt,
            "peor_situacion": worst_situation,
            "entidades": latest_entities,
            "historial_24m": historial_24m,
            "cheques_rechazados": parsed_cheques,
            "total_cheques_rechazados": len(parsed_cheques),
            "monto_total_cheques": round(monto_total_cheques, 2),
            "fecha_consulta": datetime.now().isoformat(),
        }
