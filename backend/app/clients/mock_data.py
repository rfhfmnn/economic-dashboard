"""Synthetic fallback data and mock response generators for BCRA and financial services."""

from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional

MOCK_PRINCIPALES_VARIABLES: List[Dict[str, Any]] = [
    {
        "idVariable": 1,
        "cdSerie": 246,
        "descripcion": "Reservas Internacionales del BCRA (en millones de USD)",
        "categoria": "Monetario",
        "unidad": "Millones de USD",
        "fecha": "2026-03-20",
        "valor": 28450.0,
    },
    {
        "idVariable": 4,
        "cdSerie": 272,
        "descripcion": "Tipo de Cambio Minorista ($ por USD)",
        "categoria": "Cambiario",
        "unidad": "ARS/USD",
        "fecha": "2026-03-20",
        "valor": 1085.50,
    },
    {
        "idVariable": 5,
        "cdSerie": 273,
        "descripcion": "Tipo de Cambio Mayorista Com. A 3500 ($ por USD)",
        "categoria": "Cambiario",
        "unidad": "ARS/USD",
        "fecha": "2026-03-20",
        "valor": 1055.25,
    },
    {
        "idVariable": 6,
        "cdSerie": 7927,
        "descripcion": "Tasa de Política Monetaria (TNA %)",
        "categoria": "Tasas",
        "unidad": "%",
        "fecha": "2026-03-20",
        "valor": 32.0,
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
        "descripcion": "Inflación mensual",
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
        "descripcion": "Unidad de Valor Adquisitivo (UVA) (en pesos)",
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
