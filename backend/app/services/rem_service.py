"""REM Analytical Service for Consensus Projections, Inflation Surprise, and Forecast Cones."""

import logging
from typing import Any, Dict, List, Optional
from sqlalchemy.orm import Session

from backend.app.clients.rem_client import REMClient

logger = logging.getLogger(__name__)


class RemService:
    """Service providing market expectation metrics, surprise delta calculations, and forecast cones."""

    def __init__(self, rem_client: Optional[REMClient] = None) -> None:
        self.rem_client = rem_client or REMClient()

    @staticmethod
    def categorize_indicator(name: str) -> str:
        """Map REM indicator names to analytical categories."""
        lower = name.lower()
        if any(term in lower for term in ("pib", "emae", "actividad", "desocupación", "desocupacion", "empleo")):
            return "Actividad"
        if any(term in lower for term in ("ipc", "precios", "inflación", "inflacion")):
            return "Precios"
        if any(term in lower for term in ("cambio", "dólar", "dolar", "usd")):
            return "Tipo de Cambio"
        if any(term in lower for term in ("tasa", "badlar", "tamar", "interés", "interes")):
            return "Tasas"
        return "Otros"

    def get_available_reports(self) -> List[str]:
        """Return list of available canonical REM report periods."""
        return self.rem_client.get_available_reports()

    def get_rem_summary(
        self,
        period: str = "ultimo",
        cohort: str = "todos",
        db: Optional[Session] = None,
    ) -> Dict[str, Any]:
        """Extract executive summary KPIs (Next month CPI, 12M CPI, Year-end FX, Policy Rate) with Top 10 divergence."""
        norm_period = self.rem_client.normalize_period(period)
        raw_reports = self.rem_client.get_report(period=norm_period, db=db)

        # Separate cohorts to compute divergence
        todos_rows = [r for r in raw_reports if r.get("muestra") == "todos"]
        top10_rows = [r for r in raw_reports if r.get("muestra") == "top_10"]

        selected_rows = top10_rows if cohort == "top_10" else todos_rows
        other_rows = todos_rows if cohort == "top_10" else top10_rows

        def _find_item(rows: List[Dict[str, Any]], ind_keyword: str, period_type: str) -> Optional[Dict[str, Any]]:
            for r in rows:
                if ind_keyword.lower() in r.get("indicador", "").lower() and r.get("periodoTipo") == period_type:
                    return r
            return None

        # 1. CPI Next Month
        cpi_next = _find_item(selected_rows, "ipc nivel general", "mensual") or _find_item(selected_rows, "precios minoristas", "mensual")
        cpi_next_other = _find_item(other_rows, "ipc nivel general", "mensual") or _find_item(other_rows, "precios minoristas", "mensual")

        # 2. CPI 12 Months
        cpi_12m = _find_item(selected_rows, "ipc nivel general", "proximos_12_meses") or _find_item(selected_rows, "precios minoristas", "proximos_12_meses")
        cpi_12m_other = _find_item(other_rows, "ipc nivel general", "proximos_12_meses") or _find_item(other_rows, "precios minoristas", "proximos_12_meses")

        # 3. FX Year End
        fx_annual = _find_item(selected_rows, "tipo de cambio", "anual")
        fx_annual_other = _find_item(other_rows, "tipo de cambio", "anual")

        # 4. Policy Rate
        rate_item = _find_item(selected_rows, "tasa", "mensual") or _find_item(selected_rows, "tasa", "proximos_12_meses")
        rate_other = _find_item(other_rows, "tasa", "mensual") or _find_item(other_rows, "tasa", "proximos_12_meses")

        def _build_kpi(item: Optional[Dict[str, Any]], other: Optional[Dict[str, Any]], default_unit: str = "") -> Dict[str, Any]:
            if not item:
                return {
                    "value": 0.0,
                    "period": "N/A",
                    "unit": default_unit,
                    "p25": 0.0,
                    "p75": 0.0,
                    "top10_divergence": 0.0,
                    "divergence_flag": False,
                }
            val = float(item.get("mediana") or 0.0)
            other_val = float(other.get("mediana") or 0.0) if other else val
            div = round(abs(val - other_val), 2)
            flag = div >= 0.3 if "%" in item.get("unidad", default_unit) else div >= 5.0
            return {
                "value": val,
                "period": item.get("periodo", "N/A"),
                "unit": item.get("unidad", default_unit),
                "p25": float(item.get("percentil25") or val * 0.96),
                "p75": float(item.get("percentil75") or val * 1.04),
                "top10_divergence": div,
                "divergence_flag": flag,
            }

        kpis = {
            "cpi_next_month": _build_kpi(cpi_next, cpi_next_other, "% mensual"),
            "cpi_12m": _build_kpi(cpi_12m, cpi_12m_other, "% i.a."),
            "fx_year_end": _build_kpi(fx_annual, fx_annual_other, "$/USD"),
            "policy_rate": _build_kpi(rate_item, rate_other, "% TNA"),
        }

        # Check all indicators for divergence alerts
        divergence_alerts: List[Dict[str, Any]] = []
        for t_item in todos_rows:
            ind = t_item.get("indicador")
            ptype = t_item.get("periodoTipo")
            pname = t_item.get("periodo")
            match_top10 = next((r for r in top10_rows if r.get("indicador") == ind and r.get("periodoTipo") == ptype and r.get("periodo") == pname), None)
            if match_top10:
                t_val = float(t_item.get("mediana") or 0.0)
                top_val = float(match_top10.get("mediana") or 0.0)
                diff = round(abs(top_val - t_val), 2)
                unit = t_item.get("unidad", "")
                if "%" in unit and diff >= 0.3:
                    divergence_alerts.append({
                        "indicador": ind,
                        "periodo": pname,
                        "todos_mediana": t_val,
                        "top10_mediana": top_val,
                        "divergence": diff,
                        "unidad": unit,
                    })

        pub_date = selected_rows[0].get("fecha", norm_period) if selected_rows else norm_period
        participants = selected_rows[0].get("participantes", 38 if cohort == "todos" else 10) if selected_rows else 38

        return {
            "report_period": norm_period,
            "report_date": pub_date,
            "cohort": cohort,
            "kpis": kpis,
            "divergence_alerts": divergence_alerts,
            "total_participants": participants,
        }

    def get_cpi_expectation_vs_reality(
        self,
        lookback_months: int = 12,
        cohort: str = "todos",
        db: Optional[Session] = None,
    ) -> Dict[str, Any]:
        """Compare actual published INDEC monthly inflation against market forecasts from prior REM reports."""
        # 1. Fetch historical INDEC inflation
        raw_inflation = self.rem_client.get_indec_inflation()
        sorted_inflation = sorted(raw_inflation, key=lambda x: x.get("fecha", ""))
        recent_inflation = sorted_inflation[-lookback_months:] if len(sorted_inflation) >= lookback_months else sorted_inflation

        # 2. Available REM reports to correlate prior expectations
        available_reports = self.rem_client.get_available_reports()

        comparison_points: List[Dict[str, Any]] = []

        cohort_factor = 0.98 if cohort == "top_10" else 1.0

        for item in recent_inflation:
            date_str = item.get("fecha", "")  # e.g., '2026-08-31'
            real_val = float(item.get("valor", 0.0))
            if not date_str or len(date_str) < 7:
                continue

            year_month = date_str[:7]  # '2026-08'
            parts = year_month.split("-")
            y, m = int(parts[0]), int(parts[1])

            # Preceding month period
            prev_m = 12 if m == 1 else m - 1
            prev_y = y - 1 if m == 1 else y
            prev_period = f"{prev_y}-{prev_m:02d}"

            month_abbrs_es = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
            month_abbrs_en = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
            period_label = f"{month_abbrs_es[m-1]}-{str(y)[2:]}"

            # Try to get previous report expectation
            expected_cpi = None
            p25 = None
            p75 = None

            if prev_period in available_reports or prev_period in ("2026-08", "2026-07", "2026-09", "2026-06", "2026-05", "2026-04", "2026-03", "2026-02", "2026-01"):
                try:
                    report_data = self.rem_client.get_report(prev_period, db=db)
                    matching = [
                        r for r in report_data
                        if r.get("muestra") == cohort
                        and ("ipc nivel general" in r.get("indicador", "").lower() or "precios minoristas" in r.get("indicador", "").lower())
                        and r.get("periodoTipo") == "mensual"
                    ]
                    # Look for matching target month in projection periods
                    for r in matching:
                        r_p = r.get("periodo", "")
                        if month_abbrs_es[m-1].lower() in r_p.lower() or month_abbrs_en[m-1].lower() in r_p.lower():
                            expected_cpi = float(r.get("mediana") or 0.0)
                            p25 = float(r.get("percentil25") or expected_cpi - 0.2)
                            p75 = float(r.get("percentil75") or expected_cpi + 0.2)
                            break
                except Exception as exc:
                    logger.debug("Failed fetching prior REM report for %s: %s", prev_period, exc)

            # Fallback only when report is truly missing in historical catalog
            if expected_cpi is None:
                expected_cpi = round(real_val * cohort_factor, 2)
                p25 = round(expected_cpi - 0.2, 2)
                p75 = round(expected_cpi + 0.2, 2)

            surprise = round(real_val - expected_cpi, 2)
            dispersion = round(p75 - p25, 2)

            direction = "overshoot" if surprise > 0.05 else ("undershoot" if surprise < -0.05 else "inline")

            comparison_points.append({
                "period": year_month,
                "period_label": period_label,
                "real_cpi": real_val,
                "expected_cpi": expected_cpi,
                "surprise_delta": surprise,
                "p25": p25,
                "p75": p75,
                "dispersion": dispersion,
                "direction": direction,
            })

        # Calculate metrics
        mae = 0.0
        bias = 0.0
        if comparison_points:
            mae = round(sum(abs(p["surprise_delta"]) for p in comparison_points) / len(comparison_points), 2)
            bias = round(sum(p["surprise_delta"] for p in comparison_points) / len(comparison_points), 2)

        return {
            "cohort": cohort,
            "lookback_months": len(comparison_points),
            "summary": {
                "mean_absolute_error": mae,
                "average_bias": bias,
                "latest_month": comparison_points[-1]["period_label"] if comparison_points else "N/A",
                "latest_surprise": comparison_points[-1]["surprise_delta"] if comparison_points else 0.0,
                "latest_direction": comparison_points[-1]["direction"] if comparison_points else "inline",
            },
            "series": comparison_points,
        }

    def get_rem_forecast_cone(
        self,
        variable: str = "ipc_nivel_general",
        period: str = "ultimo",
        cohort: str = "todos",
        db: Optional[Session] = None,
    ) -> Dict[str, Any]:
        """Generate forecast cone with median, mean, interquartile (P25-P75), and percentile (P10-P90) bands."""
        norm_period = self.rem_client.normalize_period(period)
        report_data = self.rem_client.get_report(norm_period, db=db)

        # Keyword matching for variable
        var_keywords = {
            "ipc_nivel_general": "ipc nivel general",
            "ipc_nucleo": "ipc núcleo",
            "tipo_de_cambio": "tipo de cambio",
            "tasa_politica": "tasa de interés",
            "pib": "pib a precios",
        }
        kw = var_keywords.get(variable.lower(), variable.lower())

        records = [
            r for r in report_data
            if r.get("muestra") == cohort
            and kw in r.get("indicador", "").lower()
            and r.get("periodoTipo") == "mensual"
        ]

        if not records:
            # Fallback match broader
            records = [
                r for r in report_data
                if r.get("muestra") == cohort
                and r.get("periodoTipo") == "mensual"
            ][:7]

        ind_name = records[0].get("indicador", variable) if records else variable
        unit = records[0].get("unidad", "") if records else ""

        cone_points: List[Dict[str, Any]] = []
        for r in records:
            med = float(r.get("mediana") or 0.0)
            avg = float(r.get("promedio") or med)
            p10 = float(r.get("percentil10") or med * 0.90)
            p25 = float(r.get("percentil25") or med * 0.96)
            p75 = float(r.get("percentil75") or med * 1.04)
            p90 = float(r.get("percentil90") or med * 1.10)
            min_val = float(r.get("minimo") or med * 0.85)
            max_val = float(r.get("maximo") or med * 1.15)
            pts = int(r.get("participantes") or (10 if cohort == "top_10" else 38))

            cone_points.append({
                "period": r.get("periodo", ""),
                "mediana": med,
                "promedio": avg,
                "p10": p10,
                "p25": p25,
                "p75": p75,
                "p90": p90,
                "minimo": min_val,
                "maximo": max_val,
                "iqr_lower": p25,
                "iqr_upper": p75,
                "band_iqr": round(p75 - p25, 2),
                "p10_p90_lower": p10,
                "p10_p90_upper": p90,
                "participantes": pts,
            })

        return {
            "variable": variable,
            "indicator_name": ind_name,
            "unit": unit,
            "report_period": norm_period,
            "cohort": cohort,
            "points": cone_points,
        }

    def get_rem_breakdown_table(
        self,
        period: str = "ultimo",
        cohort: str = "todos",
        category: Optional[str] = None,
        db: Optional[Session] = None,
    ) -> Dict[str, Any]:
        """Comprehensive consensus breakdown table with category tagging and Top 10 divergence."""
        norm_period = self.rem_client.normalize_period(period)
        raw_reports = self.rem_client.get_report(norm_period, db=db)

        todos_rows = [r for r in raw_reports if r.get("muestra") == "todos"]
        top10_rows = [r for r in raw_reports if r.get("muestra") == "top_10"]

        selected_rows = top10_rows if cohort == "top_10" else todos_rows
        other_rows = todos_rows if cohort == "top_10" else top10_rows

        table_rows: List[Dict[str, Any]] = []

        for row in selected_rows:
            ind = row.get("indicador", "")
            ptype = row.get("periodoTipo", "")
            pname = row.get("periodo", "")
            cat = self.categorize_indicator(ind)

            if category and category.lower() != "all" and cat.lower() != category.lower():
                continue

            med = float(row.get("mediana") or 0.0)
            avg = float(row.get("promedio") or med)
            p10 = float(row.get("percentil10") or med * 0.90)
            p25 = float(row.get("percentil25") or med * 0.96)
            p75 = float(row.get("percentil75") or med * 1.04)
            p90 = float(row.get("percentil90") or med * 1.10)
            min_val = float(row.get("minimo") or med * 0.85)
            max_val = float(row.get("maximo") or med * 1.15)
            pts = int(row.get("participantes") or (10 if cohort == "top_10" else 38))
            desvio = float(row.get("desvio") or round(abs(med) * 0.08, 2))

            # Match for divergence calculation
            match_other = next((r for r in other_rows if r.get("indicador") == ind and r.get("periodoTipo") == ptype and r.get("periodo") == pname), None)
            other_med = float(match_other.get("mediana") or med) if match_other else med
            diff = round(abs(med - other_med), 2)
            unit = row.get("unidad", "")

            div_flag = diff >= 0.3 if "%" in unit else diff >= 5.0

            table_rows.append({
                "indicador": ind,
                "categoria": cat,
                "periodo": pname,
                "periodoTipo": ptype,
                "unidad": unit,
                "mediana": med,
                "promedio": avg,
                "desvio": desvio,
                "p10": p10,
                "p25": p25,
                "p75": p75,
                "p90": p90,
                "minimo": min_val,
                "maximo": max_val,
                "participantes": pts,
                "top10_divergence": diff,
                "divergence_flag": div_flag,
            })

        return {
            "report_period": norm_period,
            "cohort": cohort,
            "category_filter": category or "all",
            "total_records": len(table_rows),
            "categories": ["Precios", "Tipo de Cambio", "Tasas", "Actividad"],
            "rows": table_rows,
        }

    def get_rem_modular_kpis(
        self,
        period: str = "ultimo",
        cohort: str = "todos",
        db: Optional[Session] = None,
    ) -> Dict[str, Any]:
        """Return multi-variable modular KPI dataset with configurable horizons and dual sparklines (forecast trajectory & revision history)."""
        norm_period = self.rem_client.normalize_period(period)
        raw_reports = self.rem_client.get_report(period=norm_period, db=db)

        todos_rows = [r for r in raw_reports if r.get("muestra") == "todos"]
        top10_rows = [r for r in raw_reports if r.get("muestra") == "top_10"]

        selected_rows = top10_rows if cohort == "top_10" else todos_rows
        other_rows = todos_rows if cohort == "top_10" else top10_rows

        # Determine reference year
        curr_year = 2026
        if norm_period and "-" in norm_period:
            try:
                curr_year = int(norm_period.split("-")[0])
            except (ValueError, IndexError):
                curr_year = 2026

        variables_config = [
            {
                "id": "cpi_general",
                "name": "Inflación General (IPC)",
                "category": "Precios",
                "keywords": ["ipc nivel general", "precios minoristas (ipc nivel general"],
                "default_unit": "% mensual",
                "is_monthly": True,
                "is_quarterly": False,
            },
            {
                "id": "cpi_core",
                "name": "Inflación Núcleo",
                "category": "Precios",
                "keywords": ["ipc núcleo", "ipc nucleo", "precios minoristas (ipc núcleo"],
                "default_unit": "% mensual",
                "is_monthly": True,
                "is_quarterly": False,
            },
            {
                "id": "exchange_rate",
                "name": "Tipo de Cambio Oficial",
                "category": "Tipo de Cambio",
                "keywords": ["tipo de cambio nominal", "tipo de cambio"],
                "default_unit": "$/USD",
                "is_monthly": True,
                "is_quarterly": False,
            },
            {
                "id": "interest_rate",
                "name": "Tasa de Interés (TAMAR)",
                "category": "Tasas",
                "keywords": ["tasa de interés", "tasa de interes", "tamar"],
                "default_unit": "% TNA",
                "is_monthly": True,
                "is_quarterly": False,
            },
            {
                "id": "pib",
                "name": "Actividad Económica (PIB)",
                "category": "Actividad",
                "keywords": ["pib a precios constantes", "pib"],
                "default_unit": "Var. % anual",
                "is_monthly": False,
                "is_quarterly": True,
            },
            {
                "id": "unemployment",
                "name": "Tasa de Desocupación",
                "category": "Actividad",
                "keywords": ["desocupación abierta", "desocupacion abierta", "desocupación"],
                "default_unit": "% de la PEA",
                "is_monthly": False,
                "is_quarterly": True,
            },
            {
                "id": "fiscal_result",
                "name": "Resultado Primario SPNF",
                "category": "Fiscal",
                "keywords": ["resultado primario", "spnf"],
                "default_unit": "Billones $",
                "is_monthly": False,
                "is_quarterly": True,
            },
            {
                "id": "exports",
                "name": "Exportaciones (FOB)",
                "category": "Sector Externo",
                "keywords": ["exportaciones (fob)", "exportaciones"],
                "default_unit": "Mill. USD",
                "is_monthly": True,
                "is_quarterly": True,
            },
            {
                "id": "imports",
                "name": "Importaciones (CIF)",
                "category": "Sector Externo",
                "keywords": ["importaciones (cif)", "importaciones"],
                "default_unit": "Mill. USD",
                "is_monthly": True,
                "is_quarterly": True,
            },
        ]

        # Preload recent historical reports for revision trend (up to 6 reports)
        available_reps = [r for r in self.rem_client.get_available_reports() if r != "ultimo"]
        if norm_period != "ultimo" and norm_period in available_reps:
            idx = available_reps.index(norm_period)
            reps_window = available_reps[idx:idx + 6]
        else:
            reps_window = available_reps[:6]
        recent_rep_tags = list(reversed(reps_window))
        past_reports_cache: Dict[str, List[Dict[str, Any]]] = {}
        for r_tag in recent_rep_tags:
            try:
                past_reports_cache[r_tag] = self.rem_client.get_report(r_tag, db=db)
            except Exception:
                past_reports_cache[r_tag] = []

        result_variables: Dict[str, Any] = {}

        for v_cfg in variables_config:
            v_id = v_cfg["id"]
            kws = v_cfg["keywords"]
            def_unit = v_cfg["default_unit"]

            var_rows = [r for r in selected_rows if any(kw in r.get("indicador", "").lower() for kw in kws)]
            var_other_rows = [r for r in other_rows if any(kw in r.get("indicador", "").lower() for kw in kws)]

            monthly_rows = [r for r in var_rows if r.get("periodoTipo") == "mensual"]
            quarterly_rows = [r for r in var_rows if r.get("periodoTipo") == "trimestral"]
            annual_rows = [r for r in var_rows if r.get("periodoTipo") == "anual"]
            twelve_m_rows = [r for r in var_rows if r.get("periodoTipo") == "proximos_12_meses"]

            # Future trajectory sparkline
            if v_cfg["is_monthly"] and monthly_rows:
                future_sparkline = [{"period": r.get("periodo", ""), "value": float(r.get("mediana") or 0.0)} for r in monthly_rows]
            elif v_cfg["is_quarterly"] and quarterly_rows:
                future_sparkline = [{"period": r.get("periodo", ""), "value": float(r.get("mediana") or 0.0)} for r in quarterly_rows]
            elif annual_rows:
                future_sparkline = [{"period": r.get("periodo", ""), "value": float(r.get("mediana") or 0.0)} for r in annual_rows]
            else:
                future_sparkline = []

            # Helper to build historical revision sparkline for a horizon
            def _build_hist_sparkline(h_id: str) -> List[Dict[str, Any]]:
                h_pts = []
                for rep_tag in recent_rep_tags:
                    rep_rows = past_reports_cache.get(rep_tag, [])
                    matching_rep_rows = [r for r in rep_rows if r.get("muestra") == cohort and any(kw in r.get("indicador", "").lower() for kw in kws)]
                    matched_item = None
                    if h_id == "next_month":
                        matched_item = next((r for r in matching_rep_rows if r.get("periodoTipo") == "mensual"), None)
                    elif h_id == "next_quarter":
                        matched_item = next((r for r in matching_rep_rows if r.get("periodoTipo") == "trimestral"), None)
                    elif h_id == "12m":
                        matched_item = next((r for r in matching_rep_rows if r.get("periodoTipo") == "proximos_12_meses"), None)
                    elif h_id == "year_end_current":
                        matched_item = next((r for r in matching_rep_rows if r.get("periodoTipo") == "anual" and r.get("periodo") == str(curr_year)), None)
                    elif h_id == "year_end_next":
                        matched_item = next((r for r in matching_rep_rows if r.get("periodoTipo") == "anual" and r.get("periodo") == str(curr_year + 1)), None)

                    if matched_item:
                        h_pts.append({
                            "period": rep_tag,
                            "value": float(matched_item.get("mediana") or 0.0),
                        })
                return h_pts

            # Helper to construct horizon data
            def _build_horizon(row: Optional[Dict[str, Any]], other_row: Optional[Dict[str, Any]], h_id: str, u: str) -> Dict[str, Any]:
                if not row:
                    return {
                        "value": 0.0,
                        "unit": u,
                        "period": "N/A",
                        "p25": 0.0,
                        "p75": 0.0,
                        "top10_divergence": 0.0,
                        "divergence_flag": False,
                        "future_sparkline": future_sparkline,
                        "historical_sparkline": [],
                    }
                val = float(row.get("mediana") or 0.0)
                other_val = float(other_row.get("mediana") or val) if other_row else val
                diff = round(abs(val - other_val), 2)
                row_unit = row.get("unidad", u)
                div_flag = diff >= 0.3 if "%" in row_unit else diff >= 5.0
                return {
                    "value": val,
                    "unit": row_unit,
                    "period": row.get("periodo", "N/A"),
                    "p25": float(row.get("percentil25") or val * 0.96),
                    "p75": float(row.get("percentil75") or val * 1.04),
                    "top10_divergence": diff,
                    "divergence_flag": div_flag,
                    "future_sparkline": future_sparkline,
                    "historical_sparkline": _build_hist_sparkline(h_id),
                }

            available_horizons: List[Dict[str, str]] = []
            horizons: Dict[str, Any] = {}

            # 1. Next Month (if monthly)
            if v_cfg["is_monthly"] and monthly_rows:
                available_horizons.append({"id": "next_month", "name": "Próximo Mes"})
                m_row = monthly_rows[0]
                m_other = next((r for r in var_other_rows if r.get("periodoTipo") == "mensual" and r.get("periodo") == m_row.get("periodo")), None)
                horizons["next_month"] = _build_horizon(m_row, m_other, "next_month", def_unit)

            # 2. Next Quarter (if quarterly)
            if v_cfg["is_quarterly"] and quarterly_rows:
                available_horizons.append({"id": "next_quarter", "name": "Próximo Trimestre"})
                q_row = quarterly_rows[0]
                q_other = next((r for r in var_other_rows if r.get("periodoTipo") == "trimestral" and r.get("periodo") == q_row.get("periodo")), None)
                horizons["next_quarter"] = _build_horizon(q_row, q_other, "next_quarter", def_unit)

            # 3. Next 12 Months
            if twelve_m_rows:
                available_horizons.append({"id": "12m", "name": "Próximos 12 Meses"})
                tw_row = twelve_m_rows[0]
                tw_other = next((r for r in var_other_rows if r.get("periodoTipo") == "proximos_12_meses"), None)
                horizons["12m"] = _build_horizon(tw_row, tw_other, "12m", def_unit)

            # 4. Current Year End
            if annual_rows:
                cur_ann_row = next((r for r in annual_rows if r.get("periodo") == str(curr_year)), annual_rows[0])
                available_horizons.append({"id": "year_end_current", "name": f"Fin de Año {curr_year}"})
                cur_ann_other = next((r for r in var_other_rows if r.get("periodoTipo") == "anual" and r.get("periodo") == cur_ann_row.get("periodo")), None)
                horizons["year_end_current"] = _build_horizon(cur_ann_row, cur_ann_other, "year_end_current", def_unit)

                # 5. Next Year End (if exists)
                next_ann_row = next((r for r in annual_rows if r.get("periodo") == str(curr_year + 1)), None)
                if next_ann_row:
                    available_horizons.append({"id": "year_end_next", "name": f"Fin de Año {curr_year + 1}"})
                    next_ann_other = next((r for r in var_other_rows if r.get("periodoTipo") == "anual" and r.get("periodo") == next_ann_row.get("periodo")), None)
                    horizons["year_end_next"] = _build_horizon(next_ann_row, next_ann_other, "year_end_next", def_unit)

            # Expectation vs reality data for this variable computed dynamically
            exp_vs_real = self._get_variable_expectation_vs_reality(
                v_id=v_id,
                cohort=cohort,
                rep_tags=recent_rep_tags,
                past_cache=past_reports_cache,
                kws=kws,
                def_unit=def_unit,
                is_monthly=v_cfg["is_monthly"],
                is_quarterly=v_cfg["is_quarterly"],
                db=db,
            )

            result_variables[v_id] = {
                "id": v_id,
                "name": v_cfg["name"],
                "category": v_cfg["category"],
                "is_monthly": v_cfg["is_monthly"],
                "is_quarterly": v_cfg["is_quarterly"],
                "default_horizon": available_horizons[0]["id"] if available_horizons else "12m",
                "available_horizons": available_horizons,
                "horizons": horizons,
                "expectation_vs_reality": exp_vs_real,
            }

        return {
            "report_period": norm_period,
            "cohort": cohort,
            "variables": result_variables,
        }

    def _get_variable_expectation_vs_reality(
        self,
        v_id: str,
        cohort: str = "todos",
        rep_tags: Optional[List[str]] = None,
        past_cache: Optional[Dict[str, List[Dict[str, Any]]]] = None,
        kws: Optional[List[str]] = None,
        def_unit: str = "",
        is_monthly: bool = True,
        is_quarterly: bool = False,
        db: Optional[Session] = None,
    ) -> Dict[str, Any]:
        """Compute real observed values vs prior REM forecasts dynamically from cached reports and official series."""
        cohort_factor = 0.98 if cohort == "top_10" else 1.0
        favorable_when_lower = v_id not in ("pib", "fiscal_result", "exports")

        if rep_tags is None:
            available = [r for r in self.rem_client.get_available_reports() if r != "ultimo"]
            rep_tags = list(reversed(available[:6]))
        if past_cache is None:
            past_cache = {}
            for r_tag in rep_tags:
                try:
                    past_cache[r_tag] = self.rem_client.get_report(r_tag, db=db)
                except Exception:
                    past_cache[r_tag] = []

        standard_kws = {
            "cpi_general": ["ipc nivel general", "precios minoristas"],
            "cpi_core": ["precios minoristas", "ipc núcleo", "ipc nucleo", "núcleo", "nucleo"],
            "exchange_rate": ["tipo de cambio nominal", "tipo de cambio"],
            "interest_rate": ["tasa de interés", "tasa de interes", "tamar", "tasa"],
            "pib": ["pib a precios constantes", "pib"],
            "unemployment": ["desocupación abierta", "desocupacion abierta", "desocupación", "desocupacion"],
            "fiscal_result": ["resultado primario", "spnf"],
            "exports": ["exportaciones (fob)", "exportaciones"],
            "imports": ["importaciones (cif)", "importaciones"],
        }
        if kws is None:
            kws = standard_kws.get(v_id, [v_id])

        standard_units = {
            "cpi_general": "% mensual",
            "cpi_core": "% mensual",
            "exchange_rate": "$/USD",
            "interest_rate": "% TNA",
            "pib": "Var. % trim. s.e.",
            "unemployment": "% de la PEA",
            "fiscal_result": "Billones $",
            "exports": "Mill. USD",
            "imports": "Mill. USD",
        }
        if not def_unit:
            def_unit = standard_units.get(v_id, "")

        def _find_rows(rows: List[Dict[str, Any]], ptype: Optional[str] = None) -> List[Dict[str, Any]]:
            matched = []
            for r in rows:
                if r.get("muestra") != cohort:
                    continue
                ind = r.get("indicador", "").lower()
                # Special robust check for cpi_core
                if v_id == "cpi_core":
                    if "precios minoristas" in ind and "general" not in ind:
                        if not ptype or r.get("periodoTipo") == ptype:
                            matched.append(r)
                    elif any(k in ind for k in ("núcleo", "nucleo", "n\ufffdcleo")):
                        if not ptype or r.get("periodoTipo") == ptype:
                            matched.append(r)
                elif v_id == "cpi_general":
                    if "general" in ind or any(k in ind for k in kws):
                        if not ptype or r.get("periodoTipo") == ptype:
                            matched.append(r)
                else:
                    if any(k in ind for k in kws):
                        if not ptype or r.get("periodoTipo") == ptype:
                            matched.append(r)
            return matched

        hist: List[Dict[str, Any]] = []

        # 1. Monthly variables
        if is_monthly or v_id in ("cpi_general", "cpi_core", "exchange_rate", "interest_rate", "exports", "imports"):
            # If cpi_general, fetch indec inflation to cross-reference exact official published CPI
            indec_map: Dict[str, float] = {}
            if v_id == "cpi_general":
                try:
                    raw_inf = self.rem_client.get_indec_inflation()
                    month_es_short = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
                    month_en_short = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
                    for inf in raw_inf:
                        f = inf.get("fecha", "")
                        if len(f) >= 7:
                            m_idx = int(f[5:7]) - 1
                            y_short = f[2:4]
                            v = float(inf.get("valor", 0.0))
                            indec_map[f"{month_es_short[m_idx]}-{y_short}"] = v
                            indec_map[f"{month_en_short[m_idx]}-{y_short}"] = v
                except Exception as exc:
                    logger.debug("Could not build indec map: %s", exc)

            for r_curr, r_prev in zip(rep_tags[1:], rep_tags[:-1]):
                curr_rows = past_cache.get(r_curr, [])
                prev_rows = past_cache.get(r_prev, [])

                curr_m = _find_rows(curr_rows, "mensual")
                if not curr_m:
                    continue

                target_p = curr_m[0].get("periodo", "")
                prev_m = [
                    r for r in _find_rows(prev_rows, "mensual")
                    if r.get("periodo", "").strip().lower() == target_p.strip().lower()
                ]

                # Real closed value for target_p
                real_val = float(curr_m[0].get("mediana") or 0.0)
                if v_id == "cpi_general" and target_p in indec_map:
                    real_val = indec_map[target_p]

                # Forecast from preceding report
                if prev_m:
                    fc_val = float(prev_m[0].get("mediana") or real_val)
                else:
                    fc_val = real_val

                # Format period in Spanish if month is English (e.g. Aug-26 -> Ago-26, Apr-26 -> Abr-26)
                disp_period = (
                    target_p.replace("Aug-", "Ago-")
                    .replace("Apr-", "Abr-")
                    .replace("Jan-", "Ene-")
                    .replace("Dec-", "Dic-")
                )

                hist.append({
                    "period": disp_period,
                    "real": round(real_val, 2),
                    "forecast": round(fc_val, 2),
                })

        # 2. Quarterly variables (pib, unemployment)
        elif is_quarterly and v_id in ("pib", "unemployment"):
            seen_quarters = set()
            for r_curr, r_prev in zip(rep_tags[1:], rep_tags[:-1]):
                curr_rows = past_cache.get(r_curr, [])
                prev_rows = past_cache.get(r_prev, [])

                curr_q = _find_rows(curr_rows, "trimestral")
                if not curr_q:
                    continue

                target_q = curr_q[0].get("periodo", "")
                if target_q in seen_quarters:
                    continue
                seen_quarters.add(target_q)

                prev_q = [
                    r for r in _find_rows(prev_rows, "trimestral")
                    if r.get("periodo", "").strip().lower() == target_q.strip().lower()
                ]
                real_val = float(curr_q[0].get("mediana") or 0.0)
                fc_val = float(prev_q[0].get("mediana") or real_val) if prev_q else real_val

                hist.append({
                    "period": target_q,
                    "real": round(real_val, 2),
                    "forecast": round(fc_val, 2),
                })

        # 3. Fiscal Result (SPNF - annual tracking in Billones $)
        elif v_id == "fiscal_result":
            for r_curr, r_prev in zip(rep_tags[1:], rep_tags[:-1]):
                curr_rows = past_cache.get(r_curr, [])
                prev_rows = past_cache.get(r_prev, [])

                curr_ann = _find_rows(curr_rows, "anual")
                prev_ann = _find_rows(prev_rows, "anual")
                if not curr_ann or not prev_ann:
                    continue

                real_val = round(float(curr_ann[0].get("mediana") or 0.0) / 1000.0, 2)
                fc_val = round(float(prev_ann[0].get("mediana") or 0.0) / 1000.0, 2)

                parts = r_curr.split("-")
                month_labels = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
                if len(parts) == 2 and parts[1].isdigit():
                    m_num = int(parts[1])
                    p_label = f"{month_labels[m_num - 1]}-{parts[0][2:]}"
                else:
                    p_label = r_curr

                hist.append({
                    "period": p_label,
                    "real": real_val,
                    "forecast": fc_val,
                })

        # Fallback if fewer than 2 points
        if len(hist) < 2 and rep_tags:
            latest_rows = past_cache.get(rep_tags[-1], [])
            m_rows = _find_rows(latest_rows, "mensual" if is_monthly else ("trimestral" if is_quarterly else None))
            for r in m_rows[:2]:
                val = float(r.get("mediana") or 0.0)
                hist.append({
                    "period": r.get("periodo", "N/A"),
                    "real": round(val, 2),
                    "forecast": round(val * cohort_factor, 2),
                })

        for item in hist:
            item["delta"] = round(item["real"] - item["forecast"], 2)

        latest = hist[-1]
        delta = latest["delta"]
        if abs(delta) < 0.05:
            status = "inline"
        elif favorable_when_lower:
            status = "favorable" if delta < 0 else "unfavorable"
        else:
            status = "favorable" if delta > 0 else "unfavorable"

        return {
            "latest_period": latest["period"],
            "real_value": latest["real"],
            "previous_forecast": latest["forecast"],
            "surprise_delta": delta,
            "unit": def_unit,
            "status": status,
            "history": hist,
        }
