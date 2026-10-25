"""Synthetic fallback data and mock response generators for BCRA and financial services."""

from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional

MOCK_PRINCIPALES_VARIABLES: List[Dict[str, Any]] = [
    {
        "idVariable": 1,
        "cdSerie": 246,
        "descripcion": "Reservas internacionales del BCRA (en millones de USD)",
        "categoria": "Monetario",
        "unidad": "Millones de USD",
        "fecha": "2026-03-20",
        "valor": 28450.0,
    },
    {
        "idVariable": 4,
        "cdSerie": 272,
        "descripcion": "Tipo de cambio minorista ($ por USD)",
        "categoria": "Cambiario",
        "unidad": "ARS/USD",
        "fecha": "2026-03-20",
        "valor": 1085.50,
    },
    {
        "idVariable": 5,
        "cdSerie": 273,
        "descripcion": "Tipo de cambio mayorista Com. A 3500 ($ por USD)",
        "categoria": "Cambiario",
        "unidad": "ARS/USD",
        "fecha": "2026-03-20",
        "valor": 1055.25,
    },
    {
        "idVariable": 28,
        "cdSerie": 7936,
        "descripcion": "Inflación interanual",
        "categoria": "Precios",
        "unidad": "%",
        "fecha": "2026-03-20",
        "valor": 68.5,
    },
    {
        "idVariable": 7,
        "cdSerie": 7935,
        "descripcion": "BADLAR en pesos de bancos privados (TNA %)",
        "categoria": "Tasas",
        "unidad": "%",
        "fecha": "2026-03-20",
        "valor": 36.5,
    },
    {
        "idVariable": 27,
        "cdSerie": 250,
        "descripcion": "Inflación intermensual",
        "categoria": "Precios",
        "unidad": "%",
        "fecha": "2026-03-20",
        "valor": 2.4,
    },
    {
        "idVariable": 30,
        "cdSerie": 3538,
        "descripcion": "CER (Base 2.2.2002=1)",
        "categoria": "Precios",
        "unidad": "Índice",
        "fecha": "2026-03-20",
        "valor": 485.12,
    },
    {
        "idVariable": 31,
        "cdSerie": 7913,
        "descripcion": "Unidad de valor adquisitivo (UVA) (en pesos)",
        "categoria": "Precios",
        "unidad": "ARS",
        "fecha": "2026-03-20",
        "valor": 1240.35,
    },
]


