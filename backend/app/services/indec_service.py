"""Service layer for INDEC macroeconomic data processing and analytics.

Coordinates series fetching via IndecClient, point normalization,
quarter-end date mapping, timeframe filtering, and KPI summary calculations
strictly enforcing zero synthetic fallback data in runtime.
"""

from __future__ import annotations

import logging
import re
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.orm import Session

from backend.app.clients.indec_client import DATASET_REGISTRY, IndecClient

logger = logging.getLogger(__name__)

KEY_INDEC_INDICATORS: list[str] = [
    "ipc_general",
    "ipc_core",
    "emae_general",
    "ipi_manuf",
    "cbt",
    "cba",
    "eph_desempleo",
    "icc_general",
]


def normalize_indec_date(period_str: str) -> str:
    """Normalize raw period strings to ISO YYYY-MM-DD.

    Quarterly periods (e.g. 2026-T1, 2026-Q1, 2026T1) map to quarter-end:
    - Q1/T1 -> YYYY-03-31
    - Q2/T2 -> YYYY-06-30
    - Q3/T3 -> YYYY-09-30
    - Q4/T4 -> YYYY-12-31

    Monthly periods (e.g. 2026-09) map to YYYY-MM-01.
    ISO dates (e.g. 2026-09-15) are preserved.
    """
    s = str(period_str).strip()
    q_ends = {1: "03-31", 2: "06-30", 3: "09-30", 4: "12-31"}

    # Pattern 1: 2026-T1, 2026-Q1, 2026T1, 2026_Q2, etc.
    m_q1 = re.match(r"^(\d{4})[-_ ]?[TtQq]([1-4])$", s)
    if m_q1:
        year, q = m_q1.group(1), int(m_q1.group(2))
        return f"{year}-{q_ends[q]}"

    # Pattern 2: 2026-1T, 2026-1Q, 20261T
    m_q2 = re.match(r"^(\d{4})[-_ ]?([1-4])[TtQq]$", s)
    if m_q2:
        year, q = m_q2.group(1), int(m_q2.group(2))
        return f"{year}-{q_ends[q]}"

    # Pattern 3: T1-2026, Q1 2026
    m_q3 = re.match(r"^[TtQq]([1-4])[-_ ]?(\d{4})$", s)
    if m_q3:
        q, year = int(m_q3.group(1)), m_q3.group(2)
        return f"{year}-{q_ends[q]}"

    # Pattern 4: 1T-2026, 1Q 2026
    m_q4 = re.match(r"^([1-4])[TtQq][-_ ]?(\d{4})$", s)
    if m_q4:
        q, year = int(m_q4.group(1)), m_q4.group(2)
        return f"{year}-{q_ends[q]}"

    # Pattern 5: Full ISO date YYYY-MM-DD (e.g. 2026-09-15 or 2026-09-15T00:00:00)
    m_d = re.match(r"^(\d{4})[-/](\d{2})[-/](\d{2})", s)
    if m_d:
        year, month, day = m_d.group(1), m_d.group(2), m_d.group(3)
        return f"{year}-{month}-{day}"

    # Pattern 6: Monthly YYYY-MM
    m_m = re.match(r"^(\d{4})[-/](\d{2})$", s)
    if m_m:
        year, month = m_m.group(1), m_m.group(2)
        return f"{year}-{month}-01"

    # Pattern 6b: 6-digit monthly YYYYMM (e.g. 202610)
    m_ym = re.match(r"^(\d{4})(\d{2})$", s)
    if m_ym:
        year, month = m_ym.group(1), m_ym.group(2)
        return f"{year}-{month}-01"

    # Pattern 7: MM-YYYY
    m_my = re.match(r"^(\d{2})[-/](\d{4})$", s)
    if m_my:
        month, year = m_my.group(1), m_my.group(2)
        return f"{year}-{month}-01"

    return s


