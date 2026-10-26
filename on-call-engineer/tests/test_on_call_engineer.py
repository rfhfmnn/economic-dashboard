"""
Unit and integration tests for the On-Call Engineer alert monitor and agent dispatcher.
"""

import http.server
import json
import os
import sys
import threading
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# Ensure parent and on-call-engineer directory are importable
CURRENT_DIR = Path(__file__).resolve().parent
ON_CALL_DIR = CURRENT_DIR.parent
WORKSPACE_DIR = ON_CALL_DIR.parent

if str(ON_CALL_DIR) not in sys.path:
    sys.path.insert(0, str(ON_CALL_DIR))
if str(WORKSPACE_DIR) not in sys.path:
    sys.path.insert(0, str(WORKSPACE_DIR))

from agent_dispatcher import DispatchResult, HeadlessAgentDispatcher
from config import OnCallConfig
from monitor import OnCallMonitor
from poller import AlertItem, ObservabilityAlertPoller


SAMPLE_PROMETHEUS_RESPONSE = {
    "status": "success",
    "data": {
        "alerts": [
            {
                "labels": {
                    "alertname": "HighAPIFailureRate",
                    "severity": "critical",
                    "service": "economic-dashboard-backend-prod",
                    "service_name": "economic-dashboard-backend-prod",
                    "environment": "production",
                    "deployed_version": "0.1.0",
                    "provider": "bcra",
                    "owner": "financial-data-platform-team",
                },
                "annotations": {
                    "summary": "High API failure rate on economic-dashboard-backend-prod (bcra)",
                    "description": "Outbound API failure rate for provider 'bcra' on service 'economic-dashboard-backend-prod' is 18.50% over the last 5 minutes.",
                    "service": "economic-dashboard-backend-prod",
                    "environment": "production",
                    "deployed_version": "0.1.0",
                    "owner": "financial-data-platform-team",
                    "dashboard_url": "http://localhost:3000/d/economic-dashboard-overview?var-environment=production&var-deployed_version=0.1.0",
                    "action": "1. Inspect upstream financial provider status (BCRA). 2. Check Loki logs. 3. Validate SSL.",
                    "runbook_url": "https://github.com/rfhfmnn/economic-dashboard/blob/master/observability/README.md#incident-response-api-failures",
                },
                "state": "firing",
                "activeAt": "2026-10-26T14:15:00.000Z",
                "value": "1.85e+01",
            },
            {
                "labels": {
                    "alertname": "APIFallbackActivationHigh",
                    "severity": "warning",
                    "service": "economic-dashboard-backend-prod",
                    "environment": "production",
                    "deployed_version": "0.1.0",
                    "provider": "dolarapi",
                },
                "annotations": {
                    "summary": "High synthetic fallback activation rate for dolarapi",
                },
                "state": "pending",  # Pending should NOT be treated as firing
                "activeAt": "2026-10-26T14:18:00.000Z",
                "value": "0.02",
            },
        ]
    }
}


class MockAlertServerHandler(http.server.BaseHTTPRequestHandler):
    """Simple in-memory HTTP server returning mock Prometheus alerts."""

    response_payload = SAMPLE_PROMETHEUS_RESPONSE

    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(self.response_payload).encode("utf-8"))

    def log_message(self, format, *args):
        # Suppress standard logging during pytest runs
        pass


@pytest.fixture
def mock_alert_server():
    """Fixture providing a temporary live local HTTP server serving mock alerts."""
    server = http.server.HTTPServer(("127.0.0.1", 0), MockAlertServerHandler)
    port = server.server_port
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{port}/api/v1/alerts"
    server.shutdown()
    server.server_close()


def test_poller_parses_firing_alerts_and_ignores_pending(mock_alert_server):
    """Verify poller parses firing alerts with full metadata and ignores pending alerts."""
    poller = ObservabilityAlertPoller(alert_api_url=mock_alert_server)
    firing = poller.get_firing_alerts()

    assert len(firing) == 1
    alert = firing[0]

    assert alert.alertname == "HighAPIFailureRate"
    assert alert.severity == "critical"
    assert alert.state == "firing"
    assert alert.service == "economic-dashboard-backend-prod"
    assert alert.environment == "production"
    assert alert.deployed_version == "0.1.0"
    assert alert.provider == "bcra"
    assert alert.owner == "financial-data-platform-team"
    assert "18.50%" in alert.description
    assert "http://localhost:3000" in alert.dashboard_url
    assert "Inspect upstream" in alert.action
    assert len(alert.fingerprint) > 0


def test_poller_handles_empty_alerts():
    """Verify poller gracefully handles empty alert lists or non-200 responses."""
    poller = ObservabilityAlertPoller(alert_api_url="http://127.0.0.1:59999/invalid")
    firing = poller.get_firing_alerts()
    assert firing == []


