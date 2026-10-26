"""Automated verification tests for development and production infrastructure configurations.

Validates:
- Docker Compose dev vs. prod isolation (independent containers, networks, volumes, ports).
- Render blueprint dev vs. prod definitions (isolated services, databases, branches).
- Environment template files (.env.development.example and .env.production.example).
"""

from pathlib import Path
import yaml
import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent.parent


def test_docker_compose_dev_and_prod_exist_and_parse():
    """Verify that both development and production docker compose files exist and are valid YAML."""
    dev_compose_path = REPO_ROOT / "docker-compose.yaml"
    prod_compose_path = REPO_ROOT / "docker-compose.prod.yaml"
    explicit_dev_path = REPO_ROOT / "docker-compose.dev.yaml"

    assert dev_compose_path.exists(), "docker-compose.yaml (dev) must exist"
    assert prod_compose_path.exists(), "docker-compose.prod.yaml (prod) must exist"
    assert explicit_dev_path.exists(), "docker-compose.dev.yaml must exist"

    with open(dev_compose_path, "r", encoding="utf-8") as f:
        dev_config = yaml.safe_load(f)

    with open(prod_compose_path, "r", encoding="utf-8") as f:
        prod_config = yaml.safe_load(f)

    assert "services" in dev_config
    assert "services" in prod_config


def test_docker_compose_isolation_between_dev_and_prod():
    """Verify that production containers, networks, volumes, and ports are independent of dev."""
    dev_path = REPO_ROOT / "docker-compose.yaml"
    prod_path = REPO_ROOT / "docker-compose.prod.yaml"

    with open(dev_path, "r", encoding="utf-8") as f:
        dev_cfg = yaml.safe_load(f)

    with open(prod_path, "r", encoding="utf-8") as f:
        prod_cfg = yaml.safe_load(f)

    # 1. Container names must be distinct
    dev_containers = {s["container_name"] for s in dev_cfg["services"].values() if "container_name" in s}
    prod_containers = {s["container_name"] for s in prod_cfg["services"].values() if "container_name" in s}

    assert not (dev_containers & prod_containers), f"Container names must not overlap! Overlap: {dev_containers & prod_containers}"
    assert "economic-dashboard-postgres-prod" in prod_containers
    assert "economic-dashboard-app-prod" in prod_containers

    # 2. Volume names must be distinct
    dev_volumes = set(dev_cfg.get("volumes", {}).keys())
    prod_volumes = set(prod_cfg.get("volumes", {}).keys())
    assert not (dev_volumes & prod_volumes), f"Volume keys must not overlap! Overlap: {dev_volumes & prod_volumes}"
    assert "postgres_data_prod" in prod_volumes

    # 3. Networks must be distinct
    dev_networks = set(dev_cfg.get("networks", {}).keys())
    prod_networks = set(prod_cfg.get("networks", {}).keys())
    assert not (dev_networks & prod_networks), f"Networks must not overlap! Overlap: {dev_networks & prod_networks}"
    assert "app-network-prod" in prod_networks

    # 4. Production ports must avoid collisions with dev default ports (5432 and 8000)
    prod_ports_str = str(prod_cfg["services"])
    assert "5433" in prod_ports_str, "Production postgres port mapping should default to 5433 to avoid collision with dev 5432"
    assert "8080" in prod_ports_str, "Production app port mapping should default to 8080 to avoid collision with dev 8000"


