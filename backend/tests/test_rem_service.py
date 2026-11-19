"""Unit and integration tests for RemService and REM REST API endpoints."""

import pytest
from starlette.testclient import TestClient

from backend.app.clients.rem_client import REMClient
from backend.app.services.rem_service import RemService


@pytest.fixture
def rem_service():
    client = REMClient(force_mock=True)
    return RemService(rem_client=client)


def test_categorize_indicator(rem_service):
    assert rem_service.categorize_indicator("Precios minoristas (IPC nivel general)") == "Precios"
    assert rem_service.categorize_indicator("IPC núcleo") == "Precios"
    assert rem_service.categorize_indicator("Tipo de cambio nominal ($/USD)") == "Tipo de Cambio"
    assert rem_service.categorize_indicator("Tasa de interés TAMAR") == "Tasas"
    assert rem_service.categorize_indicator("BADLAR en pesos") == "Tasas"
    assert rem_service.categorize_indicator("PIB a precios constantes") == "Actividad"
    assert rem_service.categorize_indicator("Desocupación abierta") == "Actividad"
    assert rem_service.categorize_indicator("Exportaciones FOB") == "Otros"


def test_rem_summary_kpis_and_cohort_divergence(rem_service):
    summary_todos = rem_service.get_rem_summary(period="2026-09", cohort="todos")
    assert summary_todos["report_period"] == "2026-09"
    assert summary_todos["cohort"] == "todos"
    assert "kpis" in summary_todos

    kpis = summary_todos["kpis"]
    assert "cpi_next_month" in kpis
    assert "cpi_12m" in kpis
    assert "fx_year_end" in kpis
    assert "policy_rate" in kpis

    # Check numerical realism
    assert kpis["cpi_next_month"]["value"] > 0
    assert kpis["cpi_12m"]["value"] > 0
    assert kpis["fx_year_end"]["value"] > 500
    assert kpis["policy_rate"]["value"] > 10

    # Test top_10 cohort
    summary_top10 = rem_service.get_rem_summary(period="2026-09", cohort="top_10")
    assert summary_top10["cohort"] == "top_10"
    assert summary_top10["total_participants"] == 10


def test_cpi_expectation_vs_reality_calculation(rem_service):
    result = rem_service.get_cpi_expectation_vs_reality(lookback_months=6, cohort="todos")
    assert result["cohort"] == "todos"
    assert result["lookback_months"] == 6
    assert "summary" in result
    assert "series" in result

    series = result["series"]
    assert len(series) == 6

    for point in series:
        # Surprise formula verification: surprise_delta == real_cpi - expected_cpi
        expected_delta = round(point["real_cpi"] - point["expected_cpi"], 2)
        assert point["surprise_delta"] == expected_delta
        assert point["dispersion"] == round(point["p75"] - point["p25"], 2)

        if point["surprise_delta"] > 0.05:
            assert point["direction"] == "overshoot"
        elif point["surprise_delta"] < -0.05:
            assert point["direction"] == "undershoot"
        else:
            assert point["direction"] == "inline"

    summary = result["summary"]
    assert "mean_absolute_error" in summary
    assert "average_bias" in summary
    assert summary["mean_absolute_error"] >= 0


def test_percentile_monotonicity_in_forecast_cone(rem_service):
    cone = rem_service.get_rem_forecast_cone(variable="ipc_nivel_general", period="2026-09", cohort="todos")
    assert cone["variable"] == "ipc_nivel_general"
    assert len(cone["points"]) > 0

    for pt in cone["points"]:
        # Percentile Monotonicity Invariant: P10 <= P25 <= Median <= P75 <= P90
        assert pt["p10"] <= pt["p25"]
        assert pt["p25"] <= pt["mediana"]
        assert pt["mediana"] <= pt["p75"]
        assert pt["p75"] <= pt["p90"]

        # Minimum and Maximum bounds
        assert pt["minimo"] <= pt["p10"]
        assert pt["p90"] <= pt["maximo"]

        # Positive IQR width
        assert pt["band_iqr"] >= 0


