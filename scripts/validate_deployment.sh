#!/usr/bin/env bash
# ==============================================================================
# Health Endpoint Validation Script for Render Deployment
# Usage: ./scripts/validate_deployment.sh <BASE_URL> [TIMEOUT_SECONDS]
# Example: ./scripts/validate_deployment.sh https://economic-dashboard.onrender.com 300
# ==============================================================================

set -euo pipefail

BASE_URL="${1:-${RENDER_APP_URL:-http://localhost:8000}}"
TIMEOUT_SECONDS="${2:-300}"
INTERVAL_SECONDS=10
MAX_ATTEMPTS=$((TIMEOUT_SECONDS / INTERVAL_SECONDS))

# Strip trailing slash
BASE_URL="${BASE_URL%/}"
HEALTH_URL="${BASE_URL}/health"
DEEP_HEALTH_URL="${BASE_URL}/api/system/health"

echo "=========================================================="
echo " Starting Deployment Health Validation"
echo " Target URL:       ${HEALTH_URL}"
echo " Max Timeout:      ${TIMEOUT_SECONDS}s (${MAX_ATTEMPTS} attempts, ${INTERVAL_SECONDS}s interval)"
echo "=========================================================="

ATTEMPT=1
SUCCESS=0

while [ "$ATTEMPT" -le "$MAX_ATTEMPTS" ]; do
    echo -n "Attempt ${ATTEMPT}/${MAX_ATTEMPTS}: Probing ${HEALTH_URL} ... "
    
    RESPONSE_FILE=$(mktemp)
    HTTP_CODE=$(curl -s -m 10 -w "%{http_code}" -o "$RESPONSE_FILE" "$HEALTH_URL" 2>/dev/null || echo "000")
    
    if [ "$HTTP_CODE" = "200" ]; then
        if grep -q '"status"[[:space:]]*:[[:space:]]*"ok"' "$RESPONSE_FILE"; then
            echo " [HTTP 200 OK]"
            echo "----------------------------------------------------------"
            echo " Response Payload:"
            cat "$RESPONSE_FILE"
            echo ""
            echo "----------------------------------------------------------"
            rm -f "$RESPONSE_FILE"
            SUCCESS=1
            break
        else
            echo " [HTTP 200 but unexpected body: $(cat "$RESPONSE_FILE")]"
        fi
    elif [ "$HTTP_CODE" = "000" ]; then
        echo " [Connection failed / DNS pending / TLS handshake in progress]"
    else
        echo " [HTTP ${HTTP_CODE}] Waiting for container boot..."
    fi
    
    rm -f "$RESPONSE_FILE"
    ATTEMPT=$((ATTEMPT + 1))
    
    if [ "$ATTEMPT" -le "$MAX_ATTEMPTS" ]; then
        sleep "$INTERVAL_SECONDS"
    fi
done

if [ "$SUCCESS" -ne 1 ]; then
    echo "=========================================================="
    echo "❌ Deployment Health Check FAILED after ${TIMEOUT_SECONDS}s"
    echo "Could not reach healthy /health endpoint at ${HEALTH_URL}"
    echo "=========================================================="
    exit 1
fi

echo "=========================================================="
echo "✅ Primary health probe succeeded!"
echo "Now probing deep system health: ${DEEP_HEALTH_URL}..."
echo "=========================================================="

SYS_FILE=$(mktemp)
SYS_HTTP=$(curl -s -m 15 -w "%{http_code}" -o "$SYS_FILE" "$DEEP_HEALTH_URL" 2>/dev/null || echo "000")

if [ "$SYS_HTTP" = "200" ]; then
    echo "✅ Deep system health check: [HTTP 200 OK]"
    cat "$SYS_FILE"
    echo ""
else
    echo "⚠️ Deep system health returned HTTP ${SYS_HTTP} (primary /health is operational)"
    cat "$SYS_FILE" 2>/dev/null || true
    echo ""
fi
rm -f "$SYS_FILE"

echo "=========================================================="
echo "🎉 Deployment successfully validated!"
echo "=========================================================="
exit 0
