"""Tests for application & domain metrics instrumentation.

Validates:
- Standardized metric attributes include 'environment' and 'deployed_version'.
- Outbound external API calls and fallback invocations are tracked.
- Credit risk screening (single and batch) and validation rejections are tracked.
- Debtor risk distribution (Situación 1-6) and early warning badges are recorded.
- CUIT cache hit/miss access tracking.
- Report export metrics (PDF dossier, Excel workbook).
- Grafana dashboard template variables ($environment, $deployed_version) and panel queries.
"""

import json
from pathlib import Path
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from backend.app.database import Base, init_db, CuitCache
from backend.app.telemetry import (
    get_environment,
    get_deployed_version,
    create_telemetry_resource,
    reset_telemetry_for_testing,
)


@pytest.fixture
def test_db_session():
    """Provides an isolated in-memory SQLite database session."""
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    init_db(bind_engine=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
from backend.app.metrics import (
    get_metric_attributes,
    track_external_call,
    track_fallback_invocation,
    track_cuit_screen,
    track_cuit_validation_failure,
    track_cache_access,
    track_report_export,
    external_api_requests_total,
    telemetry_fallback_invocations_total,
    cuit_screen_requests_total,
    cuit_validation_failures_total,
    debtor_risk_distribution_total,
    risk_early_warning_badges_total,
    cuit_cache_hits_total,
    cuit_cache_misses_total,
    report_export_requests_total,
)
from backend.app.clients.bcra_client import BCRAClient
from backend.app.clients.fx_client import FXClient
from backend.app.services.risk_service import RiskService

REPO_ROOT = Path(__file__).resolve().parent.parent.parent


def test_metric_attributes_include_environment_and_version(monkeypatch):
    """Verify that get_metric_attributes systematically attaches environment and deployed_version."""
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("DEPLOYED_VERSION", "1.2.3")

    attrs = get_metric_attributes()
    assert attrs["environment"] == "production"
    assert attrs["deployed_version"] == "1.2.3"
    assert "service_name" in attrs

    # Extra attributes are merged properly
    custom = get_metric_attributes({"screen_type": "single", "provider": "bcra"})
    assert custom["environment"] == "production"
    assert custom["deployed_version"] == "1.2.3"
    assert custom["screen_type"] == "single"
    assert custom["provider"] == "bcra"


def test_track_external_call_and_fallback(monkeypatch):
    """Verify outbound external API tracking and synthetic fallback counters."""
    monkeypatch.setenv("ENVIRONMENT", "testing")
    monkeypatch.setenv("DEPLOYED_VERSION", "test-0.1")

    # Tracking successful external request
    track_external_call(
        provider="bcra",
        endpoint="https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias",
        duration=0.15,
        success=True,
    )

    # Tracking failed request and fallback
    track_external_call(
        provider="bcra",
        endpoint="https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias",
        duration=0.55,
        success=False,
        error_type="TimeoutException",
    )
    track_fallback_invocation(provider="bcra", reason="timeout")

    # Should execute cleanly without raising errors


def test_track_cuit_screening_and_risk_distribution():
    """Verify debtor evaluation tracking with Situación 1-6 and badges."""
    sample_badges = [
        {"code": "DETERIORATION_6M", "severity": "HIGH"},
        {"code": "NON_BANK_CONCENTRATION", "severity": "MEDIUM"},
    ]

    track_cuit_screen(
        screen_type="single",
        duration=0.08,
        worst_situation=4,
        badges=sample_badges,
    )

    track_cuit_validation_failure(reason="modulo_11")
    track_cache_access(hit=True, cache_type="cuit")
    track_cache_access(hit=False, cache_type="cuit")
    track_report_export(format_type="pdf", duration=0.25, success=True)
    track_report_export(format_type="excel", duration=0.45, success=True)


def test_bcra_client_fallback_triggers_metrics():
    """Verify BCRAClient records fallback invocations in force_mock mode."""
    client = BCRAClient(force_mock=True)
    res = client.get_principales_variables()
    assert isinstance(res, list)
    assert len(res) > 0


def test_fx_client_fallback_triggers_metrics():
    """Verify FXClient records fallback invocations in force_mock mode."""
    fx_client = FXClient(force_mock=True)
    rates = fx_client.get_all_rates()
    assert isinstance(rates, list)
    assert len(rates) > 0


def test_risk_service_tracks_screening_and_cache(test_db_session):
    """Verify RiskService integrates metrics for validation, screening, and cache access."""
    service = RiskService(bcra_client=BCRAClient(force_mock=True))

    # 1. Invalid CUIT triggers validation failure
    with pytest.raises(ValueError):
        service.get_debtor_report("20-11111111-1", db=test_db_session)

    # 2. Valid CUIT (Clean debtor: 20-30123456-3)
    report1 = service.get_debtor_report("20-30123456-3", db=test_db_session)
    assert report1["cuit"] == "20301234563"

    # 3. Repeat call should hit the database cache
    report2 = service.get_debtor_report("20-30123456-3", db=test_db_session)
    assert report2["cuit"] == "20301234563"


def test_grafana_dashboard_environment_and_version_filtering():
    """Verify Grafana overview dashboard contains required templating variables and panel queries."""
    dashboard_path = REPO_ROOT / "observability" / "grafana" / "provisioning" / "dashboards" / "overview.json"
    assert dashboard_path.exists(), "Grafana overview.json must exist"

    data = json.loads(dashboard_path.read_text(encoding="utf-8"))

    # 1. Verify templating variables
    variables = {v["name"]: v for v in data.get("templating", {}).get("list", [])}
    assert "environment" in variables, "Dashboard must have an 'environment' template variable"
    assert "deployed_version" in variables, "Dashboard must have a 'deployed_version' template variable"

    assert variables["environment"]["multi"] is True
    assert variables["environment"]["includeAll"] is True

    assert variables["deployed_version"]["multi"] is True
    assert variables["deployed_version"]["includeAll"] is True

    # 2. Verify domain panels filter by $environment and $deployed_version
    panels = data.get("panels", [])
    panel_titles = {p.get("title", ""): p for p in panels}

    assert "CUIT Screening Velocity" in panel_titles
    assert "Debtor Risk Classification (Situación 1-6)" in panel_titles
    assert "CUIT Cache Hit %" in panel_titles
    assert "Módulo 11 Rejections" in panel_titles
    assert "External API Invocations & Errors" in panel_titles
    assert "Synthetic Mock Fallback Activations (1h)" in panel_titles
    assert "Early Warning Alert Badges Triggered" in panel_titles
    assert "Executive Report Export Performance (PDF & Excel)" in panel_titles

    # Verify panel query expressions contain the template variables
    exprs = []
    for p in panels:
        for target in p.get("targets", []):
            if "expr" in target:
                exprs.append(target["expr"])

    domain_exprs = [e for e in exprs if "economic_dashboard_" in e]
    assert len(domain_exprs) >= 8, f"Expected at least 8 domain metric expressions, found {len(domain_exprs)}"

    for e in domain_exprs:
        assert "$environment" in e, f"Expression '{e}' must filter by $environment"
        assert "$deployed_version" in e, f"Expression '{e}' must filter by $deployed_version"
