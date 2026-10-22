"""Resilient HTTP Client for BCRA Estadísticas and Central de Deudores APIs with mock fallback."""

import logging
import os
import ssl
from typing import Any, Callable, Dict, List, Optional
import httpx

from backend.app.clients.mock_data import (
    MOCK_PRINCIPALES_VARIABLES,
    get_mock_cheques_rechazados,
    get_mock_deudas,
    get_mock_variable_series,
)

logger = logging.getLogger(__name__)


class BCRAClient:
    """HTTP client querying BCRA public endpoints with resilient SSL handling and synthetic fallback."""

    def __init__(
        self,
        base_url: str = "https://api.bcra.gob.ar",
        timeout: float = 10.0,
        force_mock: Optional[bool] = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

        if force_mock is not None:
            self.force_mock = force_mock
        else:
            self.force_mock = (
                os.getenv("FORCE_MOCK", "false").lower() in ("true", "1")
                or os.getenv("BCRA_USE_MOCKS", "false").lower() in ("true", "1")
            )

        # Custom SSL context to accommodate Argentine government certificate chains
        ssl_context = ssl.create_default_context()
        ssl_context.check_hostname = False
        ssl_context.verify_mode = ssl.CERT_NONE

        self.client = httpx.Client(
            verify=False,
            timeout=self.timeout,
            headers={
                "User-Agent": "EconomicRiskDashboard/1.0",
                "Accept": "application/json",
            },
        )

    def _execute_with_fallback(
        self,
        url: str,
        fallback_fn: Callable[[], Any],
        params: Optional[Dict[str, Any]] = None,
    ) -> Any:
        """Executes HTTP GET and seamlessly falls back to synthetic mock data on error."""
        if self.force_mock:
            logger.info("force_mock is active; returning synthetic fallback data for %s", url)
            return fallback_fn()

        try:
            response = self.client.get(url, params=params)
            response.raise_for_status()
            data = response.json()
            # If BCRA returned empty or error status inside JSON payload
            if isinstance(data, dict) and data.get("status") in (404, 500):
                logger.warning("BCRA endpoint %s returned status %s; triggering fallback", url, data.get("status"))
                return fallback_fn()
            return data
        except (httpx.HTTPError, httpx.TimeoutException, Exception) as exc:
            logger.warning(
                "BCRA API request to %s failed (%s: %s). Seamlessly falling back to mock data.",
                url,
                type(exc).__name__,
                exc,
            )
            return fallback_fn()

    def get_principales_variables(self) -> List[Dict[str, Any]]:
        """Fetch latest snapshot of all BCRA primary macroeconomic variables."""
        url = f"{self.base_url}/estadisticas/v3.0/principalesvariables"

        def fallback():
            return MOCK_PRINCIPALES_VARIABLES

        result = self._execute_with_fallback(url, fallback)
        if isinstance(result, dict) and "results" in result:
            return result["results"]
        if isinstance(result, list):
            return result
        return MOCK_PRINCIPALES_VARIABLES

    def get_datos_variable(
        self,
        id_variable: int,
        desde: Optional[str] = None,
        hasta: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Fetch historical time-series observations for a specific BCRA variable."""
        if desde and hasta:
            url = f"{self.base_url}/estadisticas/v3.0/DatosVariable/{id_variable}/{desde}/{hasta}"
        else:
            url = f"{self.base_url}/estadisticas/v3.0/DatosVariable/{id_variable}"

        def fallback():
            return get_mock_variable_series(id_variable, desde=desde, hasta=hasta)

        result = self._execute_with_fallback(url, fallback)
        if isinstance(result, dict) and "results" in result:
            return result["results"]
        if isinstance(result, list):
            return result
        return fallback()

    def get_deudas(self, cuit: str) -> Dict[str, Any]:
        """Fetch Central de Deudores credit report for a given CUIT."""
        clean_cuit = str(cuit).replace("-", "").strip()
        url = f"{self.base_url}/centraldedeudores/v1.0/Deudas/{clean_cuit}"

        def fallback():
            return get_mock_deudas(clean_cuit)

        return self._execute_with_fallback(url, fallback)

    def get_cheques_rechazados(self, cuit: str) -> Dict[str, Any]:
        """Fetch rejected checks records from Central de Deudores for a given CUIT."""
        clean_cuit = str(cuit).replace("-", "").strip()
        url = f"{self.base_url}/centraldedeudores/v1.0/ChequesRechazados/{clean_cuit}"

        def fallback():
            return get_mock_cheques_rechazados(clean_cuit)

        return self._execute_with_fallback(url, fallback)

    def close(self) -> None:
        """Close underlying HTTP client connection pool."""
        self.client.close()
