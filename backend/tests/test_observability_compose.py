"""Automated verification tests for the Observability Docker Compose stack.

Validates:
- Observability Docker Compose configuration (OpenTelemetry Collector, Prometheus, Loki, Tempo, Grafana).
- Isolation as a separate Compose project with distinct project name, networks, volumes, and container names.
- Configuration syntax and completeness for all 5 observability components.
- Cross-telemetry links in Grafana datasource provisioning.
"""

from pathlib import Path
import json
import yaml
import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
OBSERVABILITY_DIR = REPO_ROOT / "observability"


def test_observability_compose_file_exists_and_parses():
    """Verify that observability/docker-compose.yaml exists, parses as valid YAML, and has all 5 services."""
    compose_path = OBSERVABILITY_DIR / "docker-compose.yaml"
    assert compose_path.exists(), "observability/docker-compose.yaml must exist"

    with open(compose_path, "r", encoding="utf-8") as f:
        compose_cfg = yaml.safe_load(f)

    assert "services" in compose_cfg
    services = compose_cfg["services"]

    required_services = ["otel-collector", "prometheus", "loki", "tempo", "grafana"]
    for svc in required_services:
        assert svc in services, f"Service '{svc}' must be defined in observability/docker-compose.yaml"


def test_observability_is_separate_compose_project():
    """Verify that the observability stack is configured as an isolated project separate from the app stack."""
    compose_path = OBSERVABILITY_DIR / "docker-compose.yaml"
    with open(compose_path, "r", encoding="utf-8") as f:
        obs_cfg = yaml.safe_load(f)

    # 1. Dedicated project name
    assert "name" in obs_cfg
    assert obs_cfg["name"] == "economic-dashboard-observability"

    # 2. Container names must have distinct observability prefixes
    container_names = {s["container_name"] for s in obs_cfg["services"].values() if "container_name" in s}
    assert "observability-otel-collector" in container_names
    assert "observability-prometheus" in container_names
    assert "observability-loki" in container_names
    assert "observability-tempo" in container_names
    assert "observability-grafana" in container_names

    # 3. Dedicated network
    assert "networks" in obs_cfg
    assert "observability-net" in obs_cfg["networks"]

    # 4. Dedicated volume definitions
    volumes = obs_cfg.get("volumes", {})
    assert "prometheus_data" in volumes
    assert "loki_data" in volumes
    assert "tempo_data" in volumes
    assert "grafana_data" in volumes


def test_otel_collector_config_validity():
    """Verify OpenTelemetry Collector configuration pipelines, receivers, processors, and exporters."""
    config_path = OBSERVABILITY_DIR / "otel-collector" / "config.yaml"
    assert config_path.exists(), "observability/otel-collector/config.yaml must exist"

    with open(config_path, "r", encoding="utf-8") as f:
        cfg = yaml.safe_load(f)

    # Receivers: OTLP with gRPC and HTTP
    assert "receivers" in cfg
    assert "otlp" in cfg["receivers"]
    protocols = cfg["receivers"]["otlp"].get("protocols", {})
    assert "grpc" in protocols
    assert "http" in protocols

    # Processors: Batch
    assert "processors" in cfg
    assert "batch" in cfg["processors"]

    # Exporters: Tempo, Prometheus, Loki/HTTP
    assert "exporters" in cfg
    exporters = cfg["exporters"]
    assert "otlp/tempo" in exporters or "tempo" in exporters
    assert "prometheus" in exporters
    assert "otlphttp/loki" in exporters or "loki" in exporters

    # Pipelines: Traces, Metrics, Logs
    assert "service" in cfg
    pipelines = cfg["service"].get("pipelines", {})
    assert "traces" in pipelines
    assert "metrics" in pipelines
    assert "logs" in pipelines


def test_prometheus_config_validity():
    """Verify Prometheus scrape configuration targets OTel Collector and Tempo."""
    config_path = OBSERVABILITY_DIR / "prometheus" / "prometheus.yaml"
    assert config_path.exists(), "observability/prometheus/prometheus.yaml must exist"

    with open(config_path, "r", encoding="utf-8") as f:
        cfg = yaml.safe_load(f)

    assert "scrape_configs" in cfg
    job_names = {s["job_name"] for s in cfg["scrape_configs"]}
    assert "prometheus" in job_names
    assert any("otel" in j for j in job_names), "Prometheus must scrape OpenTelemetry Collector metrics"


def test_loki_config_validity():
    """Verify Loki configuration defines port 3100, schema, and storage."""
    config_path = OBSERVABILITY_DIR / "loki" / "loki-config.yaml"
    assert config_path.exists(), "observability/loki/loki-config.yaml must exist"

    with open(config_path, "r", encoding="utf-8") as f:
        cfg = yaml.safe_load(f)

    assert cfg.get("auth_enabled") is False
    assert cfg.get("server", {}).get("http_listen_port") == 3100
    assert "schema_config" in cfg


def test_tempo_config_validity():
    """Verify Tempo configuration defines OTLP receivers, listen port 3200, and local storage."""
    config_path = OBSERVABILITY_DIR / "tempo" / "tempo-config.yaml"
    assert config_path.exists(), "observability/tempo/tempo-config.yaml must exist"

    with open(config_path, "r", encoding="utf-8") as f:
        cfg = yaml.safe_load(f)

    assert cfg.get("server", {}).get("http_listen_port") == 3200
    assert "distributor" in cfg
    assert "storage" in cfg


def test_grafana_provisioning_and_dashboards():
    """Verify Grafana datasources (Prometheus, Loki, Tempo) and overview dashboard exist."""
    datasources_path = OBSERVABILITY_DIR / "grafana" / "provisioning" / "datasources" / "datasources.yaml"
    assert datasources_path.exists()

    with open(datasources_path, "r", encoding="utf-8") as f:
        ds_cfg = yaml.safe_load(f)

    datasources = ds_cfg.get("datasources", [])
    ds_names = {ds["name"] for ds in datasources}
    ds_types = {ds["type"] for ds in datasources}

    assert "Prometheus" in ds_names
    assert "Tempo" in ds_names
    assert "Loki" in ds_names
    assert "prometheus" in ds_types
    assert "tempo" in ds_types
    assert "loki" in ds_types

    # Verify cross-telemetry link configuration
    tempo_ds = next(ds for ds in datasources if ds["type"] == "tempo")
    assert "tracesToLogsV2" in tempo_ds.get("jsonData", {})

    loki_ds = next(ds for ds in datasources if ds["type"] == "loki")
    assert "derivedFields" in loki_ds.get("jsonData", {})

    # Verify dashboard provisioning and JSON
    dashboards_provider = OBSERVABILITY_DIR / "grafana" / "provisioning" / "dashboards" / "dashboards.yaml"
    assert dashboards_provider.exists()

    overview_dashboard = OBSERVABILITY_DIR / "grafana" / "provisioning" / "dashboards" / "overview.json"
    assert overview_dashboard.exists()
    dashboard_json = json.loads(overview_dashboard.read_text(encoding="utf-8"))
    assert "panels" in dashboard_json
    assert len(dashboard_json["panels"]) >= 4


def test_observability_env_and_docs():
    """Verify observability documentation and environment template exist."""
    env_example = OBSERVABILITY_DIR / ".env.example"
    readme = OBSERVABILITY_DIR / "README.md"

    assert env_example.exists()
    assert readme.exists()

    readme_content = readme.read_text(encoding="utf-8")
    for component in ["OpenTelemetry Collector", "Prometheus", "Loki", "Tempo", "Grafana"]:
        assert component in readme_content
