# Economic & Credit Risk Dashboard (BCRA)

An institutional-grade financial and credit risk intelligence dashboard powered by public data from the **Banco Central de la República Argentina (BCRA)** and complementary financial FX sources (DolarApi).

---

## Architecture Overview

- **Backend:** Python 3.11+, FastAPI, SQLite (SQLAlchemy), HTTPX with custom SSL handling, Pytest.
- **Frontend:** React 18+, Vite, TypeScript, Tailwind CSS, Lucide React, Recharts.
- **Documentation & Standards:** See `_docs/plan.md`, `_docs/tasks.md`, `_docs/design-system.md`, and `_docs/testing-guidelines.md`.

---

## Quick Start & Execution

### 🚀 One-Command Launch (Backend + Frontend)

#### Using Bash (Git Bash / WSL / macOS / Linux):
```bash
./run.sh
```
*Options:*
- `./run.sh` — Launches both FastAPI backend and Vite frontend concurrently.
- `./run.sh --backend` — Starts backend only (`http://localhost:8000`).
- `./run.sh --frontend` — Starts frontend only (`http://localhost:5173`).
- `./run.sh --test` — Runs all backend and frontend automated test suites.

#### Using Windows Command Prompt / PowerShell:
```cmd
run.bat
```
or with root `npm`:
```bash
npm run dev        # Starts frontend (delegates to frontend/package.json)
npm run backend    # Starts backend service
npm test           # Runs frontend tests
npm run backend:test # Runs backend pytest suite
```

### 🐳 Docker Container Launch (Unified Backend + Frontend)

Build and run the entire application in a single container (FastAPI serving the React SPA bundle):

```bash
# Build the Docker image (multi-stage build with Node & Python)
docker build -t economic-dashboard .

# Run the container
docker run -p 8000:8000 economic-dashboard
```
Access the dashboard at `http://localhost:8000` (API docs at `http://localhost:8000/docs`).

---

### Manual Service Commands

#### 1. Backend Service & Tests
```bash
# Run automated backend test suite
python -m pytest backend/tests/ -v

# Start backend development server (FastAPI)
python -m uvicorn backend.app.main:app --reload --port 8000
```
API endpoints: `http://localhost:8000` (Healthcheck: `http://localhost:8000/health`, OpenAPI docs: `http://localhost:8000/docs`).

#### 2. Frontend Development & Build
```bash
# Install frontend dependencies
npm --prefix frontend install

# Start Vite frontend development server
npm --prefix frontend run dev

# Run TypeScript type-checking and production build
npm --prefix frontend run build

# Run frontend tests
npm --prefix frontend run test
```

---

## Project Structure

```text
economic-dashboard/
├── AGENTS.md                           # Operational manual and agent instructions
├── README.md                           # Human-facing project documentation
├── _docs/
│   ├── plan.md                         # Comprehensive architecture blueprint & data specifications
│   ├── tasks.md                        # Implementation task backlog
│   ├── design-system.md                # Official UI tokens, components & anti-drift guardrails
│   └── testing-guidelines.md           # Testing standards, vectors & QA verification
├── backend/                            # FastAPI backend service
│   ├── app/
│   │   ├── main.py                     # App entrypoint & middleware
│   │   ├── database.py                 # SQLite models & session management
│   │   ├── clients/                    # External API clients (bcra_client, fx_client, mock_data)
│   │   ├── services/                   # Business logic (macro_service, risk_service, export_service)
│   │   └── routes/                     # REST API routers (macro, risk, export, system)
│   └── tests/                          # Backend test suite (pytest)
└── frontend/                           # React + Vite frontend
    ├── src/
    │   ├── components/                 # UI components (macro, risk, batch, layout, common)
    │   ├── services/api.ts             # Typed API client
    │   ├── types/index.ts              # TypeScript domain types
    │   └── App.tsx                     # Main layout & navigation
    └── package.json
```
