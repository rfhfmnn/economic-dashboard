#!/usr/bin/env bash
# ==============================================================================
# Economic & Credit Risk Dashboard (BCRA) - Execution Script
# Starts both FastAPI Backend (port 8000) and Vite Frontend (port 5173)
# ==============================================================================

set -e

# Resolve directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=========================================================="
echo " Starting BCRA Economic & Credit Risk Dashboard"
echo "=========================================================="

# 1. Activate virtual environment if present
if [ -d "$SCRIPT_DIR/.venv" ]; then
    if [ -f "$SCRIPT_DIR/.venv/Scripts/activate" ]; then
        source "$SCRIPT_DIR/.venv/Scripts/activate"
    elif [ -f "$SCRIPT_DIR/.venv/bin/activate" ]; then
        source "$SCRIPT_DIR/.venv/bin/activate"
    fi
fi

# 2. Detect working Python interpreter (checks for uvicorn/fastapi support)
PYTHON_CMD=""
for candidate in python.exe python3 python; do
    if command -v "$candidate" &> /dev/null; then
        if "$candidate" -c "import uvicorn" &> /dev/null; then
            PYTHON_CMD="$candidate"
            break
        fi
    fi
done

if [ -z "$PYTHON_CMD" ]; then
    if command -v python3 &> /dev/null; then
        PYTHON_CMD="python3"
    elif command -v python &> /dev/null; then
        PYTHON_CMD="python"
    elif command -v python.exe &> /dev/null; then
        PYTHON_CMD="python.exe"
    else
        echo "❌ Error: Python is not found in PATH."
        exit 1
    fi
fi

echo "🐍 Using Python: $PYTHON_CMD ($($PYTHON_CMD --version 2>&1))"

# 3. Ensure frontend dependencies are installed
if [ ! -d "$SCRIPT_DIR/frontend/node_modules" ]; then
    echo "📦 node_modules not found. Installing frontend dependencies..."
    npm --prefix frontend install
fi

# Subcommand handlers
case "$1" in
    --backend|-b)
        echo "🚀 Starting Backend only at http://localhost:8000..."
        exec $PYTHON_CMD -m uvicorn backend.app.main:app --reload --port 8000
        ;;
    --frontend|-f)
        echo "🚀 Starting Frontend only at http://localhost:5173..."
        exec npm --prefix frontend run dev
        ;;
    --test|-t)
        echo "🧪 Running Backend Tests..."
        $PYTHON_CMD -m pytest backend/tests/ -v
        echo "🧪 Running Frontend Tests..."
        npm --prefix frontend run test
        exit 0
        ;;
esac

# 4. Graceful termination handler for Ctrl+C
cleanup() {
    echo ""
    echo "🛑 Shutting down backend and frontend services..."
    if [ -n "$BACKEND_PID" ] && kill -0 "$BACKEND_PID" 2>/dev/null; then
        kill "$BACKEND_PID" 2>/dev/null || true
    fi
    if [ -n "$FRONTEND_PID" ] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
        kill "$FRONTEND_PID" 2>/dev/null || true
    fi
    exit 0
}

trap cleanup SIGINT SIGTERM EXIT

# 5. Start Backend in background
echo "📡 [1/2] Starting Backend (FastAPI) at http://localhost:8000..."
$PYTHON_CMD -m uvicorn backend.app.main:app --reload --port 8000 &
BACKEND_PID=$!

# Wait briefly for backend to initialize
sleep 2

# 6. Start Frontend in background
echo "💻 [2/2] Starting Frontend (Vite) at http://localhost:5173..."
npm --prefix frontend run dev &
FRONTEND_PID=$!

echo ""
echo "=========================================================="
echo "✅ Both services running successfully:"
echo "   - Frontend UI:  http://localhost:5173"
echo "   - Backend API:  http://localhost:8000"
echo "   - API Docs:     http://localhost:8000/docs"
echo "   Press Ctrl+C to stop both servers."
echo "=========================================================="
echo ""

# Wait for background jobs
wait $FRONTEND_PID $BACKEND_PID