def generate_mock_history(
    id_variable: int,
    base_value: float,
    days: int = 180,
    desde: Optional[str] = None,
    hasta: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Generates synthetic daily time series data ending at current date."""
    end_dt = datetime.strptime(hasta, "%Y-%m-%d") if hasta else datetime.now()
    start_dt = (
        datetime.strptime(desde, "%Y-%m-%d")
        if desde
        else end_dt - timedelta(days=days)
    )

    results: List[Dict[str, Any]] = []
    current = start_dt
    day_idx = 0

    while current <= end_dt:
        # Generate smooth realistic linear drift without periodic sawtooth artifacts
        factor = 1.0 + (day_idx * 0.0005)
        val = round(base_value * factor, 2)
        results.append(
            {
                "idVariable": id_variable,
                "fecha": current.strftime("%Y-%m-%d"),
                "valor": val,
            }
        )
        current += timedelta(days=1)
        day_idx += 1

    return results


def get_mock_variable_series(
    id_variable: int, desde: Optional[str] = None, hasta: Optional[str] = None
) -> List[Dict[str, Any]]:
    """Returns mock historical series for any requested variable."""
    base_map = {
        1: 27500.0,
        4: 1010.0,
        5: 990.0,
        6: 35.0,
        7: 38.0,
        11: 32.0,
        15: 14500000.0,
        27: 2.5,
        28: 68.5,
        30: 450.0,
        31: 1150.0,
        74: 26000.0,
        77: 25.0,
    }
    base_val = base_map.get(id_variable, 100.0)
    return generate_mock_history(id_variable, base_val, days=365, desde=desde, hasta=hasta)


def generate_mock_fx_history(
    desde: Optional[str] = None,
    hasta: Optional[str] = None,
    days: int = 365,
) -> Dict[str, List[Dict[str, Any]]]:
    """Generates synthetic daily historical cotizaciones for Oficial, MEP, CCL and Blue."""
    end_dt = datetime.strptime(hasta, "%Y-%m-%d") if hasta else datetime.now()
    start_dt = (
        datetime.strptime(desde, "%Y-%m-%d")
        if desde
        else end_dt - timedelta(days=days)
    )

    base_rates = {
        "oficial": 1050.0,
        "mep": 1250.0,
        "ccl": 1290.0,
        "blue": 1300.0,
    }

    results: Dict[str, List[Dict[str, Any]]] = {
        "oficial": [],
        "mep": [],
        "ccl": [],
        "blue": [],
    }

    current = start_dt
    day_idx = 0

    while current <= end_dt:
        fecha_str = current.strftime("%Y-%m-%d")
        factor = 1.0 + (day_idx * 0.0006)
        for key, base in base_rates.items():
            var_offset = 1.0
            if key == "blue":
                var_offset = 1.0 + 0.01 * ((day_idx % 7) - 3) / 10.0
            elif key == "mep":
                var_offset = 1.0 + 0.005 * ((day_idx % 5) - 2) / 10.0
            elif key == "ccl":
                var_offset = 1.0 + 0.008 * ((day_idx % 6) - 2) / 10.0

            val = round(base * factor * var_offset, 2)
            results[key].append(
                {
                    "fecha": fecha_str,
                    "valor": val,
                    "compra": round(val * 0.98, 2),
                    "venta": val,
                }
            )
        current += timedelta(days=1)
        day_idx += 1

    return results


# Synthetic 24-month period generator helper
def _generate_24m_periods(
    base_situation: int,
    entities: List[Dict[str, Any]],
    degrade_recent: bool = False,
) -> List[Dict[str, Any]]:
    """Generates 24 historical periods (YYYYMM) for credit matrix."""
    periods: List[Dict[str, Any]] = []
    base_date = datetime(2026, 2, 1)

    for i in range(24):
        # Go backwards month by month
        year = base_date.year - ((base_date.month - 1 - i) // 12 * -1 if (base_date.month - 1 - i) < 0 else 0)
        # Proper month calculation:
        total_months = base_date.year * 12 + (base_date.month - 1) - i
        p_year = total_months // 12
        p_month = (total_months % 12) + 1
        period_str = f"{p_year}{p_month:02d}"

        period_entities = []
        for ent in entities:
            sit = base_situation
            # If degrade_recent is requested: recent 6 months have worse situation
            if degrade_recent and i < 6:
                sit = min(6, base_situation + 2)
            period_entities.append(
                {
                    "entidad": ent["entidad"],
                    "situacion": sit,
                    "monto": round(ent["monto"] * (1.0 - (i * 0.015)), 1),
                    "diasAtraso": 0 if sit == 1 else (sit * 30),
                    "refinanciaciones": ent.get("refinanciaciones", False),
                    "recategorizacionObligatoria": ent.get("recategorizacionObligatoria", False),
                    "situacionJuridica": ent.get("situacionJuridica", False),
                    "procesoJudicial": ent.get("procesoJudicial", False),
                }
            )

        periods.append({"periodo": period_str, "entidades": period_entities})

    return periods


# Normal corporate profile
_NORMAL_PROFILE = {
    "status": 200,
    "results": {
        "identificacion": "20301234563",
        "denominacion": "DISTRIBUIDORA DEL SUR S.A.",
        "periodos": _generate_24m_periods(
            base_situation=1,
            entities=[
                {"entidad": "BANCO DE GALICIA Y BUENOS AIRES S.A.U.", "monto": 45200.0},
                {"entidad": "BANCO SANTANDER ARGENTINA S.A.", "monto": 18500.0},
            ],
            degrade_recent=False,
        ),
    },
}

# High risk distressed profile
_DISTRESSED_PROFILE = {
    "status": 200,
    "results": {
        "identificacion": "30712345671",
        "denominacion": "LOGISTICA RIOPLATENSE S.R.L.",
        "periodos": _generate_24m_periods(
            base_situation=2,
            entities=[
                {"entidad": "BANCO MACRO S.A.", "monto": 12000.0},
                {"entidad": "FINTECH CREDITO AGIL S.A. (PSP)", "monto": 85000.0},
                {"entidad": "FIDEICOMISO FINANCIERO EXPRESS", "monto": 45000.0},
            ],
            degrade_recent=True,
        ),
    },
}

# Clean profile
_CLEAN_PROFILE = {
    "status": 200,
    "results": {
        "identificacion": "27409876549",
        "denominacion": "ALVAREZ LUCIA MARIANA",
        "periodos": [],
    },
}

MOCK_DEUDORES: Dict[str, Dict[str, Any]] = {
    "20301234563": _NORMAL_PROFILE,
    "20301234567": _NORMAL_PROFILE,
    "30712345671": _DISTRESSED_PROFILE,
    "30712345678": _DISTRESSED_PROFILE,
    "27409876549": _CLEAN_PROFILE,
    "27409876543": _CLEAN_PROFILE,
}

_MOCK_CHEQUES_RECORD = {
    "status": 200,
    "results": {
        "identificacion": "30712345671",
        "denominacion": "LOGISTICA RIOPLATENSE S.R.L.",
        "causales": [
            {
                "causal": "Sin fondos suficientes",
                "entidad": "BANCO MACRO S.A.",
                "numeroCheque": 98124501,
                "fechaRechazo": "2026-02-14",
                "monto": 4200000.0,
                "fechaPago": None,
                "fechaPagoMulta": None,
                "estadoMulta": "Impaga",
                "procesoJudicial": False,
            },
            {
                "causal": "Sin fondos suficientes",
                "entidad": "BANCO MACRO S.A.",
                "numeroCheque": 98124502,
                "fechaRechazo": "2026-02-28",
                "monto": 2750000.0,
                "fechaPago": None,
                "fechaPagoMulta": None,
                "estadoMulta": "Impaga",
                "procesoJudicial": False,
            },
        ],
    },
}

MOCK_CHEQUES: Dict[str, Dict[str, Any]] = {
    "30712345671": _MOCK_CHEQUES_RECORD,
    "30712345678": _MOCK_CHEQUES_RECORD,
}


def get_mock_deudas(cuit: str) -> Dict[str, Any]:
    """Return mock Central de Deudores response for any CUIT."""
    clean_cuit = str(cuit).replace("-", "").strip()
    if clean_cuit in MOCK_DEUDORES:
        profile = MOCK_DEUDORES[clean_cuit]
        results_copy = dict(profile["results"])
        results_copy["identificacion"] = clean_cuit
        return {
            "status": 200,
            "results": results_copy,
        }

    # Dynamic default profile for any other valid CUIT
    return {
        "status": 200,
        "results": {
            "identificacion": clean_cuit,
            "denominacion": f"CONTRIBUYENTE {clean_cuit}",
            "periodos": _generate_24m_periods(
                base_situation=1,
                entities=[
                    {"entidad": "BANCO DE LA NACION ARGENTINA", "monto": 35000.0},
                ],
                degrade_recent=False,
            ),
        },
    }


def get_mock_cheques_rechazados(cuit: str) -> Dict[str, Any]:
    """Return mock Cheques Rechazados response for any CUIT."""
    clean_cuit = str(cuit).replace("-", "").strip()
    if clean_cuit in MOCK_CHEQUES:
        return MOCK_CHEQUES[clean_cuit]

    return {
        "status": 200,
        "results": {
            "identificacion": clean_cuit,
            "denominacion": f"CONTRIBUYENTE {clean_cuit}",
            "causales": [],
        },
    }


MOCK_REM_AVAILABLE_REPORTS: List[str] = [
    "/finanzas/rem/ultimo",
    "/finanzas/rem/2026/09",
    "/finanzas/rem/2026/08",
    "/finanzas/rem/2026/07",
    "/finanzas/rem/2026/06",
    "/finanzas/rem/2026/05",
    "/finanzas/rem/2026/04",
    "/finanzas/rem/2026/03",
    "/finanzas/rem/2026/02",
    "/finanzas/rem/2026/01",
    "/finanzas/rem/2025/12",
    "/finanzas/rem/2025/11",
    "/finanzas/rem/2025/10",
]


def get_mock_rem_reports() -> List[str]:
    """Return mock index of available REM publication endpoints."""
    return list(MOCK_REM_AVAILABLE_REPORTS)


def get_mock_rem_report(period: str = "2026-09") -> List[Dict[str, Any]]:
    """Return realistic mock indicators for a given REM report publication period."""
    clean_period = str(period).replace("/", "-").strip()
    if clean_period.startswith("finanzas-rem-"):
        clean_period = clean_period.replace("finanzas-rem-", "")
    if clean_period == "ultimo":
        clean_period = "2026-09"

    # Default year and month parts
    parts = clean_period.split("-")
    year = int(parts[0]) if len(parts) > 0 and parts[0].isdigit() else 2026
    month = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 9
    report_tag = f"{year}-{month:02d}"
    pub_date = f"{year}-{month:02d}-01"

    results: List[Dict[str, Any]] = []

    # Helpers for date / period labels
    month_names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    roman_quarters = ["I", "II", "III", "IV"]

    def _period_name(m_offset: int) -> str:
        target_m = (month - 1 + m_offset) % 12
        target_y = year + ((month - 1 + m_offset) // 12)
        return f"{month_names[target_m]}-{str(target_y)[2:]}"

    def _quarter_name(q_offset: int) -> str:
        curr_q = (month - 1) // 3
        target_q = (curr_q + q_offset) % 4
        target_y = year + ((curr_q + q_offset) // 4)
        return f"{roman_quarters[target_q]} Trim {str(target_y)[2:]}"

    # Month offset for historical revision variation
    hist_rev = (9 - month)

    indicators_config = [
        {
            "indicador": "Precios minoristas (IPC nivel general-Nacional; INDEC)",
            "unidad": "% mensual",
            "base_val": round(1.9 + (hist_rev * 0.15), 2),
            "monthly_decay": -0.05,
            "unit_12m": "% i.a.",
            "val_12m": round(21.1 + (hist_rev * 1.2), 2),
            "unit_annual": "% anual",
            "val_annual": round(28.0 + (hist_rev * 1.5), 2),
            "val_annual_next": round(15.0 + (hist_rev * 0.8), 2),
            "is_monthly": True,
            "is_quarterly": False,
        },
        {
            "indicador": "Precios minoristas (IPC núcleo-Nacional; INDEC)",
            "unidad": "% mensual",
            "base_val": round(1.8 + (hist_rev * 0.12), 2),
            "monthly_decay": -0.04,
            "unit_12m": "% i.a.",
            "val_12m": round(21.2 + (hist_rev * 1.0), 2),
            "unit_annual": "% anual",
            "val_annual": round(26.0 + (hist_rev * 1.4), 2),
            "val_annual_next": round(14.0 + (hist_rev * 0.7), 2),
            "is_monthly": True,
            "is_quarterly": False,
        },
        {
            "indicador": "Tipo de cambio nominal",
            "unidad": "$/USD",
            "base_val": round(1055.0 - (hist_rev * 18.0), 2),
            "monthly_decay": 21.0,  # crawling peg increment
            "unit_12m": "$/USD",
            "val_12m": round(1320.0 - (hist_rev * 20.0), 2),
            "unit_annual": "$/USD",
            "val_annual": round(1250.0 - (hist_rev * 22.0), 2),
            "val_annual_next": round(1580.0 - (hist_rev * 30.0), 2),
            "is_monthly": True,
            "is_quarterly": False,
        },
        {
            "indicador": "Tasa de interés (TAMAR)",
            "unidad": "% TNA",
            "base_val": round(35.0 + (hist_rev * 1.2), 2),
            "monthly_decay": -0.4,
            "unit_12m": "% TNA",
            "val_12m": round(28.5 + (hist_rev * 0.8), 2),
            "unit_annual": "% TNA",
            "val_annual": round(32.0 + (hist_rev * 1.0), 2),
            "val_annual_next": round(24.0 + (hist_rev * 0.5), 2),
            "is_monthly": True,
            "is_quarterly": False,
        },
        {
            "indicador": "PIB a precios constantes",
            "unidad": "Var. % anual",
            "base_val": round(3.5 - (hist_rev * 0.1), 2),
            "monthly_decay": 0.0,
            "quarterly_base": round(3.2 - (hist_rev * 0.1), 2),
            "quarterly_step": 0.3,
            "unit_quarterly": "Var. % i.a.",
            "unit_12m": "Var. % anual",
            "val_12m": round(4.0 - (hist_rev * 0.1), 2),
            "unit_annual": "Var. % anual",
            "val_annual": round(3.5 - (hist_rev * 0.1), 2),
            "val_annual_next": round(4.5 - (hist_rev * 0.1), 2),
            "is_monthly": False,
            "is_quarterly": True,
        },
        {
            "indicador": "Desocupación abierta",
            "unidad": "% de la PEA",
            "base_val": round(7.7 + (hist_rev * 0.1), 2),
            "monthly_decay": -0.1,
            "quarterly_base": round(7.7 + (hist_rev * 0.1), 2),
            "quarterly_step": -0.2,
            "unit_quarterly": "% de la PEA",
            "unit_12m": "% de la PEA",
            "val_12m": round(7.2 + (hist_rev * 0.1), 2),
            "unit_annual": "% de la PEA",
            "val_annual": round(7.7 + (hist_rev * 0.1), 2),
            "val_annual_next": round(7.0 + (hist_rev * 0.1), 2),
            "is_monthly": False,
            "is_quarterly": True,
        },
        {
            "indicador": "Resultado primario del SPNF",
            "unidad": "Billones $",
            "base_val": round(11.5 + (hist_rev * 0.3), 2),
            "monthly_decay": 0.0,
            "quarterly_base": round(2.85 + (hist_rev * 0.08), 2),
            "quarterly_step": 0.25,
            "unit_quarterly": "Billones $",
            "unit_12m": "Billones $",
            "val_12m": round(12.5 + (hist_rev * 0.4), 2),
            "unit_annual": "Billones $",
            "val_annual": round(11.5 + (hist_rev * 0.3), 2),
            "val_annual_next": round(14.8 + (hist_rev * 0.4), 2),
            "is_monthly": False,
            "is_quarterly": True,
        },
        {
            "indicador": "Exportaciones (FOB)",
            "unidad": "Mill. USD",
            "base_val": round(6830.0 + (hist_rev * 50.0), 2),
            "monthly_decay": 40.0,
            "quarterly_base": round(20500.0 + (hist_rev * 150.0), 2),
            "quarterly_step": 600.0,
            "unit_quarterly": "Mill. USD",
            "unit_12m": "Mill. USD",
            "val_12m": round(83500.0 + (hist_rev * 500.0), 2),
            "unit_annual": "Mill. USD",
            "val_annual": round(82500.0 + (hist_rev * 500.0), 2),
            "val_annual_next": round(87000.0 + (hist_rev * 600.0), 2),
            "is_monthly": True,
            "is_quarterly": True,
        },
        {
            "indicador": "Importaciones (CIF)",
            "unidad": "Mill. USD",
            "base_val": round(5500.0 + (hist_rev * 40.0), 2),
            "monthly_decay": 50.0,
            "quarterly_base": round(16500.0 + (hist_rev * 120.0), 2),
            "quarterly_step": 600.0,
            "unit_quarterly": "Mill. USD",
            "unit_12m": "Mill. USD",
            "val_12m": round(68000.0 + (hist_rev * 400.0), 2),
            "unit_annual": "Mill. USD",
            "val_annual": round(66500.0 + (hist_rev * 400.0), 2),
            "val_annual_next": round(72000.0 + (hist_rev * 500.0), 2),
            "is_monthly": True,
            "is_quarterly": True,
        },
    ]

    for cohort in ("todos", "top_10"):
        cohort_factor = 0.98 if cohort == "top_10" else 1.0
        participants = 10 if cohort == "top_10" else 38

        for item in indicators_config:
            ind_name = item["indicador"]
            unit = item["unidad"]
            base = item["base_val"] * cohort_factor
            decay = item.get("monthly_decay", 0.0)

            def _record(p_name: str, p_type: str, val: float, u: str, p_desde: str, p_hasta: str, ref: str) -> Dict[str, Any]:
                val_r = round(val, 2)
                p10 = round(val_r * 0.90, 2)
                p25 = round(val_r * 0.96, 2)
                p75 = round(val_r * 1.04, 2)
                p90 = round(val_r * 1.10, 2)
                vmin = round(val_r * 0.85, 2)
                vmax = round(val_r * 1.15, 2)
                # Ensure monotonicity for negative or zero values
                if vmin > vmax:
                    vmin, vmax = vmax, vmin
                if p10 > p90:
                    p10, p90 = p90, p10
                if p25 > p75:
                    p25, p75 = p75, p25
                return {
                    "informe": report_tag,
                    "fecha": pub_date,
                    "muestra": cohort,
                    "indicador": ind_name,
                    "periodo": p_name,
                    "periodoTipo": p_type,
                    "periodoDesde": p_desde,
                    "periodoHasta": p_hasta,
                    "referencia": ref,
                    "referenciaFecha": p_hasta,
                    "unidad": u,
                    "mediana": val_r,
                    "promedio": round(val_r * 1.01, 2),
                    "desvio": round(abs(val_r) * 0.08, 2),
                    "minimo": vmin,
                    "maximo": vmax,
                    "percentil10": p10,
                    "percentil25": p25,
                    "percentil75": p75,
                    "percentil90": p90,
                    "participantes": participants,
                    "fuente": "BCRA REM",
                    "publicacionUrl": "https://www.bcra.gob.ar/publicaciones/rem/",
                    "xlsxUrl": "https://www.bcra.gob.ar/archivos/rem.xlsx",
                }

            # 1. Monthly projections (if applicable)
            if item.get("is_monthly", False):
                for offset in range(7):
                    val = base + (offset * decay)
                    p_name = _period_name(offset)
                    results.append(_record(
                        p_name=p_name,
                        p_type="mensual",
                        val=val,
                        u=unit,
                        p_desde=pub_date,
                        p_hasta=pub_date,
                        ref=f"Periodo {p_name}"
                    ))

            # 2. Quarterly projections (if applicable)
            if item.get("is_quarterly", False):
                q_base = item.get("quarterly_base", base) * cohort_factor
                q_step = item.get("quarterly_step", 0.0)
                q_unit = item.get("unit_quarterly", unit)
                for q_offset in range(4):
                    val = q_base + (q_offset * q_step)
                    q_name = _quarter_name(q_offset)
                    results.append(_record(
                        p_name=q_name,
                        p_type="trimestral",
                        val=val,
                        u=q_unit,
                        p_desde=pub_date,
                        p_hasta=pub_date,
                        ref=f"Periodo {q_name}"
                    ))

            # 3. Proximos 12 meses
            if "val_12m" in item:
                val_12m = item["val_12m"] * cohort_factor
                results.append(_record(
                    p_name="próx. 12 meses",
                    p_type="proximos_12_meses",
                    val=val_12m,
                    u=item.get("unit_12m", unit),
                    p_desde=pub_date,
                    p_hasta=pub_date,
                    ref="Próximos 12 meses"
                ))

            # 4. Annual projection (Year current)
            val_ann = item["val_annual"] * cohort_factor
            results.append(_record(
                p_name=str(year),
                p_type="anual",
                val=val_ann,
                u=item.get("unit_annual", unit),
                p_desde=f"{year}-01-01",
                p_hasta=f"{year}-12-31",
                ref=f"Año {year}"
            ))

            # 5. Annual projection (Year + 1)
            if "val_annual_next" in item:
                val_ann_next = item["val_annual_next"] * cohort_factor
                next_y = year + 1
                results.append(_record(
                    p_name=str(next_y),
                    p_type="anual",
                    val=val_ann_next,
                    u=item.get("unit_annual", unit),
                    p_desde=f"{next_y}-01-01",
                    p_hasta=f"{next_y}-12-31",
                    ref=f"Año {next_y}"
                ))

    return results