def test_rem_breakdown_table_and_category_filter(rem_service):
    # All categories
    table_all = rem_service.get_rem_breakdown_table(period="2026-09", cohort="todos", category="all")
    assert table_all["category_filter"] == "all"
    assert table_all["total_records"] > 0

    # Specific category filter
    table_precios = rem_service.get_rem_breakdown_table(period="2026-09", cohort="todos", category="Precios")
    assert table_precios["category_filter"] == "Precios"
    for row in table_precios["rows"]:
        assert row["categoria"] == "Precios"
        assert "mediana" in row
        assert "promedio" in row
        assert "desvio" in row
        assert "p25" in row
        assert "p75" in row
        assert "top10_divergence" in row
        assert "divergence_flag" in row


def test_fastapi_rem_endpoints(client: TestClient):
    # 1. Reports catalog
    resp_reports = client.get("/api/macro/rem/reports")
    assert resp_reports.status_code == 200
    reports = resp_reports.json()
    assert isinstance(reports, list)
    assert len(reports) > 0

    # 2. Summary
    resp_summary = client.get("/api/macro/rem/summary?period=ultimo&cohort=todos")
    assert resp_summary.status_code == 200
    summary = resp_summary.json()
    assert "kpis" in summary
    assert "cpi_next_month" in summary["kpis"]

    # 3. CPI Comparison
    resp_cpi = client.get("/api/macro/rem/cpi-comparison?lookback=6&cohort=todos")
    assert resp_cpi.status_code == 200
    cpi_data = resp_cpi.json()
    assert "series" in cpi_data
    assert len(cpi_data["series"]) == 6

    # 4. Forecast Cone
    resp_cone = client.get("/api/macro/rem/forecast-cone?variable=ipc_nivel_general&period=ultimo&cohort=todos")
    assert resp_cone.status_code == 200
    cone_data = resp_cone.json()
    assert "points" in cone_data
    assert len(cone_data["points"]) > 0

    # 5. Table
    resp_table = client.get("/api/macro/rem/table?period=ultimo&cohort=todos&category=Precios")
    assert resp_table.status_code == 200
    table_data = resp_table.json()
    assert "rows" in table_data
    assert table_data["total_records"] > 0

    # 6. Modular KPIs Endpoint
    resp_modular = client.get("/api/macro/rem/modular-kpis?period=ultimo&cohort=todos")
    assert resp_modular.status_code == 200
    mod_data = resp_modular.json()
    assert "variables" in mod_data
    assert "cpi_general" in mod_data["variables"]
    assert "pib" in mod_data["variables"]
    assert "exports" in mod_data["variables"]


def test_rem_modular_kpis_all_variables_and_sparklines(rem_service):
    """Verify all 8+ requested macroeconomic variables, horizons, and dual sparklines."""
    res = rem_service.get_rem_modular_kpis(period="2026-09", cohort="todos")
    assert res["report_period"] == "2026-09"
    assert res["cohort"] == "todos"

    vars_dict = res["variables"]
    expected_vars = [
        "cpi_general", "cpi_core", "exchange_rate", "interest_rate",
        "pib", "unemployment", "fiscal_result", "exports", "imports"
    ]
    for ev in expected_vars:
        assert ev in vars_dict, f"Variable '{ev}' missing from modular KPIs"
        v_data = vars_dict[ev]
        assert len(v_data["available_horizons"]) > 0
        assert len(v_data["horizons"]) > 0

        # Check default horizon
        def_h = v_data["default_horizon"]
        assert def_h in v_data["horizons"]
        h_data = v_data["horizons"][def_h]

        assert "value" in h_data
        assert "p25" in h_data
        assert "p75" in h_data
        assert "future_sparkline" in h_data
        assert "historical_sparkline" in h_data
        assert len(h_data["future_sparkline"]) > 0
        assert len(h_data["historical_sparkline"]) > 0

        # Sparklines must have period and value
        first_future = h_data["future_sparkline"][0]
        assert "period" in first_future and "value" in first_future
        first_hist = h_data["historical_sparkline"][0]
        assert "period" in first_hist and "value" in first_hist

    # Verify specific horizons for monthly vs quarterly
    cpi = vars_dict["cpi_general"]
    cpi_horizons = [h["id"] for h in cpi["available_horizons"]]
    assert "next_month" in cpi_horizons
    assert "12m" in cpi_horizons
    assert "year_end_current" in cpi_horizons

    pib = vars_dict["pib"]
    pib_horizons = [h["id"] for h in pib["available_horizons"]]
    assert "next_quarter" in pib_horizons
    assert "year_end_current" in pib_horizons


