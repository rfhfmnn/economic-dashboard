@echo off
REM ==============================================================================
REM Economic & Credit Risk Dashboard (BCRA) - Windows Batch Execution Script
REM Starts both FastAPI Backend (port 8000) and Vite Frontend (port 5173)
REM ==============================================================================

cd /d "%~dp0"
echo ==========================================================
echo  Starting BCRA Economic ^& Credit Risk Dashboard
echo ==========================================================

REM 1. Check frontend dependencies
if not exist "frontend\node_modules" (
    echo Installing frontend dependencies...
    call npm --prefix frontend install
)

REM 2. Start Backend in separate window
echo [1/2] Starting Backend at http://localhost:8000...
start "BCRA Backend (FastAPI)" python -m uvicorn backend.app.main:app --reload --port 8000

REM 3. Start Frontend in this window
echo [2/2] Starting Frontend at http://localhost:5173...
echo.
echo Both services starting. Press Ctrl+C in either window to stop.
echo Frontend: http://localhost:5173
echo Backend:  http://localhost:8000
echo.
call npm --prefix frontend run dev
