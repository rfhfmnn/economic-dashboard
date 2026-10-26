@echo off
REM On-Call Engineer: Polls observability alert API every minute and triggers headless coding agent on alerts.

setlocal enabledelayedexpansion
set "SCRIPT_DIR=%~dp0"
set "WORKSPACE_ROOT=%SCRIPT_DIR%.."

set "PYTHONPATH=%WORKSPACE_ROOT%;%PYTHONPATH%"

echo ==========================================================
echo  Starting On-Call Engineer Alert Monitor (Windows)
echo  Workspace: %WORKSPACE_ROOT%
echo  Default Alert API: %ALERT_API_URL%
echo  Polling Interval: %POLL_INTERVAL_SECONDS%s
echo ==========================================================

python "%SCRIPT_DIR%monitor.py" %*

endlocal
