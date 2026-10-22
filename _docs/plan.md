# Economic & Credit Risk Dashboard (BCRA)
## Technical Architecture & Implementation Blueprint

---

## 1. Executive Summary & Objectives

This project is an institutional-grade financial and credit risk dashboard powered by public data from the **Banco Central de la República Argentina (BCRA)** and complementary financial FX sources. 

The application is tailored for **economic and credit risk analysts**, structured into two primary workflows:
1. **Macro & FX Monitor:** Tracking real-time and historical monetary aggregates, policy rates, international reserves, inflation metrics, and foreign exchange spreads (Official vs. MEP/CCL/Blue), with an on-demand custom variable selector.
2. **Credit Risk Screener (Central de Deudores):** Deep CUIT/CUIL lookup detailing 24-month debt classification (Situación 1 to 6), financial institution concentration, rejected checks, automated early-warning flags, and **batch portfolio upload (CSV/TXT)** for side-by-side risk assessment.
3. **Executive Reporting:** Clean data exports (CSV, Excel) and one-click printable **1-Page Executive PDF Credit Dossiers** for credit committees.

---

## 2. High-Level System Architecture

```mermaid
flowchart TD
    subgraph Data Sources
        BCRA_CD["BCRA Central de Deudores API\n(api.bcra.gob.ar/centraldedeudores/v1.0)"]
        BCRA_EST["BCRA Estadísticas Monetarias API\n(api.bcra.gob.ar/estadisticas/v3.0)"]
        FX_PUB["Complementary Financial FX API\n(DolarApi - MEP / CCL / Blue)"]
    end

    subgraph Backend - FastAPI (Python)
        Client["BCRA & FX Integration Engine\n(Resilient HTTPX + SSL Bypass + Mock Fallback)"]
        Sync["Background Sync & Scheduler\n(Daily Macro Series Refresh)"]
        RiskEngine["Risk & Alert Engine\n(Early Warning Flags & Scoring)"]
        ExportEngine["Export Engine\n(CSV, Excel, ReportLab / HTML-to-PDF)"]
        API["FastAPI REST Endpoints\n(/api/macro, /api/risk, /api/batch, /api/export)"]
    end

    subgraph Database Layer
        DB[("SQLite Database\n(macro_series, deudores_cache, cuit_portfolio)")]
    end

    subgraph Frontend - React (Vite + Tailwind CSS)
        UI["Modern Financial Web UI\n(Lucide Icons + Recharts / Lightweight Charts)"]
        Tab1["Macro Monitor View\n(Time-Series, FX Spreads, Variable Picker)"]
        Tab2["Credit Risk Single CUIT\n(24M Matrix, Entity Breakdown, Cheques, Alerts)"]
        Tab3["Batch Portfolio View\n(CSV/TXT Upload, Comparative Ranking)"]
        Dossier["1-Page Executive PDF Viewer"]
    end

    BCRA_CD --> Client
    BCRA_EST --> Client
    FX_PUB --> Client

    Client --> Sync
    Sync --> DB
    Client --> RiskEngine
    RiskEngine --> DB
    DB --> API
    RiskEngine --> API
    ExportEngine --> API

    API <--> UI
    UI --> Tab1
    UI --> Tab2
    UI --> Tab3
    UI --> Dossier
```

---

## 3. Core Modules & Feature Scope

### Module 1: Macro & FX Monitor
- **Key Series Catalog:**
  - International Reserves (*Reservas Internacionales*)
  - Monetary Base (*Base Monetaria*)
  - Policy Rates (*Tasa de Política Monetaria / Pases pasivos*)
  - Official Exchange Rates (*Mayorista A3500 & Minorista*)
  - Financial Exchange Rates (*Dólar MEP / Bolsa, Dólar CCL / Cable, Dólar Blue*)
  - FX Spread (*Brecha cambiaria %*)
  - Inflation Indices (*CER, UVA, Badlar*)
- **Interactive Capabilities:**
  - Date range filters (1M, 3M, 6M, 1Y, 5Y, Max).
  - Normalization & Dual-Axis comparisons (e.g., Base Monetaria vs. Reserves).
  - Dynamic Variable Catalog: Search and plot any BCRA official variable ID dynamically.