def extract_indec_value(record: dict[str, Any]) -> float | None:
    """Extract and cast numeric observation value from raw record dictionary."""
    candidate_keys = (
        "valor",
        "tasa_de_desocupacion",
        "tasa_de_empleo",
        "tasa_de_actividad",
        "tot_1a3",
        "indice",
        "tasa",
        "saldo",
        "monto",
        "value",
    )
    for key in candidate_keys:
        if key in record and record[key] is not None:
            raw = record[key]
            if isinstance(raw, str):
                raw = raw.replace(",", ".").strip()
            try:
                return float(raw)
            except (ValueError, TypeError):
                continue

    # Fallback search in non-metadata fields
    excluded = {
        "periodo",
        "fecha",
        "date",
        "anio",
        "mes",
        "id",
        "region",
        "clasificador",
        "sector",
        "rubro",
        "tipo",
        "indicador",
        "flujo",
        "apertura",
        "nivel",
    }
    for k, v in record.items():
        if k.lower() in excluded or v is None:
            continue
        raw = v
        if isinstance(raw, str):
            raw = raw.replace(",", ".").strip()
        try:
            return float(raw)
        except (ValueError, TypeError):
            continue

    return None


def extract_indec_date(record: dict[str, Any]) -> str | None:
    """Extract raw date/period field from record and normalize to YYYY-MM-DD."""
    for key in ("periodo", "Periodo", "fecha", "date", "Fecha"):
        if key in record and record[key] is not None:
            return normalize_indec_date(str(record[key]))
    return None


def filter_by_timeframe(
    points: list[dict[str, Any]], timeframe: str = "1Y"
) -> list[dict[str, Any]]:
    """Filter sorted time-series points by timeframe relative to latest point."""
    if not points:
        return []

    tf = (timeframe or "1Y").strip().upper()
    if tf in ("MAX", "ALL"):
        return points

    latest_str = points[-1]["fecha"]
    try:
        latest_dt = datetime.strptime(latest_str[:10], "%Y-%m-%d").date()
    except ValueError:
        return points

    years_map = {"1Y": 1, "2Y": 2, "5Y": 5}
    if tf in years_map:
        years = years_map[tf]
        cutoff_year = latest_dt.year - years
        # Safe leap year adjustment
        day = (
            28
            if latest_dt.month == 2 and latest_dt.day == 29
            else latest_dt.day
        )
        cutoff = latest_dt.replace(year=cutoff_year, day=day)
    else:
        # Fallback to returning all points if unrecognized
        return points

    cutoff_str = cutoff.isoformat()
    return [p for p in points if p["fecha"] >= cutoff_str]


