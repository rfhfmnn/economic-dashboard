"""Application & domain metrics instrumentation using OpenTelemetry Metrics SDK.

Tracks:
- Outbound financial API resilience (BCRA, DolarApi, REM) and synthetic fallback invocations.
- Credit risk screening (Central de Deudores), CUIT Módulo 11 validation rejections, and Situación (1-6) distribution.
- Early warning risk alert badge occurrences.
- Cache hits vs misses for debtor lookups and macro series.
- Executive dossier (PDF) and batch portfolio (Excel) report export latency and volumes.

All recorded metrics systematically carry 'environment' and 'deployed_version' attributes
enabling fine-grained filtering and multi-environment dashboard visualization in Grafana.
"""

from typing import Any, Dict, List, Optional
from opentelemetry import metrics

from backend.app.telemetry import get_environment, get_deployed_version, get_service_name

# OpenTelemetry domain meter
meter = metrics.get_meter("economic-dashboard-metrics")

# ==============================================================================
# 1. External Financial API & Resilience Metrics
# ==============================================================================
external_api_requests_total = meter.create_counter(
    name="economic_dashboard_external_api_requests_total",
    description="Total outbound HTTP requests to financial data providers (BCRA, DolarApi, REM, etc.)",
    unit="1",
)

external_api_errors_total = meter.create_counter(
    name="economic_dashboard_external_api_errors_total",
    description="Total failed outbound HTTP requests to financial data providers",
    unit="1",
)

telemetry_fallback_invocations_total = meter.create_counter(
    name="economic_dashboard_telemetry_fallback_invocations_total",
    description="Total times synthetic mock fallback was invoked due to external API failures or offline mode",
    unit="1",
)

external_api_duration_seconds = meter.create_histogram(
    name="economic_dashboard_external_api_duration_seconds",
    description="Latency duration of outbound calls to external financial APIs",
    unit="s",
)

# ==============================================================================
# 2. Credit Risk Screener Metrics (Central de Deudores)
# ==============================================================================
cuit_screen_requests_total = meter.create_counter(
    name="economic_dashboard_cuit_screen_requests_total",
    description="Total debtor credit risk evaluations processed",
    unit="1",
)

cuit_validation_failures_total = meter.create_counter(
    name="economic_dashboard_cuit_validation_failures_total",
    description="Total CUIT/CUIL validation rejections (Módulo 11 checksum or format errors)",
    unit="1",
)

debtor_risk_distribution_total = meter.create_counter(
    name="economic_dashboard_debtor_risk_distribution_total",
    description="Total evaluated debtors categorized by worst BCRA Situación (1 to 6)",
    unit="1",
)

risk_early_warning_badges_total = meter.create_counter(
    name="economic_dashboard_risk_early_warning_badges_total",
    description="Total early-warning credit risk badges triggered during debtor screening",
    unit="1",
)

cuit_screen_duration_seconds = meter.create_histogram(
    name="economic_dashboard_cuit_screen_duration_seconds",
    description="Latency duration of debtor credit evaluations",
    unit="s",
)

# ==============================================================================
# 3. Cache Performance Metrics
# ==============================================================================
cuit_cache_hits_total = meter.create_counter(
    name="economic_dashboard_cuit_cache_hits_total",
    description="Total debtor database and local cache hits avoiding remote API hits",
    unit="1",
)

cuit_cache_misses_total = meter.create_counter(
    name="economic_dashboard_cuit_cache_misses_total",
    description="Total debtor cache misses requiring fresh upstream queries",
    unit="1",
)

# ==============================================================================
# 4. Report & File Export Metrics
# ==============================================================================
report_export_requests_total = meter.create_counter(
    name="economic_dashboard_report_export_requests_total",
    description="Total executive dossier reports and portfolio spreadsheets exported",
    unit="1",
)

report_export_duration_seconds = meter.create_histogram(
    name="economic_dashboard_report_export_duration_seconds",
    description="Latency duration of report generation and file export operations",
    unit="s",
)


def get_metric_attributes(extra_attrs: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Build standardized metric attributes injecting environment and deployed version."""
    attrs: Dict[str, Any] = {
        "environment": get_environment(),
        "deployed_version": get_deployed_version(),
        "service_name": get_service_name(),
        "service": get_service_name(),
    }
    if extra_attrs:
        attrs.update(extra_attrs)
    return attrs


def track_external_call(
    provider: str,
    endpoint: str,
    duration: float,
    success: bool,
    error_type: Optional[str] = None,
) -> None:
    """Record outbound external API call metrics."""
    attrs = get_metric_attributes({
        "provider": provider,
        "endpoint": endpoint,
        "status": "success" if success else "error",
    })
    external_api_requests_total.add(1, attrs)
    external_api_duration_seconds.record(max(0.0, duration), attrs)

    if not success:
        err_attrs = get_metric_attributes({
            "provider": provider,
            "endpoint": endpoint,
            "error_type": error_type or "unknown",
        })
        external_api_errors_total.add(1, err_attrs)


def track_fallback_invocation(provider: str, reason: str = "network_failure") -> None:
    """Record when synthetic mock fallback data is seamlessly returned."""
    attrs = get_metric_attributes({
        "provider": provider,
        "reason": reason,
    })
    telemetry_fallback_invocations_total.add(1, attrs)


def track_cuit_screen(
    screen_type: str,
    duration: float,
    worst_situation: Optional[int] = None,
    badges: Optional[List[Dict[str, Any]]] = None,
) -> None:
    """Record debtor screening evaluation metrics and classification."""
    attrs = get_metric_attributes({"screen_type": screen_type})
    cuit_screen_requests_total.add(1, attrs)
    cuit_screen_duration_seconds.record(max(0.0, duration), attrs)

    if worst_situation is not None and 1 <= worst_situation <= 6:
        sit_attrs = get_metric_attributes({"situation": str(worst_situation)})
        debtor_risk_distribution_total.add(1, sit_attrs)

    if badges:
        for badge in badges:
            badge_code = badge.get("code", "UNKNOWN")
            severity = badge.get("severity", "MEDIUM")
            badge_attrs = get_metric_attributes({
                "badge_type": badge_code,
                "severity": severity,
            })
            risk_early_warning_badges_total.add(1, badge_attrs)


def track_cuit_validation_failure(reason: str = "modulo_11") -> None:
    """Record CUIT/CUIL validation rejection."""
    attrs = get_metric_attributes({"reason": reason})
    cuit_validation_failures_total.add(1, attrs)


def track_cache_access(hit: bool, cache_type: str = "cuit") -> None:
    """Record cache hit or miss event."""
    attrs = get_metric_attributes({"cache_type": cache_type})
    if hit:
        cuit_cache_hits_total.add(1, attrs)
    else:
        cuit_cache_misses_total.add(1, attrs)


def track_report_export(format_type: str, duration: float, success: bool = True) -> None:
    """Record document export operations."""
    attrs = get_metric_attributes({
        "format": format_type,
        "status": "success" if success else "error",
    })
    report_export_requests_total.add(1, attrs)
    report_export_duration_seconds.record(max(0.0, duration), attrs)


# ==============================================================================
# 5. Application Service & Telemetry Discovery Metadata
# ==============================================================================
app_info_gauge = meter.create_gauge(
    name="economic_dashboard_app_info",
    description="Application metadata, deployed version, and environment status",
    unit="",
)


def record_app_info() -> None:
    """Emit heartbeat metric with environment and version metadata."""
    app_info_gauge.set(1, get_metric_attributes({"status": "running"}))


# Record initial metadata on module import so labels are discoverable immediately
try:
    record_app_info()
except Exception:
    pass

