"""
On-Call Engineer Alert Monitor.

Continuously polls the observability alert API every minute (or configured interval).
When an alert fires, extracts its details, prepares the incident context, and
dispatches a headless coding agent to investigate and resolve the issue.
"""

import argparse
import logging
import os
import signal
import sys
import time
from datetime import datetime, timezone
from typing import Dict, List, Optional

# Ensure directory is on sys.path for direct script execution
_current_dir = os.path.dirname(os.path.abspath(__file__))
if _current_dir not in sys.path:
    sys.path.insert(0, _current_dir)

try:
    from .agent_dispatcher import DispatchResult, HeadlessAgentDispatcher
    from .config import OnCallConfig, get_default_config
    from .poller import AlertItem, ObservabilityAlertPoller
except (ImportError, ValueError):
    from agent_dispatcher import DispatchResult, HeadlessAgentDispatcher
    from config import OnCallConfig, get_default_config
    from poller import AlertItem, ObservabilityAlertPoller

logger = logging.getLogger("on_call_engineer.monitor")


class OnCallMonitor:
    """
    Orchestrator that polls the Observability Alert API every minute
    and triggers headless coding agents upon alert firing.
    """

    def __init__(
        self,
        config: Optional[OnCallConfig] = None,
        poller: Optional[ObservabilityAlertPoller] = None,
        dispatcher: Optional[HeadlessAgentDispatcher] = None,
    ):
        self.config = config or get_default_config()
        self.poller = poller or ObservabilityAlertPoller(
            alert_api_url=self.config.alert_api_url
        )
        self.dispatcher = dispatcher or HeadlessAgentDispatcher(
            agent_cmd_template=self.config.agent_cmd,
            agent_timeout_seconds=self.config.agent_timeout_seconds,
            workspace_dir=self.config.workspace_dir,
            dry_run=self.config.dry_run,
        )

        # In-memory tracking of active alerts: fingerprint -> timestamp of last dispatch
        self.active_dispatches: Dict[str, float] = {}
        self._running = False

    def is_in_cooldown(self, fingerprint: str) -> bool:
        """
        Check if an alert fingerprint was dispatched recently and is still in cooldown.
        Prevents dispatching duplicate agents every minute for the same ongoing incident.
        """
        last_dispatch = self.active_dispatches.get(fingerprint)
        if not last_dispatch:
            return False
        elapsed = time.time() - last_dispatch
        return elapsed < self.config.cooldown_seconds

    def poll_once(self) -> List[DispatchResult]:
        """
        Execute a single polling cycle.

        1. Queries alert API for currently firing alerts.
        2. Filters out alerts currently in cooldown.
        3. Dispatches headless coding agent for each new firing alert.
        4. Cleans up stale alert tracking when alerts resolve.

        Returns:
            List of DispatchResults for alerts triggered in this cycle.
        """
        logger.debug("Polling alert API at: %s", self.config.alert_api_url)
        firing_alerts = self.poller.get_firing_alerts()
        results: List[DispatchResult] = []

        current_firing_fingerprints = {a.fingerprint for a in firing_alerts}

        # Evict resolved alerts from tracking
        resolved = [fp for fp in self.active_dispatches if fp not in current_firing_fingerprints]
        for fp in resolved:
            logger.info("Alert '%s' is no longer firing. Cleared from active tracking.", fp)
            del self.active_dispatches[fp]

        if not firing_alerts:
            logger.debug("No firing alerts detected.")
            return results

        logger.info("Detected %d firing alert(s).", len(firing_alerts))

        for alert in firing_alerts:
            if self.is_in_cooldown(alert.fingerprint):
                logger.info(
                    "Alert '%s' [%s] on %s is still in cooldown. Skipping duplicate dispatch.",
                    alert.alertname,
                    alert.severity,
                    alert.service,
                )
                continue

            logger.warning(
                "FIRING ALERT: '%s' (severity: %s, service: %s, provider: %s). Dispatching headless coding agent...",
                alert.alertname,
                alert.severity,
                alert.service,
                alert.provider,
            )

            result = self.dispatcher.dispatch(alert)
            self.active_dispatches[alert.fingerprint] = time.time()
            results.append(result)

        return results

    def run_forever(self) -> None:
        """
        Continuously run the monitor loop, sleeping for poll_interval_seconds between checks.
        """
        self._running = True

        def handle_signal(sig, frame):
            logger.info("Received termination signal (%s). Shutting down on-call monitor...", sig)
            self._running = False

        signal.signal(signal.SIGINT, handle_signal)
        signal.signal(signal.SIGTERM, handle_signal)

        logger.info(
            "Starting On-Call Engineer Monitor. Polling '%s' every %d second(s)...",
            self.config.alert_api_url,
            self.config.poll_interval_seconds,
        )

        while self._running:
            try:
                self.poll_once()
            except Exception as exc:
                logger.exception("Error occurred during poll cycle: %s", exc)

            # Sleep in 1-second increments so signals can break quickly
            for _ in range(self.config.poll_interval_seconds):
                if not self._running:
                    break
                time.sleep(1)

        logger.info("On-Call Engineer Monitor stopped.")


def setup_logging(log_level: str = "INFO") -> None:
    """Configure structured logging."""
    logging.basicConfig(
        level=getattr(logging, log_level.upper(), logging.INFO),
        format="%(asctime)s [%(levelname)s] [%(name)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )


def main() -> None:
    """CLI entrypoint for running the On-Call Engineer Monitor."""
    parser = argparse.ArgumentParser(
        description="On-Call Engineer: Polls observability alert API and dispatches headless coding agent on alerts."
    )
    parser.add_argument(
        "--alert-url",
        default=None,
        help="Observability alert API URL (default: http://localhost:9090/api/v1/alerts)",
    )
    parser.add_argument(
        "--interval",
        type=int,
        default=None,
        help="Poll interval in seconds (default: 60)",
    )
    parser.add_argument(
        "--agent-cmd",
        default=None,
        help="Headless agent command template (e.g. 'agy --dangerously-skip-permissions --print \"{prompt_file}\"')",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Simulate agent dispatch without running external processes",
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="Run a single poll cycle and exit immediately (useful for testing or cron jobs)",
    )
    parser.add_argument(
        "--log-level",
        default=None,
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        help="Set logging verbosity level",
    )

    args = parser.parse_args()

    config = get_default_config()
    if args.alert_url:
        config.alert_api_url = args.alert_url
    if args.interval:
        config.poll_interval_seconds = args.interval
    if args.agent_cmd:
        config.agent_cmd = args.agent_cmd
    if args.dry_run:
        config.dry_run = True
    if args.log_level:
        config.log_level = args.log_level

    setup_logging(config.log_level)

    monitor = OnCallMonitor(config=config)

    if args.once:
        logger.info("Running single on-call poll cycle...")
        results = monitor.poll_once()
        logger.info("Single poll completed. Dispatched %d agent(s).", len(results))
        sys.exit(0)
    else:
        monitor.run_forever()


if __name__ == "__main__":
    main()