### Module 2: Credit Risk Screener (Central de Deudores)
- **Single CUIT/CUIL Inspection:**
  - Institutional summary: Total registered debt (thousands of ARS), worst current situation.
  - Bank/Entity breakdown table: Debt amount, days past due, process observation.
  - 24-Month Debt Trajectory Matrix: Visual heatmap showing evolution from Situation 1 (Normal) to Situation 6 (Irrecuperable por disposición técnica).
  - Bounced Checks (*Cheques Rechazados*): Reason (lack of funds, formal defect), date, amount, fine status, and payment status.
- **Automated Early-Warning Risk Badges:**
  - ⚠️ *Deterioration Alert:* Credit rating downgraded in the last 6 months.
  - ⚠️ *High Non-Bank Exposure:* High proportion of debt concentrated in non-traditional financial entities (Fintech / Fideicomisos).
  - ⚠️ *Recent Unpaid Checks:* Active unpaid bounced checks in the past 90 days.
  - ⚠️ *Debt Acceleration:* Significant increase in debt exposure (>50% YoY).

### Module 3: Portfolio & Batch Comparison (CSV / TXT)
- **Upload Utility:**
  - Drag-and-drop file upload supporting `.csv` and `.txt` with CUIT lists.
  - Automatic validation of CUIT checksum (Algoritmo Módulo 11 de AFIP).
- **Comparative Risk Board:**
  - Portfolio table sorting by Worst Situation, Total Exposure, and Alert Severity.
  - Quick export of batch results to Excel/CSV.

### Module 4: Executive Reporting & PDF Dossier
- **Printable 1-Page Credit Dossier:**
  - Header: Tax ID, Legal Name, Date of Report, Analyst Badge.
  - Credit Scorecard: Current Situation, Total Debt, Bank Exposure chart.
  - 24-Month Historical Heatmap snippet.
  - Early-Warning Flags and Bounced Checks summary.
  - Clean CSS `@media print` styling + PDF download button.

---

## 4. API Specification & Data Model

### FastAPI REST Endpoints

| Category | Endpoint | Method | Description |
|---|---|---|---|
| **Macro** | `/api/macro/indicators/summary` | GET | Latest snapshot of reserves, base, rates, FX spreads |
| **Macro** | `/api/macro/series/{variable_id}` | GET | Historical time-series data with date filtering |
| **Macro** | `/api/macro/fx-spreads` | GET | Official vs Financial FX (MEP/CCL/Blue) and spread % |
| **Macro** | `/api/macro/catalog` | GET | List of available BCRA variables with search |
| **Risk** | `/api/risk/deudores/{cuit}` | GET | Full credit report: current debts, history, cheques, risk flags |
| **Risk** | `/api/risk/batch` | POST | Upload CSV/TXT list of CUITs and return portfolio summary |
| **Export**| `/api/export/cuit-dossier/{cuit}` | GET | Download 1-page PDF Dossier |
| **Export**| `/api/export/batch-excel` | POST | Export portfolio table to `.xlsx` |
| **System**| `/api/system/status` | GET | API connectivity, mock mode status, DB sync timestamp |

### SQLite Database Schema

