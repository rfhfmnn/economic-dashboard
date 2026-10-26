"""OpenTelemetry instrumentation setup for Economic & Credit Risk Dashboard backend.

Configures:
- OpenTelemetry Resource with:
  - service name (service.name)
  - environment (deployment.environment)
  - deployed version (service.version)
- Tracing provider and processors (OTLP, Console, or In-Memory)
- Automatic instrumentation for FastAPI, HTTPX client, and SQLAlchemy engine
- Telemetry metadata inspection helpers
"""

import os
import logging
from typing import Any, Dict, Optional
from fastapi import FastAPI
from sqlalchemy.engine import Engine

from opentelemetry import trace, metrics
from opentelemetry.sdk.resources import Resource, SERVICE_NAME, SERVICE_VERSION
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, SimpleSpanProcessor, ConsoleSpanExporter
from opentelemetry.sdk.metrics import MeterProvider

logger = logging.getLogger("telemetry")

# Global initialization flags and state
_is_instrumented = False
_active_tracer_provider: Optional[TracerProvider] = None
_active_meter_provider: Optional[MeterProvider] = None


def get_service_name() -> str:
    """Resolve the service name from environment variables or sensible default."""
    return (
        os.getenv("OTEL_SERVICE_NAME")
        or os.getenv("SERVICE_NAME")
        or "economic-dashboard-backend"
    )


def get_environment() -> str:
    """Resolve the environment from environment variables or heuristic default."""
    env = (
        os.getenv("OTEL_ENVIRONMENT")
        or os.getenv("ENVIRONMENT")
        or os.getenv("APP_ENV")
        or os.getenv("ENV")
    )
    if env:
        return env.lower()

    # Heuristic fallback based on database connection string or port
    db_url = os.getenv("DATABASE_URL", "").lower()
    port = os.getenv("PORT", "")
    if "prod" in db_url or port == "8080":
        return "production"
    return "development"


def get_deployed_version() -> str:
    """Resolve the deployed version from environment variables or package default."""
    return (
        os.getenv("OTEL_SERVICE_VERSION")
        or os.getenv("SERVICE_VERSION")
        or os.getenv("DEPLOYED_VERSION")
        or os.getenv("APP_VERSION")
        or "0.1.0"
    )


def get_telemetry_info() -> Dict[str, Any]:
    """Return dictionary of current telemetry identity metadata and status."""
    return {
        "service_name": get_service_name(),
        "environment": get_environment(),
        "deployed_version": get_deployed_version(),
        "status": "enabled" if _is_instrumented else "configured",
    }


def create_telemetry_resource(
    service_name: Optional[str] = None,
    environment: Optional[str] = None,
    deployed_version: Optional[str] = None,
) -> Resource:
    """Create an OpenTelemetry Resource with service name, environment, and deployed version."""
    svc_name = service_name or get_service_name()
    env = environment or get_environment()
    ver = deployed_version or get_deployed_version()

    attributes = {
        SERVICE_NAME: svc_name,
        SERVICE_VERSION: ver,
        "service.name": svc_name,
        "service.version": ver,
        "deployment.environment": env,
        "environment": env,
        "deployed_version": ver,
    }
    return Resource.create(attributes)


def _setup_span_exporter(provider: TracerProvider) -> None:
    """Configure span processors and exporters according to environment configuration."""
    traces_exporter = os.getenv("OTEL_TRACES_EXPORTER", "").strip().lower()

    if traces_exporter == "none":
        # Telemetry is active locally without exporting to remote collectors
        return

    if traces_exporter == "console":
        provider.add_span_processor(SimpleSpanProcessor(ConsoleSpanExporter()))
        return

    # Check for OTLP exporter endpoints (defaults to local collector HTTP endpoint)
    raw_endpoint = (
        os.getenv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT")
        or os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
        or "http://localhost:4318/v1/traces"
    )
    if raw_endpoint.endswith("/v1/traces") or ":4317" in raw_endpoint:
        otlp_endpoint = raw_endpoint
    else:
        otlp_endpoint = f"{raw_endpoint.rstrip('/')}/v1/traces"

    try:
        # Try HTTP protobuf exporter first, then standard OTLP
        try:
            from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
            exporter = OTLPSpanExporter(endpoint=otlp_endpoint) if otlp_endpoint else OTLPSpanExporter()
        except ImportError:
            from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
            exporter = OTLPSpanExporter(endpoint=otlp_endpoint) if otlp_endpoint else OTLPSpanExporter()

        provider.add_span_processor(BatchSpanProcessor(exporter))
        logger.info("OpenTelemetry OTLP exporter registered for traces pointing to %s.", otlp_endpoint)
    except Exception as exc:
        logger.warning("Could not initialize OpenTelemetry OTLP exporter: %s", exc)


