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
                "alertas_tempranas": [],
                "nivel_riesgo": "OPTIMAL",
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

        report = {
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

        # Evaluate early-warning alert badges & risk level
        badges = evaluate_risk_badges(report)
        risk_level = compute_risk_level(report, badges)
        report["alertas_tempranas"] = badges
        report["nivel_riesgo"] = risk_level

        return report


def evaluate_risk_badges(debtor_report: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Evaluates standardized early-warning risk badges from debtor report data."""
    badges: List[Dict[str, Any]] = []
    current_sit = int(debtor_report.get("peor_situacion", 1))
    historial = debtor_report.get("historial_24m", [])
    total_debt = float(debtor_report.get("deuda_total", 0.0))

    # 1. Credit Deterioration in last 6 months (DETERIORATION_6M)
    if len(historial) > 1:
        recent_window = historial[1:min(7, len(historial))]
        if recent_window:
            baseline_sit = min(int(p.get("peor_situacion", 1)) for p in recent_window)
            if current_sit > baseline_sit:
                diff = current_sit - baseline_sit
                badges.append({
                    "code": "DETERIORATION_6M",
                    "severity": "CRITICAL" if current_sit >= 4 else "HIGH",
                    "title": "Deterioro Crediticio Reciente",
                    "description": f"La calificación crediticia empeoró de Situación {baseline_sit} a Situación {current_sit} en los últimos 6 meses.",
                    "metric": f"+{diff} escalón{'es' if diff > 1 else ''}",
                })

    # 2. Non-Bank Lender Concentration (NON_BANK_CONCENTRATION)
    entities = debtor_report.get("entidades", [])
    if total_debt > 0 and entities:
        non_bank_debt = 0.0
        non_bank_keywords = ("FINTECH", "PSP", "FIDEICOMISO", "MUTUAL", "COOP", "TARJETA", "PRESTAMO", "FINANCIERA")
        for ent in entities:
            name_upper = ent.get("entidad", "").upper()
            is_bank = "BANCO" in name_upper
            is_non_bank = any(kw in name_upper for kw in non_bank_keywords)
            if is_non_bank or not is_bank:
                non_bank_debt += float(ent.get("monto", 0.0))

        non_bank_pct = round((non_bank_debt / total_debt) * 100, 1)
        if non_bank_pct >= 40.0:
            badges.append({
                "code": "NON_BANK_CONCENTRATION",
                "severity": "HIGH" if non_bank_pct >= 60.0 else "MEDIUM",
                "title": "Concentración No Bancaria",
                "description": f"El {non_bank_pct}% de la deuda total se concentra en entidades no bancarias o fintechs.",
                "metric": f"{non_bank_pct}% no bancario",
            })

    # 3. Recent Unpaid Bounced Checks (UNPAID_CHECKS_90D)
    cheques = debtor_report.get("cheques_rechazados", [])
    unpaid_cheques = [ch for ch in cheques if not ch.get("pagado")]
    if unpaid_cheques:
        unpaid_sum = sum(float(ch.get("monto", 0.0)) for ch in unpaid_cheques)
        badges.append({
            "code": "UNPAID_CHECKS_90D",
            "severity": "CRITICAL",
            "title": "Cheques Rechazados Impagos",
            "description": f"Registra {len(unpaid_cheques)} cheque(s) rechazado(s) impago(s) por un monto total de ${unpaid_sum:,.2f}.",
            "metric": f"{len(unpaid_cheques)} impagos",
        })

    # 4. Debt Acceleration YoY (DEBT_ACCELERATION_YOY)
    if len(historial) >= 12:
        past_12m = historial[11]
        past_debt = float(past_12m.get("deuda_total", 0.0))
        if past_debt > 0 and total_debt > past_debt:
            growth_pct = round(((total_debt - past_debt) / past_debt) * 100, 1)
            if growth_pct >= 50.0:
                badges.append({
                    "code": "DEBT_ACCELERATION_YOY",
                    "severity": "HIGH" if growth_pct >= 100.0 else "MEDIUM",
                    "title": "Aceleración de Deuda Interanual",
                    "description": f"El volumen de deuda creció un {growth_pct}% interanual comparado contra 12 meses atrás.",
                    "metric": f"+{growth_pct}% i.a.",
                })

    return badges


def compute_risk_level(debtor_report: Dict[str, Any], badges: List[Dict[str, Any]]) -> str:
    """Computes overall debtor risk rating: OPTIMAL, LOW, MODERATE, HIGH, CRITICAL."""
    worst_sit = int(debtor_report.get("peor_situacion", 1))
    severities = {b["severity"] for b in badges}

    if worst_sit >= 4 or "CRITICAL" in severities:
        return "CRITICAL"
    if worst_sit == 3 or "HIGH" in severities:
        return "HIGH"
    if worst_sit == 2 or "MEDIUM" in severities:
        return "MODERATE"
    if float(debtor_report.get("deuda_total", 0.0)) > 0:
        return "LOW"
    return "OPTIMAL"
