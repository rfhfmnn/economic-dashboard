"""
Configuration settings for the On-Call Engineer alert monitor.
"""

import os
from dataclasses import dataclass
from typing import Optional


@dataclass
class OnCallConfig:
    """Configuration options for alert polling and headless agent invocation."""

    # Observability alerts endpoint (Prometheus alerts API or proxy)
    alert_api_url: str = os.getenv(
        "ALERT_API_URL", "http://localhost:9090/api/v1/alerts"
    )

    # Polling interval in seconds (default: 60s = 1 minute)
    poll_interval_seconds: int = int(os.getenv("POLL_INTERVAL_SECONDS", "60"))

    # Headless coding agent command template.
    # Default uses 'agy --dangerously-skip-permissions --print "{prompt_file}"'
    # Can also be set to 'agy -p "{prompt_file}"' or custom script/executable.
    agent_cmd: str = os.getenv(
        "HEADLESS_AGENT_CMD",
        'agy --dangerously-skip-permissions --print "{prompt_file}"',
    )

    # Agent execution timeout in seconds
    agent_timeout_seconds: int = int(os.getenv("AGENT_TIMEOUT_SECONDS", "300"))

    # Cooldown in seconds before re-dispatching an agent for the exact same active alert
    # Prevents spawning redundant agents every minute while an incident is under active triage
    cooldown_seconds: int = int(os.getenv("ALERT_COOLDOWN_SECONDS", "300"))

    # Dry-run mode: formats prompt and simulates agent execution without spawning external process
    dry_run: bool = os.getenv("DRY_RUN", "false").lower() in ("true", "1", "yes")

    # Logging level
    log_level: str = os.getenv("LOG_LEVEL", "INFO").upper()

    # Workspace directory path for incident resolution
    workspace_dir: str = os.getenv(
        "WORKSPACE_DIR",
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..")),
    )


def get_default_config() -> OnCallConfig:
    """Return an OnCallConfig instance loaded from environment variables."""
    return OnCallConfig()