class IndecService:
    """Service providing normalized macroeconomic time-series, catalogs, and KPI summaries."""

    def __init__(self, client: IndecClient | None = None) -> None:
        self.client = client or IndecClient()

    def get_catalog(self, q: str | None = None) -> list[dict[str, Any]]:
        """Return catalog of available INDEC variables, optionally filtered by q."""
        catalog_items: list[dict[str, Any]] = []
        for var_id, entry in DATASET_REGISTRY.items():
            catalog_items.append({
                "variable_id": var_id,
                "name": entry.get("name", ""),
                "category": entry.get("category", ""),
                "unit": entry.get("unit", ""),
                "frequency": entry.get("frequency", ""),
                "description": entry.get("description", ""),
            })

        if not q or not q.strip():
            return catalog_items

        term = q.strip().lower()
        return [
            item
            for item in catalog_items
            if term in item["name"].lower()
            or term in item["category"].lower()
            or term in item["variable_id"].lower()
            or term in item["description"].lower()
        ]

    def get_series(
        self,
        variable_id: str,
        timeframe: str = "1Y",
        db: Session | None = None,
        refresh: bool = False,
    ) -> list[dict[str, Any]]:
        """Fetch, normalize, sort, and timeframe-filter INDEC time-series data.

        Args:
            variable_id: Identifier registered in DATASET_REGISTRY.
            timeframe: Period filter ('1Y', '2Y', '5Y', 'Max').
            db: Optional SQLAlchemy Session for caching.
            refresh: If True, forces network refresh bypassing cache.

        Returns:
            List of points: [{"fecha": "YYYY-MM-DD", "valor": float}, ...] sorted ascending.

        Raises:
            ValueError: If variable_id is not in DATASET_REGISTRY.
            IndecAuthError: If INDEC_API_TOKEN is missing or unauthorized.
            IndecNetworkError: If upstream API fails or is unreachable.
        """
        if variable_id not in DATASET_REGISTRY:
            raise ValueError(
                f"Variable '{variable_id}' no encontrada en catálogo INDEC"
            )

        raw_records = self.client.fetch_series(
            variable_id=variable_id,
            period=None,
            db=db,
            force_refresh=refresh,
        )

        items_to_process: list[dict[str, Any]] = []
        if isinstance(raw_records, list):
            items_to_process = [r for r in raw_records if isinstance(r, dict)]
        elif isinstance(raw_records, dict):
            for k in ("data", "series", "valores", "records"):
                if isinstance(raw_records.get(k), list):
                    items_to_process = [
                        r for r in raw_records[k] if isinstance(r, dict)
                    ]
                    break
            if not items_to_process:
                items_to_process = [raw_records]

        points: list[dict[str, Any]] = []
        for item in items_to_process:
            norm_date = extract_indec_date(item)
            norm_val = extract_indec_value(item)
            if norm_date and norm_val is not None:
                points.append({"fecha": norm_date, "valor": norm_val})

        # Sort chronologically ascending
        points.sort(key=lambda p: p["fecha"])

        # Deduplicate by fecha keeping the last observation
        unique_points: dict[str, float] = {}
        for p in points:
            unique_points[p["fecha"]] = p["valor"]

        sorted_points = [
            {"fecha": f, "valor": v}
            for f, v in sorted(unique_points.items(), key=lambda x: x[0])
        ]

        # Apply timeframe filter
        return filter_by_timeframe(sorted_points, timeframe=timeframe)

    def get_summary(
        self,
        db: Session | None = None,
        refresh: bool = False,
    ) -> dict[str, Any]:
        """Return executive summary of the 8 key INDEC macroeconomic indicators.

        Computes latest value, observation date, unit, category, and MoM/YoY deltas.
        """
        indicators: list[dict[str, Any]] = []

        for var_id in KEY_INDEC_INDICATORS:
            meta = DATASET_REGISTRY[var_id]
            points = self.get_series(
                variable_id=var_id,
                timeframe="Max",
                db=db,
                refresh=refresh,
            )

            if not points:
                indicators.append({
                    "variable_id": var_id,
                    "name": meta.get("name", ""),
                    "category": meta.get("category", ""),
                    "unit": meta.get("unit", ""),
                    "value": None,
                    "date": None,
                    "delta_mom": None,
                    "delta_yoy": None,
                    "recent_points": [],
                })
                continue

            latest = points[-1]
            latest_val = latest["valor"]
            latest_date_str = latest["fecha"]

            # Compute delta_mom (vs previous observation)
            delta_mom: float | None = None
            if len(points) >= 2:
                prev_val = points[-2]["valor"]
                if prev_val != 0:
                    delta_mom = round(
                        ((latest_val - prev_val) / abs(prev_val)) * 100, 2
                    )

            # Compute delta_yoy (vs observation ~1 year ago)
            delta_yoy: float | None = None
            try:
                latest_dt = datetime.strptime(
                    latest_date_str[:10], "%Y-%m-%d"
                ).date()
                cutoff_year = latest_dt.year - 1
                day = (
                    28
                    if latest_dt.month == 2 and latest_dt.day == 29
                    else latest_dt.day
                )
                target_yoy = latest_dt.replace(year=cutoff_year, day=day)
                target_str = target_yoy.isoformat()

                # Find points on or before 1 year ago
                yoy_matches = [p for p in points if p["fecha"] <= target_str]
                if yoy_matches:
                    yoy_point = yoy_matches[-1]
                    match_dt = datetime.strptime(
                        yoy_point["fecha"][:10], "%Y-%m-%d"
                    ).date()
                    if (target_yoy - match_dt).days <= 60 and yoy_point["valor"] != 0:
                        delta_yoy = round(
                            (
                                (latest_val - yoy_point["valor"])
                                / abs(yoy_point["valor"])
                            )
                            * 100,
                            2,
                        )
            except Exception as exc:
                logger.debug("Could not compute YoY delta for %s: %s", var_id, exc)

            indicators.append({
                "variable_id": var_id,
                "name": meta.get("name", ""),
                "category": meta.get("category", ""),
                "unit": meta.get("unit", ""),
                "value": latest_val,
                "date": latest_date_str,
                "delta_mom": delta_mom,
                "delta_yoy": delta_yoy,
                "recent_points": [
                    p["valor"] for p in points[-15:] if p.get("valor") is not None
                ],
            })

        now_iso = datetime.now(UTC).isoformat()
        return {
            "indicators": indicators,
            "last_updated": now_iso,
            "timestamp": now_iso,
        }
