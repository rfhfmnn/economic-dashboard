"""
Observability Alert Poller.

Queries the Prometheus / Observability Alert API, extracts firing alerts,
and structures alert metadata for downstream agent processing.
"""

import hashlib
import json
import logging
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger("on_call_engineer.poller")


@dataclass
class AlertItem:
    """Normalized alert model representing an active observability alert."""

    fingerprint: str
    alertname: str
    state: str
    severity: str
    service: str
    environment: str
    deployed_version: str
    provider: str
    owner: str
    summary: str
    description: str
    action: str
    dashboard_url: str
    runbook_url: str
    active_at: str
    value: str
    raw_labels: Dict[str, str] = field(default_factory=dict)
    raw_annotations: Dict[str, str] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        """Convert alert item to standard dictionary."""
        return {
            "fingerprint": self.fingerprint,
            "alertname": self.alertname,
            "state": self.state,
            "severity": self.severity,
            "service": self.service,
            "environment": self.environment,
            "deployed_version": self.deployed_version,
            "provider": self.provider,
            "owner": self.owner,
            "summary": self.summary,
            "description": self.description,
            "action": self.action,
            "dashboard_url": self.dashboard_url,
            "runbook_url": self.runbook_url,
            "active_at": self.active_at,
            "value": self.value,
        }


class ObservabilityAlertPoller:
    """Client for polling the observability alert API."""

    def __init__(self, alert_api_url: str, request_timeout_seconds: int = 10):
        self.alert_api_url = alert_api_url
        self.request_timeout_seconds = request_timeout_seconds

    def fetch_raw_alerts(self) -> List[Dict[str, Any]]:
        """
        Fetch alerts from the Prometheus / Observability alert API.

        Returns:
            List of raw alert dicts from API response.
        """
        req = urllib.request.Request(
            self.alert_api_url,
            headers={
                "User-Agent": "OnCallEngineer-Monitor/1.0",
                "Accept": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=self.request_timeout_seconds) as response:
                if response.status != 200:
                    logger.warning(
                        "Alert API returned non-200 status code: %s", response.status
                    )
                    return []
                payload = json.loads(response.read().decode("utf-8"))
        except urllib.error.URLError as exc:
            logger.error("Failed to connect to Alert API at %s: %s", self.alert_api_url, exc)
            return []
        except Exception as exc:
            logger.error("Unexpected error fetching alerts from %s: %s", self.alert_api_url, exc)
            return []

        # Standard Prometheus schema: {"status": "success", "data": {"alerts": [...]}}
        if isinstance(payload, dict):
            data = payload.get("data", {})
            if isinstance(data, dict) and "alerts" in data:
                return data.get("alerts", [])
            # Alertmanager schema: [{"labels": {...}, "annotations": {...}, ...}]
            if isinstance(data, list):
                return data
            if "alerts" in payload:
                return payload.get("alerts", [])
        elif isinstance(payload, list):
            return payload

        return []

    def parse_alert(self, raw_alert: Dict[str, Any]) -> AlertItem:
        """
        Normalize raw alert data from Prometheus or Alertmanager format into an AlertItem.
        """
        labels = raw_alert.get("labels", {})
        annotations = raw_alert.get("annotations", {})
        state = raw_alert.get("state", "unknown").lower()

        alertname = labels.get("alertname", raw_alert.get("alertname", "UnknownAlert"))
        severity = labels.get("severity", "warning").lower()
        service = (
            labels.get("service")
            or labels.get("service_name")
            or annotations.get("service", "unknown-service")
        )
        environment = labels.get("environment") or annotations.get("environment", "unknown-env")
        deployed_version = (
            labels.get("deployed_version")
            or annotations.get("deployed_version", "unknown-version")
        )
        provider = labels.get("provider") or annotations.get("provider", "unknown-provider")
        owner = labels.get("owner") or annotations.get("owner", "on-call-team")

        summary = annotations.get("summary") or f"Alert {alertname} fired for {service}"
        description = annotations.get("description", "")
        action = annotations.get("action", "")
        dashboard_url = annotations.get("dashboard_url", "")
        runbook_url = annotations.get("runbook_url", "")
        active_at = raw_alert.get("activeAt") or datetime.now(timezone.utc).isoformat()
        value = str(raw_alert.get("value", ""))

        # Compute deterministic fingerprint based on identity labels
        identity_str = f"{alertname}|{service}|{environment}|{provider}|{deployed_version}"
        fingerprint = hashlib.sha256(identity_str.encode("utf-8")).hexdigest()[:16]

        return AlertItem(
            fingerprint=fingerprint,
            alertname=alertname,
            state=state,
            severity=severity,
            service=service,
            environment=environment,
            deployed_version=deployed_version,
            provider=provider,
            owner=owner,
            summary=summary,
            description=description,
            action=action,
            dashboard_url=dashboard_url,
            runbook_url=runbook_url,
            active_at=active_at,
            value=value,
            raw_labels=labels,
            raw_annotations=annotations,
        )

    def get_firing_alerts(self) -> List[AlertItem]:
        """
        Query the alert API and return only alerts that are currently FIRING.

        Returns:
            List of normalized firing AlertItem instances.
        """
        raw_alerts = self.fetch_raw_alerts()
        firing_alerts: List[AlertItem] = []

        for raw in raw_alerts:
            state = raw.get("state", "").lower()
            # Prometheus /api/v1/alerts marks active firing alerts as state='firing'
            # Alertmanager uses status.state='active' or status={'state': 'active'}
            status = raw.get("status", {})
            is_firing = state == "firing" or (
                isinstance(status, dict) and status.get("state") == "active"
            )

            if is_firing:
                item = self.parse_alert(raw)
                firing_alerts.append(item)

        return firing_alerts
