import logging
import os
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
import httpx

from backend.app.clients.mock_data import generate_mock_fx_history

logger = logging.getLogger(__name__)

ARGENTINA_DATOS_SERIES: Dict[str, str] = {
    "oficial": "https://api.argentinadatos.com/v1/cotizaciones/dolares/oficial",
    "mep": "https://api.argentinadatos.com/v1/cotizaciones/dolares/bolsa",
    "ccl": "https://api.argentinadatos.com/v1/cotizaciones/dolares/contadoconliqui",
    "blue": "https://api.argentinadatos.com/v1/cotizaciones/dolares/blue",
}

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
        self._fx_history_cache: Optional[Dict[str, List[Dict[str, Any]]]] = None
        self._fx_history_cache_time: Optional[datetime] = None
        self._cache_ttl_seconds: int = 900

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
        """Get quote for a specific market house (e.g., 'blue', 'mep'/'bolsa', 'ccl'/'contadoconliqui')."""
        casa_lower = casa.lower()
        rates = self.get_all_rates()

        # Direct exact match
        for r in rates:
            if r.get("casa", "").lower() == casa_lower:
                return r

        # MEP / Bolsa aliases
        if casa_lower in ("mep", "bolsa"):
            for r in rates:
                if r.get("casa", "").lower() in ("bolsa", "mep"):
                    return r

        # CCL / Contado con Liquidación aliases (DolarApi uses 'contadoconliqui')
        if casa_lower in ("ccl", "cable", "contadoconliqui", "contadoconliquidacion"):
            for r in rates:
                c = r.get("casa", "").lower()
                if c in ("contadoconliqui", "contadoconliquidacion", "ccl") or c.startswith("contadocon"):
                    return r

        return None

    def get_spreads_summary(self, official_base: str = "mayorista") -> Dict[str, Any]:
        """Compute spread values and percentage brechas against an official base rate."""
        rates = self.get_all_rates()
        rates_by_casa: Dict[str, Any] = {}
        for r in rates:
            c = r.get("casa", "").lower()
            rates_by_casa[c] = r
            if c.startswith("contadocon"):
                rates_by_casa["ccl"] = r
                rates_by_casa["contadoconliqui"] = r
                rates_by_casa["contadoconliquidacion"] = r
            elif c in ("bolsa", "mep"):
                rates_by_casa["mep"] = r
                rates_by_casa["bolsa"] = r

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
            ("mep", ["bolsa", "mep"], "Dólar MEP / Bolsa"),
            ("ccl", ["contadoconliqui", "contadoconliquidacion", "ccl"], "Dólar CCL / Cable"),
            ("blue", ["blue"], "Dólar Blue / Informal"),
        ]

        spreads: Dict[str, Any] = {}
        for key, candidate_keys, label in targets:
            quote = None
            for ck in candidate_keys:
                if ck in rates_by_casa:
                    quote = rates_by_casa[ck]
                    break

            if quote and quote.get("venta"):
                parallel_selling = float(quote["venta"])
                spreads[key] = {
                    "nombre": label,
                    "casa": quote.get("casa", key),
                    "compra": quote.get("compra"),
                    "venta": parallel_selling,
                    "spread_ars": round(parallel_selling - official_selling, 2),
                    "brecha_pct": calculate_brecha(parallel_selling, official_selling),
                    "fechaActualizacion": quote.get("fechaActualizacion"),
                }

        return {
            "oficial_base": official_selling,
            "base": {
                "casa": base_quote.get("casa"),
                "nombre": base_quote.get("nombre"),
                "compra": base_quote.get("compra"),
                "venta": official_selling,
                "fechaActualizacion": base_quote.get("fechaActualizacion"),
            },
            "rates": rates_by_casa,
            "spreads": spreads,
        }

    def get_historical_rates(
        self, desde: Optional[str] = None, hasta: Optional[str] = None
    ) -> Dict[str, Any]:
        """Fetch historical exchange rate series for Oficial, MEP, CCL and Blue.

        Uses ArgentinaDatos endpoints with fallback to synthetic data.
        """
        if self.force_mock:
            mock_rates = generate_mock_fx_history(desde=desde, hasta=hasta)
            return {
                "rates": mock_rates,
                "last_updated": datetime.now().isoformat(),
                "source": "mock",
            }

        now = datetime.now()
        raw_rates = None
        if self._fx_history_cache and self._fx_history_cache_time:
            if (now - self._fx_history_cache_time).total_seconds() < self._cache_ttl_seconds:
                raw_rates = self._fx_history_cache

        if raw_rates is None:
            fetched: Dict[str, List[Dict[str, Any]]] = {}

            def _fetch_series(casa_key: str, url: str):
                try:
                    resp = self.client.get(url)
                    resp.raise_for_status()
                    data = resp.json()
                    pts: List[Dict[str, Any]] = []
                    if isinstance(data, list):
                        for item in data:
                            fecha = item.get("fecha")
                            venta = item.get("venta")
                            compra = item.get("compra", 0) or 0
                            if fecha and venta is not None:
                                pts.append(
                                    {
                                        "fecha": str(fecha),
                                        "valor": float(venta),
                                        "compra": float(compra),
                                        "venta": float(venta),
                                    }
                                )
                    return casa_key, pts
                except Exception as exc:
                    logger.warning(
                        "Failed fetching historical FX for %s from %s (%s: %s)",
                        casa_key,
                        url,
                        type(exc).__name__,
                        exc,
                    )
                    return casa_key, []

            with ThreadPoolExecutor(max_workers=4) as executor:
                futures = [
                    executor.submit(_fetch_series, k, u)
                    for k, u in ARGENTINA_DATOS_SERIES.items()
                ]
                for f in futures:
                    k, pts = f.result()
                    fetched[k] = pts

            if any(len(pts) == 0 for pts in fetched.values()):
                logger.warning(
                    "One or more historical FX series failed; using synthetic fallback."
                )
                raw_rates = generate_mock_fx_history(days=1825)
            else:
                raw_rates = fetched
                self._fx_history_cache = raw_rates
                self._fx_history_cache_time = now

        # Filter and sort
        filtered_rates: Dict[str, List[Dict[str, Any]]] = {}
        for k, pts in raw_rates.items():
            filtered = [
                p
                for p in pts
                if (not desde or p["fecha"] >= desde)
                and (not hasta or p["fecha"] <= hasta)
            ]
            filtered.sort(key=lambda x: x["fecha"])
            filtered_rates[k] = filtered

        return {
            "rates": filtered_rates,
            "last_updated": datetime.now().isoformat(),
            "source": "argentinadatos" if self._fx_history_cache else "mock",
        }

    def close(self) -> None:
        """Close HTTP client pool."""
        self.client.close()
