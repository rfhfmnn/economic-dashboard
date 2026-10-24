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

    # Months ahead helper
    month_names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

    def _period_name(m_offset: int) -> str:
        target_m = (month - 1 + m_offset) % 12
        target_y = year + ((month - 1 + m_offset) // 12)
        return f"{month_names[target_m]}-{str(target_y)[2:]}"

    indicators_config = [
        {
            "indicador": "Precios minoristas (IPC nivel general-Nacional; INDEC)",
            "unidad": "% mensual",
            "base_val": 1.9,
            "monthly_decay": -0.05,
            "unit_12m": "% i.a.",
            "val_12m": 21.1,
            "unit_annual": "% anual",
            "val_annual": 30.0,
        },
        {
            "indicador": "Precios minoristas (IPC núcleo-Nacional; INDEC)",
            "unidad": "% mensual",
            "base_val": 1.8,
            "monthly_decay": -0.04,
            "unit_12m": "% i.a.",
            "val_12m": 21.2,
            "unit_annual": "% anual",
            "val_annual": 28.0,
        },
        {
            "indicador": "Tipo de cambio nominal",
            "unidad": "$/USD",
            "base_val": 1055.0,
            "monthly_decay": 21.0,  # crawling peg increment
            "unit_12m": "$/USD",
            "val_12m": 1320.0,
            "unit_annual": "$/USD",
            "val_annual": 1250.0,
        },
        {
            "indicador": "Tasa de interés (TAMAR)",
            "unidad": "% TNA",
            "base_val": 35.0,
            "monthly_decay": -0.4,
            "unit_12m": "% TNA",
            "val_12m": 28.5,
            "unit_annual": "% TNA",
            "val_annual": 32.0,
        },
        {
            "indicador": "PIB a precios constantes",
            "unidad": "Var. % anual",
            "base_val": 3.5,
            "monthly_decay": 0.0,
            "unit_12m": "Var. % anual",
            "val_12m": 4.0,
            "unit_annual": "Var. % anual",
            "val_annual": 3.5,
        },
        {
            "indicador": "Desocupación abierta",
            "unidad": "% de la PEA",
            "base_val": 7.7,
            "monthly_decay": -0.1,
            "unit_12m": "% de la PEA",
            "val_12m": 7.2,
            "unit_annual": "% de la PEA",
            "val_annual": 7.7,
        },
    ]

    for cohort in ("todos", "top_10"):
        cohort_factor = 0.98 if cohort == "top_10" else 1.0
        participants = 10 if cohort == "top_10" else 38

        for item in indicators_config:
            ind_name = item["indicador"]
            unit = item["unidad"]
            base = item["base_val"] * cohort_factor
            decay = item["monthly_decay"]

            # Monthly projections (current month + 6 future months)
            for offset in range(7):
                val = round(base + (offset * decay), 2)
                p_name = _period_name(offset)
                results.append({
                    "informe": report_tag,
                    "fecha": pub_date,
                    "muestra": cohort,
                    "indicador": ind_name,
                    "periodo": p_name,
                    "periodoTipo": "mensual",
                    "periodoDesde": pub_date,
                    "periodoHasta": pub_date,
                    "referencia": f"Periodo {p_name}",
                    "referenciaFecha": pub_date,
                    "unidad": unit,
                    "mediana": val,
                    "promedio": round(val * 1.01, 2),
                    "desvio": round(abs(val) * 0.08, 2),
                    "maximo": round(val * 1.15, 2),
                    "minimo": round(val * 0.85, 2),
                    "percentil90": round(val * 1.10, 2),
                    "percentil75": round(val * 1.04, 2),
                    "percentil25": round(val * 0.96, 2),
                    "percentil10": round(val * 0.90, 2),
                    "participantes": participants,
                    "fuente": "BCRA REM",
                    "publicacionUrl": "https://www.bcra.gob.ar/publicaciones/rem/",
                    "xlsxUrl": "https://www.bcra.gob.ar/archivos/rem.xlsx",
                })

            # Proximos 12 meses
            val_12m = round(item["val_12m"] * cohort_factor, 2)
            results.append({
                "informe": report_tag,
                "fecha": pub_date,
                "muestra": cohort,
                "indicador": ind_name,
                "periodo": "próx. 12 meses",
                "periodoTipo": "proximos_12_meses",
                "periodoDesde": pub_date,
                "periodoHasta": pub_date,
                "referencia": "Próximos 12 meses",
                "referenciaFecha": pub_date,
                "unidad": item.get("unit_12m", unit),
                "mediana": val_12m,
                "promedio": round(val_12m * 1.01, 2),
                "desvio": round(abs(val_12m) * 0.08, 2),
                "maximo": round(val_12m * 1.2, 2),
                "minimo": round(val_12m * 0.8, 2),
                "percentil90": round(val_12m * 1.1, 2),
                "percentil75": round(val_12m * 1.05, 2),
                "percentil25": round(val_12m * 0.95, 2),
                "percentil10": round(val_12m * 0.90, 2),
                "participantes": participants,
                "fuente": "BCRA REM",
                "publicacionUrl": "https://www.bcra.gob.ar/publicaciones/rem/",
                "xlsxUrl": "https://www.bcra.gob.ar/archivos/rem.xlsx",
            })

            # Annual projection
            val_ann = round(item["val_annual"] * cohort_factor, 2)
            results.append({
                "informe": report_tag,
                "fecha": pub_date,
                "muestra": cohort,
                "indicador": ind_name,
                "periodo": str(year),
                "periodoTipo": "anual",
                "periodoDesde": f"{year}-01-01",
                "periodoHasta": f"{year}-12-31",
                "referencia": f"Año {year}",
                "referenciaFecha": f"{year}-12-31",
                "unidad": item.get("unit_annual", unit),
                "mediana": val_ann,
                "promedio": round(val_ann * 1.01, 2),
                "desvio": round(abs(val_ann) * 0.08, 2),
                "maximo": round(val_ann * 1.15, 2),
                "minimo": round(val_ann * 0.85, 2),
                "percentil90": round(val_ann * 1.10, 2),
                "percentil75": round(val_ann * 1.05, 2),
                "percentil25": round(val_ann * 0.95, 2),
                "percentil10": round(val_ann * 0.90, 2),
                "participantes": participants,
                "fuente": "BCRA REM",
                "publicacionUrl": "https://www.bcra.gob.ar/publicaciones/rem/",
                "xlsxUrl": "https://www.bcra.gob.ar/archivos/rem.xlsx",
            })

    return results