def test_parse_rem_period_to_iso():
    from backend.app.services.rem_service import parse_rem_period_to_iso
    assert parse_rem_period_to_iso("Oct-26") == "2026-10-01"
    assert parse_rem_period_to_iso("Oct-2026") == "2026-10-01"
    assert parse_rem_period_to_iso("2026-10") == "2026-10-01"
    assert parse_rem_period_to_iso("2026-10-01") == "2026-10-01"
    assert parse_rem_period_to_iso("2026-09-30") == "2026-09-01"
    assert parse_rem_period_to_iso("Ene-25") == "2025-01-01"
    assert parse_rem_period_to_iso("Abr-26") == "2026-04-01"
    assert parse_rem_period_to_iso("Ago-26") == "2026-08-01"
    assert parse_rem_period_to_iso("Jan-27") == "2027-01-01"
    assert parse_rem_period_to_iso("Oct-26-01") == "2026-10-01"
    assert parse_rem_period_to_iso("") is None


def test_get_rem_series_ipc_general(rem_service):
    """Verify unified continuous series for IPC general pairing historical observed data with REM projections."""
    import re
    series = rem_service.get_rem_series("ipc_general")
    assert isinstance(series, list)
    assert len(series) >= 18

    # All points must have valid ISO format YYYY-MM-01
    iso_regex = re.compile(r"^\d{4}-\d{2}-01$")
    for pt in series:
        assert iso_regex.match(pt["fecha"]), f"Invalid ISO date: {pt['fecha']}"
        assert "valor" in pt
        assert "is_forecast" in pt
        assert "mediana" in pt
        assert "p25" in pt
        assert "p75" in pt

    # Verify chronological sorting
    fechas = [pt["fecha"] for pt in series]
    assert fechas == sorted(fechas)

    # Must contain both historical and forecast points
    hist_points = [p for p in series if not p["is_forecast"]]
    fc_points = [p for p in series if p["is_forecast"]]

    assert len(hist_points) >= 12, "Should contain at least 12 historical observed months"
    assert len(fc_points) >= 6, "Should contain forward-looking forecast months"

    # All historical points precede forecast points
    assert max(p["fecha"] for p in hist_points) <= min(p["fecha"] for p in fc_points)


def test_get_rem_series_other_variables_and_cohort(rem_service):
    """Verify REM series for tipo_cambio, badlar, tasa_politica, and cohort selection."""
    for var_key in ("tipo_cambio", "badlar", "tasa_politica"):
        series = rem_service.get_rem_series(var_key, cohort="todos")
        assert len(series) >= 18
        hist_pts = [p for p in series if not p["is_forecast"]]
        fc_pts = [p for p in series if p["is_forecast"]]
        assert len(hist_pts) > 0
        assert len(fc_pts) > 0
        for pt in series:
            assert pt["fecha"].endswith("-01")
            assert pt["valor"] > 0

    # Test top 10 cohort
    series_top10 = rem_service.get_rem_series("rem_tipo_cambio_top10")
    assert len(series_top10) >= 18
    assert all(pt["fecha"].endswith("-01") for pt in series_top10)


def test_fastapi_rem_series_endpoint(client: TestClient):
    """Verify GET /api/macro/rem/series/{variable_key} REST endpoint."""
    resp = client.get("/api/macro/rem/series/ipc_general")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 18

    # Inspect first and last point
    first_pt = data[0]
    assert first_pt["fecha"].endswith("-01")
    assert first_pt["is_forecast"] is False

    last_pt = data[-1]
    assert last_pt["fecha"].endswith("-01")
    assert last_pt["is_forecast"] is True
    assert "mediana" in last_pt
    assert "p25" in last_pt
    assert "p75" in last_pt

    # Endpoint with cohort=top_10
    resp_top10 = client.get("/api/macro/rem/series/tipo_cambio?cohort=top_10")
    assert resp_top10.status_code == 200
    data_top10 = resp_top10.json()
    assert len(data_top10) >= 18

