"""Parallel FX Rates Client querying DolarApi and computing Brecha Cambiaria spreads."""

import logging
import os
from typing import Any, Dict, List, Optional
import httpx

logger = logging.getLogger(__name__)

MOCK_FX_RATES: List[Dict[str, Any]] = [
    {
        "moneda": "USD",
        "casa": "oficial",
        "nombre": "Oficial",
        "compra": 1045.0,
        "venta": 1085.0,
        "fechaActualizacion": "2026-03-20T17:00:00.000Z",
    },
    {
        "moneda": "USD",
        "casa": "mayorista",
        "nombre": "Mayorista",
        "compra": 1050.0,
        "venta": 1055.25,
        "fechaActualizacion": "2026-03-20T17:00:00.000Z",
    },
    {
        "moneda": "USD",
        "casa": "blue",
        "nombre": "Blue",
        "compra": 1280.0,
        "venta": 1300.0,
        "fechaActualizacion": "2026-03-20T17:00:00.000Z",
    },
    {
        "moneda": "USD",
        "casa": "bolsa",
        "nombre": "Bolsa (MEP)",
        "compra": 1245.0,
        "venta": 1250.50,
        "fechaActualizacion": "2026-03-20T17:00:00.000Z",
    },
    {
        "moneda": "USD",
        "casa": "contadoconliquidacion",
        "nombre": "Contado con Liquidación (CCL)",
        "compra": 1285.0,
        "venta": 1290.0,
        "fechaActualizacion": "2026-03-20T17:00:00.000Z",
    },
    {
        "moneda": "USD",
        "casa": "tarjeta",
        "nombre": "Tarjeta",
        "compra": 1700.0,
        "venta": 1736.0,
        "fechaActualizacion": "2026-03-20T17:00:00.000Z",
    },
]


def calculate_brecha(parallel_rate: float, official_rate: float) -> float:
    """Computes the percentage spread (brecha cambiaria) between a parallel rate and official rate.

    Formula: ((parallel_rate - official_rate) / official_rate) * 100
    Rounded to 2 decimal places.
    """
    if official_rate <= 0:
        raise ValueError("official_rate must be greater than zero")
    return round(((parallel_rate - official_rate) / official_rate) * 100, 2)


class FXClient:
    """Client for retrieving financial exchange rates and computing spreads."""

    def __init__(
        self,
        base_url: str = "https://dolarapi.com/v1/dolares",
        timeout: float = 8.0,
        force_mock: Optional[bool] = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

        if force_mock is not None:
            self.force_mock = force_mock
        else:
            self.force_mock = os.getenv("FORCE_MOCK", "false").lower() in ("true", "1")

        self.client = httpx.Client(
            timeout=self.timeout,
            headers={"User-Agent": "EconomicRiskDashboard/1.0", "Accept": "application/json"},
        )

    def get_all_rates(self) -> List[Dict[str, Any]]:
        """Fetch all current dollar quotations."""
        if self.force_mock:
            return MOCK_FX_RATES

        try:
            response = self.client.get(self.base_url)
            response.raise_for_status()
            data = response.json()
            if isinstance(data, list) and len(data) > 0:
                return data
            return MOCK_FX_RATES
        except Exception as exc:
            logger.warning(
                "FX API request to %s failed (%s: %s). Falling back to mock FX rates.",
                self.base_url,
                type(exc).__name__,
                exc,
            )
            return MOCK_FX_RATES

    def get_rate(self, casa: str) -> Optional[Dict[str, Any]]:
        """Get quote for a specific market house (e.g., 'blue', 'mep'/'bolsa', 'ccl'/'contadoconliquidacion')."""
        casa_alias = {
            "mep": "bolsa",
            "ccl": "contadoconliquidacion",
        }
        target_casa = casa_alias.get(casa.lower(), casa.lower())
        rates = self.get_all_rates()
        for r in rates:
            if r.get("casa", "").lower() == target_casa:
                return r
        return None

    def get_spreads_summary(self, official_base: str = "mayorista") -> Dict[str, Any]:
        """Compute spread values and percentage brechas against an official base rate."""
        rates = self.get_all_rates()
        rates_by_casa = {r.get("casa", "").lower(): r for r in rates}

        # Resolve official baseline (default mayorista, fallback to oficial)
        base_quote = rates_by_casa.get(official_base.lower()) or rates_by_casa.get("oficial")
        if not base_quote or not base_quote.get("venta"):
            base_quote = {
                "casa": "mayorista",
                "nombre": "Mayorista",
                "compra": 1050.0,
                "venta": 1055.25,
            }

        official_selling = float(base_quote["venta"])

        targets = [
            ("mep", "bolsa", "Dólar MEP / Bolsa"),
            ("ccl", "contadoconliquidacion", "Dólar CCL / Cable"),
            ("blue", "blue", "Dólar Blue / Informal"),
        ]

        spreads: Dict[str, Any] = {}
        for key, casa_key, label in targets:
            quote = rates_by_casa.get(casa_key)
            if quote and quote.get("venta"):
                parallel_selling = float(quote["venta"])
                spreads[key] = {
                    "nombre": label,
                    "casa": casa_key,
                    "compra": quote.get("compra"),
                    "venta": parallel_selling,
                    "spread_ars": round(parallel_selling - official_selling, 2),
                    "brecha_pct": calculate_brecha(parallel_selling, official_selling),
                    "fechaActualizacion": quote.get("fechaActualizacion"),
                }

        return {
            "base": {
                "casa": base_quote.get("casa"),
                "nombre": base_quote.get("nombre"),
                "compra": base_quote.get("compra"),
                "venta": official_selling,
                "fechaActualizacion": base_quote.get("fechaActualizacion"),
            },
            "spreads": spreads,
        }

    def close(self) -> None:
        """Close HTTP client pool."""
        self.client.close()