def test_agent_dispatcher_build_prompt(tmp_path):
    """Verify generated prompt for coding agent contains complete diagnostic and codebase context."""
    dispatcher = HeadlessAgentDispatcher(
        workspace_dir=str(WORKSPACE_DIR),
        incidents_dir=str(tmp_path / "incidents"),
        dry_run=True,
    )

    alert = AlertItem(
        fingerprint="test_fp_123",
        alertname="CriticalAPIFailureRate",
        state="firing",
        severity="page",
        service="economic-dashboard-backend-prod",
        environment="production",
        deployed_version="0.1.0",
        provider="bcra",
        owner="financial-data-platform-team",
        summary="Severe API outage on BCRA",
        description="Over 50% outbound requests failed.",
        action="1. Check BCRA status. 2. Verify fallback.",
        dashboard_url="http://localhost:3000/d/overview",
        runbook_url="https://github.com/runbook",
        active_at="2026-10-26T14:00:00Z",
        value="55.2",
    )

    prompt = dispatcher.build_agent_prompt(alert)

    assert "[ON-CALL INCIDENT ALERT] PAGE: CriticalAPIFailureRate on economic-dashboard-backend-prod" in prompt
    assert "Target Service:** economic-dashboard-backend-prod" in prompt
    assert "External Provider:** bcra" in prompt
    assert "Severe API outage on BCRA" in prompt
    assert "backend/app/clients/bcra_client.py" in prompt
    assert "backend/app/clients/mock_data.py" in prompt
    assert "Objectives for Headless Coding Agent" in prompt


def test_agent_dispatcher_dry_run_dispatch(tmp_path):
    """Verify dry-run dispatch archives prompt file and returns successful DispatchResult without subprocess."""
    incidents_dir = tmp_path / "incidents"
    dispatcher = HeadlessAgentDispatcher(
        workspace_dir=str(WORKSPACE_DIR),
        incidents_dir=str(incidents_dir),
        dry_run=True,
    )

    alert = AlertItem(
        fingerprint="fp_abc_456",
        alertname="HighAPIFailureRate",
        state="firing",
        severity="critical",
        service="economic-dashboard-backend-prod",
        environment="production",
        deployed_version="0.1.0",
        provider="bcra",
        owner="financial-data-platform-team",
        summary="High API failure rate",
        description="Failing requests",
        action="Check logs",
        dashboard_url="http://localhost:3000",
        runbook_url="http://runbook",
        active_at="2026-10-26T14:15:00Z",
        value="12.0",
    )

    result = dispatcher.dispatch(alert)

    assert result.success is True
    assert result.exit_code == 0
    assert result.alertname == "HighAPIFailureRate"
    assert result.service == "economic-dashboard-backend-prod"
    assert Path(result.prompt_file).exists()
    assert "[SIMULATED HEADLESS AGENT RUN]" in result.output


def test_monitor_deduplication_and_cooldown(mock_alert_server, tmp_path):
    """Verify monitor does not re-dispatch agent for identical alert within cooldown period."""
    config = OnCallConfig(
        alert_api_url=mock_alert_server,
        poll_interval_seconds=60,
        cooldown_seconds=300,
        dry_run=True,
    )
    dispatcher = HeadlessAgentDispatcher(
        workspace_dir=str(WORKSPACE_DIR),
        incidents_dir=str(tmp_path / "incidents"),
        dry_run=True,
    )
    monitor = OnCallMonitor(config=config, dispatcher=dispatcher)

    # First poll cycle: alert fires and triggers dispatch
    results1 = monitor.poll_once()
    assert len(results1) == 1
    assert results1[0].alertname == "HighAPIFailureRate"

    # Second poll cycle immediately after: alert is in cooldown, no new dispatch
    results2 = monitor.poll_once()
    assert len(results2) == 0


def test_monitor_clears_resolved_alerts(mock_alert_server, tmp_path):
    """Verify monitor purges active dispatch tracker when an alert resolves."""
    config = OnCallConfig(
        alert_api_url=mock_alert_server,
        poll_interval_seconds=60,
        cooldown_seconds=300,
        dry_run=True,
    )
    dispatcher = HeadlessAgentDispatcher(
        workspace_dir=str(WORKSPACE_DIR),
        incidents_dir=str(tmp_path / "incidents"),
        dry_run=True,
    )
    monitor = OnCallMonitor(config=config, dispatcher=dispatcher)

    # Trigger alert
    results1 = monitor.poll_once()
    assert len(results1) == 1
    assert len(monitor.active_dispatches) == 1

    # Simulate resolved alerts by changing Mock handler payload
    MockAlertServerHandler.response_payload = {
        "status": "success",
        "data": {"alerts": []},
    }

    results2 = monitor.poll_once()
    assert len(results2) == 0
    assert len(monitor.active_dispatches) == 0

    # Reset mock payload for other tests
    MockAlertServerHandler.response_payload = SAMPLE_PROMETHEUS_RESPONSE


def test_dispatcher_real_subprocess_execution(tmp_path):
    """Verify dispatcher executes configured command template and captures output."""
    incidents_dir = tmp_path / "incidents"
    # Use python to simulate an agent command reading the prompt file
    cmd_template = f'python -c "import sys; print(\'Agent Received Prompt File:\', sys.argv[1])" "{{prompt_file}}"'

    dispatcher = HeadlessAgentDispatcher(
        agent_cmd_template=cmd_template,
        workspace_dir=str(WORKSPACE_DIR),
        incidents_dir=str(incidents_dir),
        dry_run=False,
    )

    alert = AlertItem(
        fingerprint="test_exec_999",
        alertname="CriticalAPIFailureRate",
        state="firing",
        severity="page",
        service="economic-dashboard-backend-prod",
        environment="production",
        deployed_version="0.1.0",
        provider="bcra",
        owner="financial-data-platform-team",
        summary="Test execution",
        description="Test description",
        action="Take action",
        dashboard_url="http://dashboard",
        runbook_url="http://runbook",
        active_at="2026-10-26T14:00:00Z",
        value="99.9",
    )

    result = dispatcher.dispatch(alert)
    assert result.success is True
    assert result.exit_code == 0
    assert "Agent Received Prompt File:" in result.output