def test_render_blueprints_multi_environment():
    """Verify render.yaml defines both independent dev and prod services and databases."""
    render_path = REPO_ROOT / "render.yaml"
    assert render_path.exists()

    with open(render_path, "r", encoding="utf-8") as f:
        render_cfg = yaml.safe_load(f)

    services = render_cfg.get("services", [])
    databases = render_cfg.get("databases", [])

    service_names = {s["name"] for s in services}
    database_names = {d["name"] for d in databases}

    # Verify independent dev and prod services
    assert "economic-dashboard-dev" in service_names
    assert "economic-dashboard-prod" in service_names

    # Verify independent dev and prod databases
    assert "economic-dashboard-db-dev" in database_names
    assert "economic-dashboard-db-prod" in database_names

    # Verify production service wires to production database
    prod_svc = next(s for s in services if s["name"] == "economic-dashboard-prod")
    prod_env = {e["key"]: e for e in prod_svc.get("envVars", [])}
    assert "DATABASE_URL" in prod_env
    assert prod_env["DATABASE_URL"]["fromDatabase"]["name"] == "economic-dashboard-db-prod"

    # Verify dev service wires to dev database
    dev_svc = next(s for s in services if s["name"] == "economic-dashboard-dev")
    dev_env = {e["key"]: e for e in dev_svc.get("envVars", [])}
    assert "DATABASE_URL" in dev_env
    assert dev_env["DATABASE_URL"]["fromDatabase"]["name"] == "economic-dashboard-db-dev"


def test_standalone_render_blueprints():
    """Verify standalone render.dev.yaml and render.prod.yaml exist and parse cleanly."""
    dev_blueprint = REPO_ROOT / "render.dev.yaml"
    prod_blueprint = REPO_ROOT / "render.prod.yaml"

    assert dev_blueprint.exists()
    assert prod_blueprint.exists()

    with open(dev_blueprint, "r", encoding="utf-8") as f:
        dev_cfg = yaml.safe_load(f)
    with open(prod_blueprint, "r", encoding="utf-8") as f:
        prod_cfg = yaml.safe_load(f)

    assert dev_cfg["services"][0]["name"] == "economic-dashboard-dev"
    assert dev_cfg["databases"][0]["name"] == "economic-dashboard-db-dev"

    assert prod_cfg["services"][0]["name"] == "economic-dashboard-prod"
    assert prod_cfg["databases"][0]["name"] == "economic-dashboard-db-prod"


def test_env_templates_dev_and_prod():
    """Verify that both .env.development.example and .env.production.example exist and specify distinct configurations."""
    dev_env_file = REPO_ROOT / ".env.development.example"
    prod_env_file = REPO_ROOT / ".env.production.example"

    assert dev_env_file.exists()
    assert prod_env_file.exists()

    dev_text = dev_env_file.read_text(encoding="utf-8")
    prod_text = prod_env_file.read_text(encoding="utf-8")

    assert "POSTGRES_DB=economic_dashboard_dev" in dev_text
    assert "POSTGRES_DB=economic_dashboard_prod" in prod_text
    assert "POSTGRES_PORT=5432" in dev_text
    assert "POSTGRES_PORT=5433" in prod_text
    assert "PORT=8000" in dev_text
    assert "PORT=8080" in prod_text


def test_promote_to_prod_workflow_configuration():
    """Verify that promote-to-prod.yml exists, is valid YAML, and has manual workflow_dispatch triggers."""
    workflow_path = REPO_ROOT / ".github" / "workflows" / "promote-to-prod.yml"
    assert workflow_path.exists(), "promote-to-prod.yml must exist"

    with open(workflow_path, "r", encoding="utf-8") as f:
        wf_cfg = yaml.safe_load(f)

    # Must be triggered manually via workflow_dispatch
    assert True in wf_cfg or "on" in wf_cfg or "workflow_dispatch" in str(wf_cfg)
    on_trigger = wf_cfg.get("on") or wf_cfg.get(True)
    assert "workflow_dispatch" in on_trigger

    inputs = on_trigger["workflow_dispatch"].get("inputs", {})
    assert "source_branch" in inputs
    assert "target_branch" in inputs
    assert "deploy_production" in inputs

    # Verify key jobs exist
    jobs = wf_cfg.get("jobs", {})
    assert "validate-dev-branch" in jobs
    assert "merge-and-promote" in jobs
    assert "deploy-promoted-production" in jobs
