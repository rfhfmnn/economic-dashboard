#!/usr/bin/env bash
# On-Call Engineer: Polls observability alert API every minute and triggers headless coding agent on alerts.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

export PYTHONPATH="${WORKSPACE_ROOT}:${PYTHONPATH:-}"

echo "=========================================================="
echo " Starting On-Call Engineer Alert Monitor"
echo " Workspace: ${WORKSPACE_ROOT}"
echo " Default Alert API: ${ALERT_API_URL:-http://localhost:9090/api/v1/alerts}"
echo " Polling Interval: ${POLL_INTERVAL_SECONDS:-60}s"
echo "=========================================================="

python3 "${SCRIPT_DIR}/monitor.py" "$@"
