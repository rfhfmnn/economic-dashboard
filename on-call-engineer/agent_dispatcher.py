"""
Headless Coding Agent Dispatcher.

Constructs comprehensive incident context from firing alerts and dispatches
a headless coding agent to investigate, diagnose, and mitigate the issue.
"""

import json
import logging
import os
import shutil
import subprocess
import tempfile
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

try:
    from .poller import AlertItem
except (ImportError, ValueError):
    from poller import AlertItem

logger = logging.getLogger("on_call_engineer.dispatcher")


@dataclass
class DispatchResult:
    """Result of dispatching a headless coding agent for an alert."""

    fingerprint: str
    alertname: str
    service: str
    prompt_file: str
    command_executed: str
    success: bool
    exit_code: int
    output: str
    error: str
    duration_seconds: float
    dispatched_at: str


class HeadlessAgentDispatcher:
    """Formats alert payloads into diagnostic prompts and dispatches headless coding agents."""

    def __init__(
        self,
        agent_cmd_template: str = 'agy --dangerously-skip-permissions --print "{prompt_file}"',
        agent_timeout_seconds: int = 300,
        workspace_dir: Optional[str] = None,
        dry_run: bool = False,
        incidents_dir: Optional[str] = None,
    ):
        self.agent_cmd_template = agent_cmd_template
        self.agent_timeout_seconds = agent_timeout_seconds
        self.workspace_dir = workspace_dir or os.getcwd()
        self.dry_run = dry_run

        if incidents_dir:
            self.incidents_dir = Path(incidents_dir)
        else:
            self.incidents_dir = Path(self.workspace_dir) / "on-call-engineer" / "incidents"
        self.incidents_dir.mkdir(parents=True, exist_ok=True)

    def build_agent_prompt(self, alert: AlertItem) -> str:
        """
        Generate a detailed, actionable prompt for the headless coding agent.
        """
        prompt = f"""# [ON-CALL INCIDENT ALERT] {alert.severity.upper()}: {alert.alertname} on {alert.service}

## 1. Incident Telemetry & Diagnostic Context
- **Alert Name:** {alert.alertname}
- **Severity Level:** {alert.severity}
- **Target Service:** {alert.service}
- **Deployment Environment:** {alert.environment}
- **Deployed Version:** {alert.deployed_version}
- **External Provider:** {alert.provider}
- **Service Owner:** {alert.owner}
- **Triggered Value:** {alert.value}
- **Alert Active Since:** {alert.active_at}
- **Alert Fingerprint:** {alert.fingerprint}

## 2. Incident Summary & Impact
**Summary:** {alert.summary}

**Description:**
{alert.description}

## 3. Prescribed Runbook & Triage Actions
{alert.action if alert.action else "Inspect external API client logs, connection timeouts, SSL context, and fallback activation."}

- **Observability Dashboard:** {alert.dashboard_url if alert.dashboard_url else "http://localhost:3000"}
- **Runbook Documentation:** {alert.runbook_url if alert.runbook_url else "observability/README.md#incident-response-api-failures"}

## 4. Relevant Codebase References
The following files in the repository relate directly to this alert:
- External API Clients:
  - `backend/app/clients/bcra_client.py` (BCRA API integration & SSL handling)
  - `backend/app/clients/fx_client.py` (DolarApi integration)
  - `backend/app/clients/rem_client.py` (Market Expectations REM integration)
  - `backend/app/clients/mock_data.py` (Synthetic offline fallback datasets)
- Telemetry & Metrics:
  - `backend/app/metrics.py` (OTel metrics & counter instrumentation)
  - `observability/prometheus/alert_rules.yaml` (Prometheus alerting thresholds)
- Test Suites:
  - `backend/tests/test_bcra_client.py`
  - `backend/tests/test_fx_client.py`
  - `backend/tests/test_application_metrics.py`

## 5. Objectives for Headless Coding Agent
You are acting as the automated On-Call Engineer. Please execute the following steps:
1. **Analyze Root Cause:** Review the alert metadata and code paths related to provider `{alert.provider}` on service `{alert.service}`.
2. **Diagnose Failures:** Check if timeouts, SSL certificate rejection, schema drift, or external network reachability are causing API errors.
3. **Verify Resilience & Fallback:** Confirm that synthetic mock data fallback and local cache (SQLite) are properly protecting end-user requests from failure.
4. **Implement or Propose Mitigation:** If this is caused by a code bug, missing retry, or configuration drift, apply the fix and run relevant tests (`pytest backend/tests/`).
5. **Output Postmortem Summary:** Conclude with a clear root cause summary, actions taken, and verification results.
"""
        return prompt.strip()

    def dispatch(self, alert: AlertItem) -> DispatchResult:
        """
        Write the prompt to an incident log file and invoke the headless coding agent.

        Args:
            alert: The firing AlertItem.

        Returns:
            DispatchResult containing execution status and output.
        """
        dispatched_at = datetime.now(timezone.utc).isoformat()
        timestamp_str = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        prompt_content = self.build_agent_prompt(alert)

        # Save prompt to incident archive file
        filename = f"incident_{timestamp_str}_{alert.alertname}_{alert.fingerprint}.md"
        prompt_file_path = self.incidents_dir / filename
        with open(prompt_file_path, "w", encoding="utf-8") as f:
            f.write(prompt_content)

        logger.info(
            "Prepared on-call incident dossier for alert '%s' at: %s",
            alert.alertname,
            prompt_file_path,
        )

        # Resolve command template
        cmd_str = self.agent_cmd_template.replace("{prompt_file}", str(prompt_file_path))

        if self.dry_run:
            logger.info("[DRY RUN] Would execute headless agent command: %s", cmd_str)
            simulated_output = (
                f"[SIMULATED HEADLESS AGENT RUN]\n"
                f"Alert: {alert.alertname} ({alert.severity})\n"
                f"Service: {alert.service} ({alert.environment})\n"
                f"Provider: {alert.provider}\n"
                f"Action taken: Automated root-cause triage simulated successfully."
            )
            return DispatchResult(
                fingerprint=alert.fingerprint,
                alertname=alert.alertname,
                service=alert.service,
                prompt_file=str(prompt_file_path),
                command_executed=cmd_str,
                success=True,
                exit_code=0,
                output=simulated_output,
                error="",
                duration_seconds=0.01,
                dispatched_at=dispatched_at,
            )

        start_time = time.time()
        try:
            logger.info("Spawning headless coding agent with command: %s", cmd_str)
            proc = subprocess.run(
                cmd_str,
                shell=True,
                cwd=self.workspace_dir,
                capture_output=True,
                text=True,
                timeout=self.agent_timeout_seconds,
            )
            duration = time.time() - start_time
            success = proc.returncode == 0
            if success:
                logger.info(
                    "Headless coding agent successfully completed investigation for alert '%s' in %.2fs",
                    alert.alertname,
                    duration,
                )
            else:
                logger.error(
                    "Headless coding agent exited with code %d: %s",
                    proc.returncode,
                    proc.stderr.strip(),
                )

            return DispatchResult(
                fingerprint=alert.fingerprint,
                alertname=alert.alertname,
                service=alert.service,
                prompt_file=str(prompt_file_path),
                command_executed=cmd_str,
                success=success,
                exit_code=proc.returncode,
                output=proc.stdout,
                error=proc.stderr,
                duration_seconds=duration,
                dispatched_at=dispatched_at,
            )

        except subprocess.TimeoutExpired as exc:
            duration = time.time() - start_time
            logger.error(
                "Headless coding agent timed out after %ds for alert '%s'",
                self.agent_timeout_seconds,
                alert.alertname,
            )
            return DispatchResult(
                fingerprint=alert.fingerprint,
                alertname=alert.alertname,
                service=alert.service,
                prompt_file=str(prompt_file_path),
                command_executed=cmd_str,
                success=False,
                exit_code=-1,
                output=exc.stdout or "" if hasattr(exc, "stdout") else "",
                error=f"Agent execution timed out after {self.agent_timeout_seconds} seconds.",
                duration_seconds=duration,
                dispatched_at=dispatched_at,
            )
        except Exception as exc:
            duration = time.time() - start_time
            logger.exception("Failed to dispatch headless coding agent: %s", exc)
            return DispatchResult(
                fingerprint=alert.fingerprint,
                alertname=alert.alertname,
                service=alert.service,
                prompt_file=str(prompt_file_path),
                command_executed=cmd_str,
                success=False,
                exit_code=-2,
                output="",
                error=str(exc),
                duration_seconds=duration,
                dispatched_at=dispatched_at,
            )