def _setup_metric_readers() -> list:
    """Configure metric readers and exporters according to environment configuration."""
    metrics_exporter = os.getenv("OTEL_METRICS_EXPORTER", "").strip().lower()

    if metrics_exporter == "none":
        return []

    # Default to local OTel collector HTTP endpoint if not explicitly provided
    raw_endpoint = (
        os.getenv("OTEL_EXPORTER_OTLP_METRICS_ENDPOINT")
        or os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
        or "http://localhost:4318/v1/metrics"
    )
    if raw_endpoint.endswith("/v1/metrics") or ":4317" in raw_endpoint:
        otlp_endpoint = raw_endpoint
    else:
        otlp_endpoint = f"{raw_endpoint.rstrip('/')}/v1/metrics"

    try:
        from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader

        try:
            from opentelemetry.exporter.otlp.proto.http.metric_exporter import OTLPMetricExporter
            exporter = OTLPMetricExporter(endpoint=otlp_endpoint) if otlp_endpoint else OTLPMetricExporter()
        except ImportError:
            from opentelemetry.exporter.otlp.proto.grpc.metric_exporter import OTLPMetricExporter
            exporter = OTLPMetricExporter(endpoint=otlp_endpoint) if otlp_endpoint else OTLPMetricExporter()

        # Default to 5 seconds for responsive dashboard updates
        interval_ms = int(os.getenv("OTEL_METRIC_EXPORT_INTERVAL", "5000"))
        reader = PeriodicExportingMetricReader(exporter, export_interval_millis=interval_ms)
        logger.info("OpenTelemetry OTLP metric reader registered pointing to %s.", otlp_endpoint)
        return [reader]
    except Exception as exc:
        logger.warning("Could not initialize OpenTelemetry OTLP metric exporter: %s", exc)
        return []


def get_tracer_provider() -> Optional[TracerProvider]:
    """Return the active TracerProvider instance."""
    return _active_tracer_provider


def get_meter_provider() -> Optional[MeterProvider]:
    """Return the active MeterProvider instance."""
    return _active_meter_provider


def add_span_processor(processor: Any) -> None:
    """Attach an additional span processor (e.g. for testing) to the active tracer provider."""
    global _active_tracer_provider
    if _active_tracer_provider is not None:
        _active_tracer_provider.add_span_processor(processor)


def init_telemetry(
    app: Optional[FastAPI] = None,
    engine: Optional[Engine] = None,
    custom_resource: Optional[Resource] = None,
) -> TracerProvider:
    """Initialize OpenTelemetry tracer, meter, and auto-instrumentations.

    Includes service name, environment, and deployed version in all spans and metrics.
    """
    global _is_instrumented, _active_tracer_provider, _active_meter_provider

    if _is_instrumented and _active_tracer_provider is not None:
        return _active_tracer_provider

    resource = custom_resource or create_telemetry_resource()

    # Configure TracerProvider
    tracer_provider = TracerProvider(resource=resource)
    _setup_span_exporter(tracer_provider)
    trace.set_tracer_provider(tracer_provider)
    _active_tracer_provider = tracer_provider

    # Configure MeterProvider
    metric_readers = _setup_metric_readers()
    meter_provider = MeterProvider(resource=resource, metric_readers=metric_readers)
    metrics.set_meter_provider(meter_provider)
    _active_meter_provider = meter_provider

    svc_name = resource.attributes.get("service.name", get_service_name())
    env = resource.attributes.get("deployment.environment", get_environment())
    ver = resource.attributes.get("service.version", get_deployed_version())

    # Instrument FastAPI application if provided
    if app is not None:
        try:
            from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

            def server_request_hook(span: Any, scope: Any):
                if span and span.is_recording():
                    span.set_attribute("service.name", svc_name)
                    span.set_attribute("environment", env)
                    span.set_attribute("deployment.environment", env)
                    span.set_attribute("deployed_version", ver)
                    span.set_attribute("service.version", ver)

            FastAPIInstrumentor.instrument_app(
                app,
                tracer_provider=tracer_provider,
                meter_provider=meter_provider,
                server_request_hook=server_request_hook,
            )
        except Exception as exc:
            logger.warning("FastAPI instrumentation warning: %s", exc)

    # Instrument HTTPX client calls (BCRA API, ArgentinaDatos, DolarApi)
    try:
        from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
        HTTPXClientInstrumentor().instrument(tracer_provider=tracer_provider)
    except Exception as exc:
        logger.warning("HTTPX instrumentation warning: %s", exc)

    # Instrument SQLAlchemy engine queries if engine provided
    if engine is not None:
        try:
            from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
            SQLAlchemyInstrumentor().instrument(engine=engine, tracer_provider=tracer_provider)
        except Exception as exc:
            logger.warning("SQLAlchemy instrumentation warning: %s", exc)

    _is_instrumented = True
    return tracer_provider


def get_tracer(name: str = "economic-dashboard") -> trace.Tracer:
    """Return an OpenTelemetry tracer for manual instrumentation spans."""
    return trace.get_tracer(name)


def get_meter(name: str = "economic-dashboard") -> metrics.Meter:
    """Return an OpenTelemetry meter for application metrics instruments."""
    return metrics.get_meter(name)


def reset_telemetry_for_testing() -> None:
    """Reset telemetry initialization state for unit testing suites."""
    global _is_instrumented, _active_tracer_provider, _active_meter_provider
    _is_instrumented = False
    _active_tracer_provider = None
    _active_meter_provider = None

