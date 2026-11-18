"""HTTP client for INDEC (Instituto Nacional de Estadística y Censos) official API.

Connects to api.indec.gob.ar using Bearer token authentication via INDEC_API_TOKEN,
backed by SQLite caching (IndecCache) and a declarative dataset registry mapping
the 8 key macroeconomic series, strictly enforcing zero synthetic fallback data in runtime.
"""

from __future__ import annotations

import logging
import os
from datetime import UTC, datetime
from typing import Any, Self

import httpx
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from backend.app.database import IndecCache

logger = logging.getLogger(__name__)


class IndecClientError(Exception):
    """Base exception for all INDEC client errors."""


class IndecAuthError(IndecClientError):
    """Raised when INDEC API token is missing, expired, or rejected (HTTP 401/403)."""


# Alias for acceptance criteria compatibility
IndecAuthenticationError = IndecAuthError


class IndecNetworkError(IndecClientError):
    """Raised when INDEC API is unreachable, times out, or returns a 5xx server error."""


class IndecResponseError(IndecClientError):
    """Raised when INDEC API returns an unexpected response structure or 4xx error."""


DATASET_REGISTRY: dict[str, dict[str, Any]] = {
    "ipc_general": {
        "endpoint": "/ipc",
        "name": "IPC - Nivel General Nacional",
        "category": "Precios y Costos",
        "unit": "% mensual",
        "frequency": "mensual",
        "description": "Índice de Precios al Consumidor - Nivel General Nacional",
        "params": {
            "clasificador": "eq.general",
            "region": "eq.nacional",
            "order": "periodo.desc",
        },
    },
    "ipc_core": {
        "endpoint": "/ipc",
        "name": "IPC - Núcleo",
        "category": "Precios y Costos",
        "unit": "% mensual",
        "frequency": "mensual",
        "description": "IPC Categoría Núcleo (desestacionalizado sin regulados ni estacionales)",
        "params": {
            "clasificador": "eq.nucleo",
            "region": "eq.nacional",
            "order": "periodo.desc",
        },
    },
    "emae_general": {
        "endpoint": "/emae",
        "name": "EMAE - Nivel General",
        "category": "Actividad y Producción",
        "unit": "Índice base 2004=100",
        "frequency": "mensual",
        "description": "Estimador Mensual de Actividad Económica - Nivel General",
        "params": {
            "sector": "eq.general",
            "order": "periodo.desc",
        },
    },
    "ipi_manuf": {
        "endpoint": "/ipi_manufacturero",
        "name": "IPI Manufacturero",
        "category": "Actividad y Producción",
        "unit": "Índice base 2004=100",
        "frequency": "mensual",
        "description": "Índice de Producción Industrial Manufacturero",
        "params": {
            "rubro": "eq.general",
            "order": "periodo.desc",
        },
    },
    "cbt": {
        "endpoint": "/canastas_basicas",
        "name": "Canasta Básica Total (CBT)",
        "category": "Mercado de Trabajo y Social",
        "unit": "ARS",
        "frequency": "mensual",
        "description": "Canasta Básica Total - Línea de pobreza individual adulto equivalente",
        "params": {
            "tipo": "eq.cbt",
            "region": "eq.gba",
            "order": "periodo.desc",
        },
    },
    "eph_desempleo": {
        "endpoint": "/eph_tasas",
        "name": "Tasa de Desocupación",
        "category": "Mercado de Trabajo y Social",
        "unit": "% PEA",
        "frequency": "trimestral",
        "description": "Encuesta Permanente de Hogares - Tasa de Desocupación abierta",
        "params": {
            "indicador": "eq.desocupacion",
            "order": "periodo.desc",
        },
    },
    "ica_saldo": {
        "endpoint": "/ica",
        "name": "Balanza Comercial (ICA)",
        "category": "Sector Externo",
        "unit": "Millones USD",
        "frequency": "mensual",
        "description": "Intercambio Comercial Argentino - Saldo de Balanza Comercial",
        "params": {
            "flujo": "eq.saldo",
            "order": "periodo.desc",
        },
    },
    "icc_general": {
        "endpoint": "/icc",
        "name": "Costo de la Construcción (ICC)",
        "category": "Precios y Costos",
        "unit": "% mensual",
        "frequency": "mensual",
        "description": "Índice del Costo de la Construcción en el Gran Buenos Aires - Nivel General",
        "params": {
            "apertura": "eq.general",
            "order": "periodo.desc",
        },
    },
    # Subseries y series complementarias
    "cba": {
        "endpoint": "/canastas_basicas",
        "name": "Canasta Básica Alimentaria (CBA)",
        "category": "Mercado de Trabajo y Social",
        "unit": "ARS",
        "frequency": "mensual",
        "description": "Canasta Básica Alimentaria - Línea de indigencia individual adulto equivalente",
        "params": {
            "tipo": "eq.cba",
            "region": "eq.gba",
            "order": "periodo.desc",
        },
    },
    "ipim_general": {
        "endpoint": "/ipim",
        "name": "Sistema de Precios Mayoristas (IPIM)",
        "category": "Precios y Costos",
        "unit": "% mensual",
        "frequency": "mensual",
        "description": "Índice de Precios Internos al por Mayor - Nivel General",
        "params": {
            "nivel": "eq.general",
            "order": "periodo.desc",
        },
    },
    "ica_expo": {
        "endpoint": "/ica",
        "name": "Exportaciones Totales (ICA)",
        "category": "Sector Externo",
        "unit": "Millones USD",
        "frequency": "mensual",
        "description": "Intercambio Comercial Argentino - Exportaciones Totales FOB",
        "params": {
            "flujo": "eq.exportaciones",
            "order": "periodo.desc",
        },
    },
    "ica_impo": {
        "endpoint": "/ica",
        "name": "Importaciones Totales (ICA)",
        "category": "Sector Externo",
        "unit": "Millones USD",
        "frequency": "mensual",
        "description": "Intercambio Comercial Argentino - Importaciones Totales CIF",
        "params": {
            "flujo": "eq.importaciones",
            "order": "periodo.desc",
        },
    },
    "eph_empleo": {
        "endpoint": "/eph_tasas",
        "name": "Tasa de Empleo",
        "category": "Mercado de Trabajo y Social",
        "unit": "% PEA",
        "frequency": "trimestral",
        "description": "Encuesta Permanente de Hogares - Tasa de Empleo",
        "params": {
            "indicador": "eq.empleo",
            "order": "periodo.desc",
        },
    },
    "eph_actividad": {
        "endpoint": "/eph_tasas",
        "name": "Tasa de Actividad",
        "category": "Mercado de Trabajo y Social",
        "unit": "% PEA",
        "frequency": "trimestral",
        "description": "Encuesta Permanente de Hogares - Tasa de Actividad",
        "params": {
            "indicador": "eq.actividad",
            "order": "periodo.desc",
        },
    },
}


