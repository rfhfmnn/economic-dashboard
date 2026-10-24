"""HTTP client for ArgentinaDatos REM (Relevamiento de Expectativas de Mercado) API with SQLite caching and mock fallback."""

import logging
import os
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
import httpx
from sqlalchemy.orm import Session

from backend.app.clients.mock_data import get_mock_rem_report, get_mock_rem_reports
from backend.app.database import RemReport

logger = logging.getLogger(__name__)


class REMClient:
    """Resilient client for fetching market expectations from ArgentinaDatos API."""

    def __init__(
        self,
        base_url: str = "https://api.argentinadatos.com/v1/finanzas/rem",
        timeout: float = 10.0,
        force_mock: Optional[bool] = None,
        cache_ttl_seconds: int = 86400,  # 24 hours
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.cache_ttl_seconds = cache_ttl_seconds

        if force_mock is not None:
            self.force_mock = force_mock
        else:
            self.force_mock = os.getenv("FORCE_MOCK", "false").lower() in ("true", "1")

        self.client = httpx.Client(
            timeout=self.timeout,
            headers={
                "User-Agent": "EconomicRiskDashboard/1.0",
                "Accept": "application/json",
            },
        )

    @staticmethod
    def normalize_period(period_str: str) -> str:
        """Convert varied period representations (e.g., '/finanzas/rem/2026/09', '2026/09', 'ultimo') to canonical YYYY-MM or 'ultimo'."""
        clean = period_str.strip().lower()
        if "ultimo" in clean:
            return "ultimo"

        # Match year and month: YYYY/MM or YYYY-MM
        match = re.search(r"(\d{4})[/-](\d{1,2})", clean)
        if match:
            year, month = match.groups()
            return f"{year}-{int(month):02d}"

        return period_str

    def get_available_reports(self) -> List[str]:
        """Fetch index of published REM reports and return canonical list of periods (e.g. ['2026-09', '2026-08', ...])."""
        if self.force_mock:
            raw_list = get_mock_rem_reports()
            return self._parse_available_reports(raw_list)

        try:
            response = self.client.get(self.base_url)
            response.raise_for_status()
            data = response.json()
            if isinstance(data, list) and len(data) > 0:
                return self._parse_available_reports(data)
            return self._parse_available_reports(get_mock_rem_reports())
        except Exception as exc:
            logger.warning(
                "Failed to fetch available REM reports from %s (%s: %s). Falling back to mock catalog.",
                self.base_url,
                type(exc).__name__,
                exc,
            )
            return self._parse_available_reports(get_mock_rem_reports())

    def _parse_available_reports(self, raw_list: List[str]) -> List[str]:
        """Normalize and sort periods in reverse chronological order."""
        periods: set[str] = set()
        for item in raw_list:
            norm = self.normalize_period(item)
            if norm and norm != "ultimo" and re.match(r"^\d{4}-\d{2}$", norm):
                periods.add(norm)

        sorted_periods = sorted(list(periods), reverse=True)
        return sorted_periods

    def get_report(
        self,
        period: str = "ultimo",
        db: Optional[Session] = None,
    ) -> List[Dict[str, Any]]:
        """Fetch granular REM indicators for a given period (canonical YYYY-MM or 'ultimo').

        Checks SQLite cache first if database session is provided.
        Falls back to synthetic mock data on network errors.
        """
        norm_period = self.normalize_period(period)

        # 1. Check local SQLite cache
        if db is not None:
            try:
                cached = (
                    db.query(RemReport)
                    .filter(RemReport.period == norm_period)
                    .first()
                )
                if cached and cached.cached_at:
                    now = datetime.now(timezone.utc)
                    # Handle both naive and aware cached_at
                    cached_time = cached.cached_at
                    if cached_time.tzinfo is None:
                        cached_time = cached_time.replace(tzinfo=timezone.utc)
                    age = (now - cached_time).total_seconds()
                    if age < self.cache_ttl_seconds and isinstance(cached.raw_payload, list) and len(cached.raw_payload) > 0:
                        logger.debug("Serving REM report '%s' from SQLite cache (age: %ds).", norm_period, age)
                        return cached.raw_payload
            except Exception as exc:
                logger.warning("Error reading REM cache from SQLite: %s", exc)

        # 2. Fetch from remote or generate mock
        records: List[Dict[str, Any]] = []
        if self.force_mock:
            records = get_mock_rem_report(norm_period)
        else:
            try:
                if norm_period == "ultimo":
                    target_url = f"{self.base_url}/ultimo"
                else:
                    parts = norm_period.split("-")
                    target_url = f"{self.base_url}/{parts[0]}/{parts[1]}"

                response = self.client.get(target_url)
                response.raise_for_status()
                data = response.json()
                if isinstance(data, list) and len(data) > 0:
                    records = data
                else:
                    records = get_mock_rem_report(norm_period)
            except Exception as exc:
                logger.warning(
                    "REM request for period '%s' failed (%s: %s). Falling back to mock data.",
                    norm_period,
                    type(exc).__name__,
                    exc,
                )
                records = get_mock_rem_report(norm_period)

        # 3. Store in SQLite cache if session is available
        if db is not None and records:
            try:
                existing = (
                    db.query(RemReport)
                    .filter(RemReport.period == norm_period)
                    .first()
                )
                if existing:
                    existing.raw_payload = records
                    existing.cached_at = datetime.now(timezone.utc)
                else:
                    new_cache = RemReport(
                        period=norm_period,
                        raw_payload=records,
                        cached_at=datetime.now(timezone.utc),
                    )
                    db.add(new_cache)
                db.commit()
            except Exception as exc:
                logger.warning("Failed saving REM report to SQLite cache: %s", exc)
                db.rollback()

        return records

    def get_indec_inflation(self) -> List[Dict[str, Any]]:
        """Fetch historical monthly INDEC inflation series from ArgentinaDatos."""
        if self.force_mock:
            return self._get_mock_inflation()

        try:
            url = "https://api.argentinadatos.com/v1/finanzas/indices/inflacion"
            response = self.client.get(url)
            response.raise_for_status()
            data = response.json()
            if isinstance(data, list) and len(data) > 0:
                return data
            return self._get_mock_inflation()
        except Exception as exc:
            logger.warning("Error fetching INDEC inflation series: %s. Using mock fallback.", exc)
            return self._get_mock_inflation()

    def _get_mock_inflation(self) -> List[Dict[str, Any]]:
        return [
            {"fecha": "2025-09-30", "valor": 3.5},
            {"fecha": "2025-10-31", "valor": 2.7},
            {"fecha": "2025-11-30", "valor": 2.5},
            {"fecha": "2025-12-31", "valor": 2.8},
            {"fecha": "2026-01-31", "valor": 2.3},
            {"fecha": "2026-02-28", "valor": 2.2},
            {"fecha": "2026-03-31", "valor": 2.4},
            {"fecha": "2026-04-30", "valor": 2.1},
            {"fecha": "2026-05-31", "valor": 2.0},
            {"fecha": "2026-06-30", "valor": 1.8},
            {"fecha": "2026-07-31", "valor": 2.1},
            {"fecha": "2026-08-31", "valor": 1.7},
            {"fecha": "2026-09-30", "valor": 1.9},
        ]

    def close(self) -> None:
        """Close the HTTP connection pool."""
        self.client.close()
