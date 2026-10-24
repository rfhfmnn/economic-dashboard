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
