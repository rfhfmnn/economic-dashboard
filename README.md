# Economic & Credit Risk Dashboard (BCRA)

> 🌐 **Live Public Deployment:** [Economic & Credit Risk Dashboard (BCRA)](https://economic-dashboard-p91x.onrender.com/)

An institutional-grade financial and credit risk intelligence dashboard powered by public data from the **Banco Central de la República Argentina (BCRA)**, **ArgentinaDatos (REM)**, and complementary financial FX sources (**DolarApi**).

---

## 📌 Problem Description

Financial analysts, credit risk officers, and treasury desks operating in Argentina confront unique, severe structural challenges:
1. **Severe Data Fragmentation & Currency Volatility:** Tracking monetary policy, high-inflation dynamics, and parallel exchange rate regimes (*brecha cambiaria* between the official rate and financial rates like MEP, CCL, and Blue) requires querying multiple disparate and disconnected sources.
2. **Opaque Credit Risk & Central de Deudores Complexity:** Evaluating debtor solvency requires analyzing the BCRA *Central de Deudores*, which presents debtor classifications (*Situación 1 to 6*), historical credit deterioration, and unpaid bounced checks across the banking system in fragmented formats without automated risk alerting.
3. **External API Instability & Public Certificate Quirks:** Argentine public financial APIs (`api.bcra.gob.ar`) frequently experience non-standard SSL certificate chains, rate limiting, and intermittent downtime, causing mission-critical risk workflows to crash without resilient fallback mechanisms.
4. **Lack of Automated Batch Screening:** Credit committees evaluating dozens of corporate clients simultaneously are forced to run manual, one-by-one queries without batch AFIP Módulo 11 checksum validation or comparative risk ranking.

---

## ⚡ System Functionality & Expected Behavior

This platform delivers an institutional-grade analytical cockpit structured around four core analytical workflows:

### 1. Macro & FX Monitor
- **Monetary Aggregates & Rates:** Real-time and historical tracking of Monetary Base, Central Bank International Reserves, LELIQ / Policy Rates, Badlar, CER, UVA, and inflation indices.
- **Financial FX & Brecha Cambiaria:** Side-by-side comparison of Official Wholesale and Retail exchange rates against parallel financial quotations (MEP, CCL, and Blue), automatically calculating the exchange rate spread (*brecha cambiaria*).
- **Dynamic Variable Catalog:** Interactive search across the complete BCRA series catalog with multi-timeframe filtering (1M, 3M, 6M, 1Y, 5Y, Max) and dual-axis comparison charts.

### 2. REM Macroeconomic Expectations (Relevamiento de Expectativas de Mercado)
- **Consensus Projections:** Automated ingestion of market expectations from top financial institutions and consulting firms via ArgentinaDatos REM API.
- **Inflation Fan Chart:** Expected vs. Actual CPI inflation comparison cone, analyzing monthly projections and annual trajectories against actual INDEC inflation.
- **FX Expectations & Dispersion:** Nominal exchange rate projections with statistical breakdowns across Top 10 forecasters vs. general survey consensus.

### 3. Credit Risk Screener (Central de Deudores)
- **Single CUIT/CUIL Lookup:** Instant tax ID query with automated AFIP Módulo 11 checksum validation and local caching.
- **24-Month Classification Matrix:** Visual month-by-month history detailing borrower credit status across BCRA ratings (*Situación 1: Normal* to *Situación 6: Irrecuperable por disposición técnica*).
- **Entity Exposure & Bounced Checks:** Breakdown of debt held by each financial institution, non-bank lender concentration metrics, and rejected checks (*cheques rechazados* by lack of funds or technical defects).
- **Automated Early-Warning Engine:** Real-time badge indicators for credit rating downgrades within 6 months, debt acceleration (>50% YoY growth), high concentration in non-bank fintech lenders, and recent unpaid checks.

### 4. Batch Portfolio Assessment & Executive Reporting
- **Multi-Debtor Upload:** Drag-and-drop ingestion of CSV or TXT debtor lists with instant client-side CUIT validation.
- **Comparative Risk Board:** Portfolio ranking by worst credit situation, aggregate debt volume, and alert severity.
- **1-Click Executive Export:** Generation of printable 1-page Executive PDF Credit Dossiers (formatted with dedicated `@media print` stylesheets for credit committee review) and Excel workbook exports.

---

## Architecture Overview

- **Backend:** Python 3.11+, FastAPI, SQLite / PostgreSQL (SQLAlchemy), HTTPX with custom SSL handling & synthetic mock fallback, OpenTelemetry, Pytest.
- **Frontend:** React 18+, Vite, TypeScript, Tailwind CSS, Lucide React, Recharts.
- **Observability:** OpenTelemetry Collector, Prometheus, Loki, Tempo, Grafana.
- **Incident Response:** Automated On-Call Engineer agent polling alert endpoints and triggering headless coding remediation.
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

### 🐳 Docker & Docker Compose Launch

The repository provides two independent, isolated containerized environments that can run simultaneously on the same host without port or volume collisions:

#### Development Environment (`docker-compose.yaml` / `docker-compose.dev.yaml`)
- **App URL:** `http://localhost:8000` (FastAPI + React SPA)
- **PostgreSQL:** Port `5432` | Database: `economic_dashboard_dev`
- **Containers:** `economic-dashboard-app` / `economic-dashboard-postgres`
- **Volume:** `postgres_data` / `postgres_data_dev`

```bash
# Start development stack
docker compose up -d --build
# or explicitly with dev compose:
docker compose -f docker-compose.dev.yaml up -d --build

# View dev logs and status
docker compose logs -f
docker compose ps

# Stop development stack
docker compose down
```

#### Production Environment (`docker-compose.prod.yaml`)
- **App URL:** `http://localhost:8080` (FastAPI + React SPA)
- **PostgreSQL:** Port `5433` | Database: `economic_dashboard_prod`
- **Containers:** `economic-dashboard-app-prod` / `economic-dashboard-postgres-prod`
- **Volume:** `postgres_data_prod` (isolated persistent volume)
- **Settings:** High-performance connection pool (`DB_POOL_SIZE=15`, `DB_MAX_OVERFLOW=30`), restart policy `always`.

```bash
# Start independent production stack
docker compose -f docker-compose.prod.yaml --env-file .env.production up -d --build

# View production logs and status
docker compose -f docker-compose.prod.yaml ps
docker compose -f docker-compose.prod.yaml logs -f

# Stop production stack
docker compose -f docker-compose.prod.yaml down
```

#### Option C: Standalone Container Launch (SQLite fallback)
Build and run the unified application container with local SQLite storage:

```bash
# Build the Docker image (multi-stage build with Node & Python)
docker build -t economic-dashboard .

# Run the container
docker run -p 8000:8000 economic-dashboard
```

Access the dashboard at `http://localhost:8000` (API docs at `http://localhost:8000/docs`).

---

### 🌐 Deploying to Render (Dev & Prod Environments)

This project is configured for multi-environment deployment to [Render](https://render.com) using Docker containers that serve both the built React SPA and the FastAPI backend.

#### Option 1: Automated CI/CD via GitHub Actions (Recommended)
The repository includes an institutional-grade GitHub Actions CI/CD pipeline defined in [`.github/workflows/ci-cd.yml`](.github/workflows/ci-cd.yml) with a clean separation between **Build** and **Deploy** stages:
1. **Parallel Test Stage:** Runs backend pytest suite (including infrastructure config validation) and frontend Vitest/lint/build checks concurrently in separate runner jobs.
2. **Containerized E2E Stage:** Spins up the container stack on an ephemeral runner, validates production compose schemas, and executes end-to-end integration tests (`test_docker_compose.py` & `test_e2e_integration.py`).
3. **Build Stage (`build-image`):** Builds the Docker image once and pushes it to GitHub Container Registry (`ghcr.io`), tagged using the **`YYYYMMDD-HHMMSS-shortsha`** pattern (e.g. `20260818-163457-83242da`) alongside `latest`, `dev-latest`, and `prod-latest` references.
4. **Deploy Stage (`deploy-dev` & `deploy-prod`):** Pulls the prebuilt image from the registry and serves it, passing the image URL to Render (`imageUrl` API / `imgURL` hook) or serving via container runtime. This decouples compilation from deployment and ensures reproducible, fast rollouts.
5. **Automated Health Validation:** Continuously queries `${RENDER_APP_URL}/health` with exponential backoff until the live deployment answers HTTP 200 `{"status": "ok"}` and verifies database health at `/api/system/health`.

To enable multi-environment deployments, configure the following in GitHub under **Settings > Secrets and variables > Actions**:

| Name | Scope / Environment | Description |
|---|---|---|
| `RENDER_DEPLOY_HOOK_URL_PROD` | Production | Render Deploy Hook URL for production service. |
| `RENDER_SERVICE_ID_PROD` | Production | Render Service ID (`srv-...`) for production service. |
| `RENDER_APP_URL_PROD` | Production | Public production URL (`https://economic-dashboard-p91x.onrender.com`). |
| `RENDER_DEPLOY_HOOK_URL_DEV` | Development | Render Deploy Hook URL for development service. |
| `RENDER_SERVICE_ID_DEV` | Development | Render Service ID (`srv-...`) for development service. |
| `RENDER_APP_URL_DEV` | Development | Public development URL (e.g. `https://economic-dashboard-dev.onrender.com`). |
| `RENDER_API_KEY` | Global | Render Account API Key for REST API deployment. |
| `DEPLOY_TIMEOUT_SECONDS` | Global | (Optional) Deploy health check timeout (default: `300`). |

#### Manual Promotion from Dev to Production (`promote-to-prod.yml`)
When dev changes have been tested and verified, promote them to production using the manual GitHub Actions workflow [`.github/workflows/promote-to-prod.yml`](.github/workflows/promote-to-prod.yml):
1. Navigate to **Actions** -> **Promote Dev to Production** in your GitHub repository.
2. Click **Run workflow**.
3. Select your parameters:
   - **Source branch:** `dev` (or feature/staging branch)
   - **Target branch:** `master` (or `main`)
   - **Specific dev image tag:** (Optional: specify an explicit tag; defaults to the currently deployed dev image `dev-current`)
   - **Optional release tag:** (e.g. `v1.2.0`)
   - **Deploy production:** `true` (automatically trigger Render deploy & health validation)
4. The workflow:
   - Executes pre-promotion backend & frontend test suites and build checks.
   - **Pulls the currently deployed dev image** from the container registry.
   - Re-tags the verified dev image with a new production tag conforming to the **`YYYYMMDD-HHMMSS-shortsha`** pattern (and optional semantic release tag) and pushes it to the registry.
   - Merges source branch into target branch with a non-fast-forward merge commit and optional git release tag.
   - Deploys the promoted container image to the Production Render service and validates live health probes.

#### Option 2: Render Infrastructure Blueprints
The repository provides Infrastructure as Code blueprints for Render configured with `runtime: image` to pull prebuilt container images:
- **`render.yaml`:** Full dual-environment blueprint defining both `economic-dashboard-dev` + `economic-dashboard-db-dev` and `economic-dashboard-prod` + `economic-dashboard-db-prod`.
- **`render.dev.yaml`:** Dedicated development-only blueprint.
- **`render.prod.yaml`:** Dedicated production-only blueprint.

To apply via Render:
1. Push your repository to **GitHub** or **GitLab**.
2. Log into [Render Dashboard](https://dashboard.render.com).
3. Click **New +** -> **Blueprint**.
4. Select your repository (Render will parse `render.yaml` or you can point to `render.prod.yaml`).
5. Click **Apply** to provision the isolated services and managed PostgreSQL databases.

#### Option 3: Manual Web Service Setup on Render
If you prefer configuring via the Render Dashboard manually:
1. Click **New +** -> **Web Service**.
2. Connect your Git repository (branch `develop` for Dev, `main` for Production).
3. Choose **Docker** as the Runtime (Environment).
4. Under **Environment Variables**:
   - `DATABASE_URL`: Connection string from your target PostgreSQL database.
   - `FORCE_MOCK`: `false`
   - `BCRA_USE_MOCKS`: `false`
   - `DB_POOL_SIZE`: `15` (for Production) or `5` (for Dev)
5. Set **Health Check Path** to `/health`.

---

### Manual Service Commands

#### 1. Backend Service & Tests
```bash
# Optional: Point to local PostgreSQL (defaults to SQLite if DATABASE_URL is omitted)
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/economic_dashboard"

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
├── Dockerfile                          # Multi-stage production container build
├── docker-compose.yaml                 # Development container stack (default)
├── docker-compose.dev.yaml             # Development container stack (explicit)
├── docker-compose.prod.yaml            # Independent Production container stack
├── render.yaml                         # Dual-environment Render blueprint (Dev & Prod)
├── render.dev.yaml                     # Development-only Render blueprint
├── render.prod.yaml                    # Independent Production-only Render blueprint
├── .env.development.example            # Development environment variables template
├── .env.production.example             # Production environment variables template
├── .github/workflows/
│   ├── ci-cd.yml                       # GitHub Actions CI/CD (Dev & Prod deploy stages)
│   └── promote-to-prod.yml             # Manual promotion from Dev to Production
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