class IndecClient:
    """Official HTTP client for api.indec.gob.ar with Bearer JWT auth and SQLite caching."""

    DATASET_REGISTRY = DATASET_REGISTRY

    def __init__(
        self,
        base_url: str = "https://api.indec.gob.ar",
        token: str | None = None,
        timeout: float = 10.0,
        cache_ttl_seconds: int = 86400,  # 24 hours
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.token = token if token is not None else os.getenv("INDEC_API_TOKEN")
        if self.token:
            self.token = self.token.strip()
        self.timeout = timeout
        self.cache_ttl_seconds = cache_ttl_seconds
        self._transport = transport

        headers = {
            "User-Agent": "EconomicRiskDashboard/1.0",
            "Accept": "application/json",
        }
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"

        self.client = httpx.Client(
            timeout=self.timeout,
            headers=headers,
            transport=self._transport,
        )

    def _ensure_authenticated(self) -> None:
        """Validate that an INDEC_API_TOKEN is configured before sending network requests."""
        if not self.token or not self.token.strip():
            raise IndecAuthError(
                "INDEC_API_TOKEN no configurado en las variables de entorno. "
                "Debe proporcionar un token Bearer para autenticarse contra api.indec.gob.ar. "
                "Configure INDEC_API_TOKEN en su archivo .env o en el entorno del sistema."
            )

    def fetch_series(
        self,
        variable_id: str,
        period: str | None = None,
        db: Session | None = None,
        force_refresh: bool = False,
        custom_params: dict[str, Any] | None = None,
    ) -> Any:
        """Fetch macroeconomic series data from local cache or official INDEC API.

        Args:
            variable_id: Key identifying the dataset in DATASET_REGISTRY (e.g. 'ipc_general').
            period: Optional period filter (e.g. '2026-09') or None for full series.
            db: Optional SQLAlchemy Session for SQLite caching.
            force_refresh: If True, bypasses cache and forces network fetch.
            custom_params: Optional additional PostgREST query parameters.

        Returns:
            The raw JSON payload (list or dict) from cache or INDEC API.

        Raises:
            ValueError: If variable_id is not in DATASET_REGISTRY.
            IndecAuthError: If INDEC_API_TOKEN is missing or invalid (HTTP 401/403).
            IndecNetworkError: If INDEC API is unreachable, times out, or returns HTTP 5xx.
            IndecResponseError: If INDEC API returns HTTP 4xx or malformed JSON.
        """
        if variable_id not in self.DATASET_REGISTRY:
            raise ValueError(
                f"Variable '{variable_id}' no está registrada en DATASET_REGISTRY. "
                f"Variables válidas: {list(self.DATASET_REGISTRY.keys())}"
            )

        cache_period = period if period else "all"

        # 1. Check local SQLite cache first (if db provided and not force_refresh)
        if db is not None and not force_refresh:
            cached = (
                db.query(IndecCache)
                .filter(
                    IndecCache.variable_id == variable_id,
                    IndecCache.period == cache_period,
                )
                .first()
            )
            if cached is not None:
                is_fresh = True
                if self.cache_ttl_seconds > 0 and cached.cached_at:
                    now = datetime.now(UTC)
                    cached_time = cached.cached_at
                    if cached_time.tzinfo is None:
                        cached_time = cached_time.replace(tzinfo=UTC)
                    if (now - cached_time).total_seconds() > self.cache_ttl_seconds:
                        is_fresh = False
                if is_fresh:
                    logger.debug(
                        "Cache hit for INDEC series %s (period=%s)",
                        variable_id,
                        cache_period,
                    )
                    return cached.raw_payload

        # 2. Before network call, ensure token is present (strictly no synthetic mock fallback)
        self._ensure_authenticated()

        registry_entry = self.DATASET_REGISTRY[variable_id]
        endpoint = registry_entry["endpoint"]
        url = f"{self.base_url}/{endpoint.lstrip('/')}"

        params = dict(registry_entry.get("params", {}))
        if period and period != "all":
            params["periodo"] = f"eq.{period}"
        if custom_params:
            params.update(custom_params)

        headers = {
            "Authorization": f"Bearer {self.token}",
            "Accept": "application/json",
            "User-Agent": "EconomicRiskDashboard/1.0",
        }

        # 3. Execute HTTP request
        try:
            response = self.client.get(url, params=params, headers=headers)
        except httpx.TimeoutException as exc:
            raise IndecNetworkError(
                f"Tiempo de espera agotado al conectar con INDEC ({url}): {exc}"
            ) from exc
        except (httpx.ConnectError, httpx.NetworkError, httpx.RequestError) as exc:
            raise IndecNetworkError(
                f"Error de conexión con la API del INDEC ({url}): {exc}"
            ) from exc

        # 4. Handle HTTP status codes
        if response.status_code in (401, 403):
            raise IndecAuthError(
                f"Error de autenticación INDEC (HTTP {response.status_code}): "
                "Token inválido o expirado. Verifique INDEC_API_TOKEN."
            )
        if response.status_code >= 500:
            raise IndecNetworkError(
                f"Error en servidor INDEC (HTTP {response.status_code}): {response.text}"
            )
        if response.status_code >= 400:
            raise IndecResponseError(
                f"Error en consulta a INDEC (HTTP {response.status_code}): {response.text}"
            )

        # 5. Parse JSON payload
        try:
            payload = response.json()
        except Exception as exc:
            raise IndecResponseError(
                f"Respuesta inválida de INDEC (no es JSON válido): {exc}"
            ) from exc

        # 6. Persist to SQLite cache (if db provided)
        if db is not None:
            try:
                cached_entry = (
                    db.query(IndecCache)
                    .filter(
                        IndecCache.variable_id == variable_id,
                        IndecCache.period == cache_period,
                    )
                    .first()
                )
                if cached_entry is not None:
                    cached_entry.raw_payload = payload
                    cached_entry.cached_at = datetime.now(UTC)
                else:
                    new_cache = IndecCache(
                        variable_id=variable_id,
                        period=cache_period,
                        raw_payload=payload,
                        cached_at=datetime.now(UTC),
                    )
                    db.add(new_cache)
                db.commit()
            except SQLAlchemyError as exc:
                db.rollback()
                logger.warning(
                    "Error al persistir en IndecCache (%s): %s", variable_id, exc
                )

        return payload

    # Alias for method name flexibility
    get_series = fetch_series

    def get_catalog(self) -> dict[str, dict[str, Any]]:
        """Return metadata for all registered INDEC series."""
        return dict(self.DATASET_REGISTRY)

    def close(self) -> None:
        """Close the underlying HTTP client session."""
        if hasattr(self, "client") and not self.client.is_closed:
            self.client.close()

    def __enter__(self) -> Self:
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        self.close()