```sql
-- Cached macro indicators time-series
CREATE TABLE IF NOT EXISTS macro_series (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    variable_id INTEGER NOT NULL,
    date DATE NOT NULL,
    value REAL NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(variable_id, date)
);

-- Variable Catalog Metadata
CREATE TABLE IF NOT EXISTS macro_variables (
    variable_id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    unit TEXT,
    category TEXT
);

-- Cached CUIT queries to prevent repetitive BCRA API hits
CREATE TABLE IF NOT EXISTS cuit_cache (
    cuit TEXT PRIMARY KEY,
    denomination TEXT,
    worst_situation INTEGER,
    total_debt REAL,
    raw_payload JSON,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Saved Portfolios / Watchlists
CREATE TABLE IF NOT EXISTS portfolio_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    portfolio_name TEXT DEFAULT 'Default',
    cuit TEXT NOT NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 5. Directory & File Structure

```
economic-dashboad/
├── _docs/
│   └── plan.md                         # This architecture specification
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                     # FastAPI application entrypoint
│   │   ├── config.py                   # Environment settings & constants
│   │   ├── database.py                 # SQLite connection & SQLAlchemy models
│   │   ├── clients/
│   │   │   ├── __init__.py
│   │   │   ├── bcra_client.py          # BCRA HTTP client (SSL handling + retries)
│   │   │   ├── fx_client.py            # DolarApi / complementary financial FX client
│   │   │   └── mock_data.py            # Offline synthetic data generator for development
│   │   ├── services/
│   │   │   ├── __init__.py
│   │   │   ├── macro_service.py        # Macro series aggregator & sync manager
│   │   │   ├── risk_service.py         # Central de Deudores processor & flag engine
│   │   │   └── export_service.py       # Excel & PDF dossier generator
│   │   └── routes/
│   │       ├── __init__.py
│   │       ├── macro_routes.py         # Endpoints for macro & FX
│   │       ├── risk_routes.py          # Endpoints for single & batch CUIT queries
│   │       └── export_routes.py        # File export endpoints
│   ├── tests/
│   │   ├── test_bcra_client.py
│   │   └── test_risk_service.py
│   ├── requirements.txt
│   └── run.py                          # Uvicorn launcher
├── frontend/
│   ├── public/
│   │   └── favicon.svg
│   ├── src/
│   │   ├── assets/
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── Navbar.tsx          # Dual-tab navigation & status indicator
│   │   │   │   └── Header.tsx
│   │   │   ├── macro/
│   │   │   │   ├── MetricCard.tsx      # KPI stat cards with trend badges
│   │   │   │   ├── MacroChart.tsx      # Multi-series line & area charts
│   │   │   │   ├── FxSpreadChart.tsx   # Brecha cambiaria comparison
│   │   │   │   └── VariablePicker.tsx  # Dynamic series search & filter
│   │   │   ├── risk/
│   │   │   │   ├── CuitSearchInput.tsx # CUIT input with Módulo 11 validation
│   │   │   │   ├── RiskBadgeGrid.tsx   # Early warning alert chips
│   │   │   │   ├── DebtEntityTable.tsx # Debt per financial entity
│   │   │   │   ├── HistoryHeatmap.tsx  # 24-month situation matrix (1 to 6)
│   │   │   │   ├── BouncedChecks.tsx   # Rejected checks table
│   │   │   │   └── DossierModal.tsx    # Executive 1-page printable dossier
│   │   │   ├── batch/
│   │   │   │   ├── FileUploadZone.tsx  # Drag & drop CSV/TXT with CUITs
│   │   │   │   └── PortfolioTable.tsx  # Comparative ranking & multi-CUIT view
│   │   │   └── common/
│   │   │       ├── LoadingSpinner.tsx
│   │   │       └── AlertBanner.tsx
│   │   ├── services/
│   │   │   └── api.ts                  # Axios/fetch client typed with backend models
│   │   ├── types/
│   │   │   └── index.ts                # TypeScript interfaces (Macro, CUIT, Debt, Check)
│   │   ├── App.tsx                     # Main layout & router/tab controller
│   │   ├── index.css                   # Tailwind setup & print styles
│   │   └── main.tsx
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   └── tsconfig.json
└── README.md
```

---

## 6. Phased Implementation Roadmap

- **Phase 1: Backend Foundation & BCRA Connectors**
  - Setup FastAPI environment, SQLite models, and database engine.
  - Implement `bcra_client.py` with custom SSL handling, retries, and comprehensive `mock_data.py` fallback.
  - Implement `fx_client.py` for parallel FX (MEP, CCL, Blue).
- **Phase 2: Macro Monitor Backend & Endpoints**
  - Build endpoints for macro series, summary KPIs, FX spread calculation, and variable catalog search.
  - Implement SQLite caching and daily sync logic.
- **Phase 3: Credit Risk Engine & Batch Processing**
  - Implement Central de Deudores client (current debts, historical debts, bounced checks).
  - Implement early-warning risk scoring algorithms.
  - Implement batch CUIT upload parser (CSV/TXT) and portfolio aggregator.
- **Phase 4: Frontend Development (React + Tailwind)**
  - Setup Vite + React + Tailwind + Lucide Icons + Recharts.
  - Build the **Macro Monitor View** (KPIs, time-series charts, FX spreads, dynamic metric selector).
  - Build the **Credit Risk View** (search, 24M history matrix, bank debt tables, alert badges).
  - Build the **Batch Portfolio View** (CSV/TXT upload, comparison table).
- **Phase 5: Executive Dossier & Export Engine**
  - Design the printable 1-Page Credit Dossier (clean layout, print stylesheet, PDF export).
  - Add CSV and Excel export options for macro time series and batch portfolios.
- **Phase 6: Integration, Verification & Polish**
  - Test real BCRA API connectivity vs mock fallback switch.
  - Validate against actual Argentine test CUITs and edge cases.
