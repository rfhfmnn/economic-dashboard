# Testing Guidelines — Economic & Credit Risk Dashboard (BCRA)

This document establishes the testing standards, architectural test patterns, domain test vectors, and quality assurance protocols for the **Economic & Credit Risk Dashboard**.

---

## 1. Testing Philosophy & Core Principles

The Economic & Credit Risk Dashboard is an institutional-grade financial intelligence application. Testing must reflect the critical nature of financial data, credit ratings, and statutory tax calculations:

1. **Zero Math & Checksum Errors:**
   - Financial indicators (e.g., *brecha cambiaria*), statistical series aggregations, and AFIP Módulo 11 CUIT checksum validations must be validated with exact unit test vectors.
2. **Offline-First & Deterministic Test Execution:**
   - Tests **must never** depend on live external network connections (e.g., `api.bcra.gob.ar` or `dolarapi.com`).
   - All external HTTP calls must be mocked or intercepted using resilient mock data providers (`mock_data.py` / MSW / `pytest` fixtures).
   - Test suites must execute deterministically in isolated local environments and CI pipelines.
3. **Dual-Stack Testing Strategy:**
   - **Backend:** `pytest`, `pytest-asyncio`, FastAPI `TestClient`, SQLite in-memory databases.
   - **Frontend:** `vitest`, `@testing-library/react`, `@testing-library/user-event`, TypeScript compilation checks.
4. **Agent QA Protocol Compliance:**
   - Every feature or bug fix must satisfy testable acceptance criteria verified by the `@qa-engineer` role before issue closure.

---

## 2. Test Architecture & Directory Structure

```text
economic-dashboard/
├── backend/
│   └── tests/
│       ├── conftest.py               # Shared fixtures: in-memory DB, TestClient, mock data
│       ├── test_bcra_client.py       # BCRA API client, SSL handling, retries & mock fallback
│       ├── test_fx_client.py         # Parallel FX client & brecha calculation tests
│       ├── test_database.py          # SQLite schema, indexing, deduplication & CRUD
│       ├── test_macro_service.py     # Macro time-series caching & normalization
│       ├── test_risk_service.py      # CUIT Módulo 11, debt matrices & alert rule engine
│       ├── test_macro_routes.py      # FastAPI endpoints: /api/macro/*
│       ├── test_risk_routes.py       # FastAPI endpoints: /api/risk/* (single & batch)
│       └── test_export_service.py    # Excel (.xlsx) & PDF dossier generation
└── frontend/
    └── src/
        ├── utils/__tests__/
        │   └── cuit.test.ts          # Client-side AFIP Módulo 11 validation
        └── components/
            ├── macro/__tests__/      # MetricCard, MacroChart, FxSpreadChart
            ├── risk/__tests__/       # CuitSearchInput, RiskBadgeGrid, HistoryHeatmap
            └── batch/__tests__/      # FileUploadZone, PortfolioTable
```

---

## 3. Backend Testing Standards (Python / Pytest)

### 3.1 Tooling & Setup
- **Test Runner:** `pytest`
- **Async Support:** `pytest-asyncio` (for asynchronous FastAPI route and HTTPX client testing)
- **API Client:** `starlette.testclient.TestClient` or `httpx.AsyncClient`
- **Linting & Formatting:** `ruff check backend/` and `ruff format backend/`

### 3.2 Fixture Patterns (`backend/tests/conftest.py`)
- **In-Memory Database Fixture:** Use an isolated SQLite in-memory instance (`sqlite:///:memory:`) for test runs to avoid mutating the local development SQLite database.
- **FastAPI TestClient Fixture:** Override `get_db` dependency to inject the test database session.
- **Synthetic Data Fixture:** Supply realistic mock payloads for BCRA Central de Deudores and BCRA Estadísticas Monetarias.

Example fixture setup:
```python
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app

TEST_DATABASE_URL = "sqlite:///:memory:"

@pytest.fixture(scope="function")
def db_session():
    engine = create_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)

@pytest.fixture(scope="function")
def client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
```

### 3.3 Unit & Service Test Requirements
- **Módulo 11 Checksum Validation:**
  - Verify valid 11-digit CUITs return `True`.
  - Verify invalid checksum digit returns `False`.
  - Verify malformed, alphanumeric, short (<11), or long (>11) strings raise validation errors or return `False`.
- **Resilient Client & Fallback:**
  - Verify `bcra_client.py` gracefully recovers when simulated network timeouts or HTTP 500/503 errors occur by returning synthetic mock data from `mock_data.py`.
  - Ensure SSL bypass / custom context behaves as configured without crashing.
- **Credit Risk Rules Engine:**
  - Test deterioration rule: Downgrade from Situación 1 to Situación 2+ within the past 6 months triggers `Deterioration Alert`.
  - Test non-bank concentration rule: High percentage of debt concentrated in non-traditional entities (fintech, fideicomisos) triggers `High Non-Bank Exposure`.
  - Test unpaid checks rule: Active rejected checks within the last 90 days trigger `Recent Unpaid Checks`.
  - Test debt acceleration rule: >50% YoY debt increase triggers `Debt Acceleration`.
- **Export Verification:**
  - PDF export tests must verify non-empty binary response with `application/pdf` MIME type and `%PDF-` magic header bytes.
  - Excel export tests must verify `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` MIME type and valid ZIP header signature (`PK\x03\x04`).

---

## 4. Frontend Testing Standards (React / TypeScript / Vitest)

### 4.1 Tooling & Setup
- **Test Runner:** `vitest`
- **DOM & Component Assertions:** `@testing-library/react`, `@testing-library/jest-dom`
- **User Interactions:** `@testing-library/user-event`
- **Type Checking:** `npm run build` or `npx tsc --noEmit`

### 4.2 Component & Hook Testing Principles
1. **User-Centric Assertions:**
   - Query elements by accessible role (`getByRole`), label text (`getByLabelText`), or visible text (`getByText`). Avoid querying internal class names.
2. **Instant CUIT Validation:**
   - Assert that typing an invalid CUIT displays an immediate warning badge / error message.
   - Assert that typing a valid 11-digit CUIT clears the warning and enables the search action.
3. **Credit Matrix & Risk Badges:**
   - Verify that Situaciones (1 through 6) apply proper semantic colors (e.g. green for Situación 1, amber for 2-3, red for 4-6).
   - Test empty state handling when debtor has no registered debts or checks.
4. **File Upload Testing (Batch View):**
   - Simulate drag-and-drop or file selection of `.csv` and `.txt` files containing CUIT lists.
   - Assert proper parsing of valid lines and rejection/warning of invalid entries.

---

## 5. Domain-Specific Test Vectors & Scenarios

### 5.1 AFIP CUIT / CUIL Módulo 11 Test Vectors

The algorithm calculates:
$$\text{Checksum} = 11 - \left( \sum_{i=1}^{10} d_i \times w_i \pmod{11} \right)$$
where weights $w = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]$. Special handling:
- If remainder = 0, checksum digit is 0.
- If remainder = 1: for type 23, gender mapping adjust; otherwise checksum digit is 9 or 4 according to AFIP rules.

| CUIT Input | Expected Validity | Scenario Description |
|---|---|---|
| `20-12345678-4` (or numeric equivalent) | Valid / Calculated Checksum | Standard persona física |
| `30-70838150-7` | Valid | Institutional / Persona jurídica |
| `20-12345678-0` | Invalid | Bad verification digit |
| `12345678` | Invalid | Too short (<11 digits) |
| `20-ABC45678-4` | Invalid | Non-numeric characters |
| `""` (Empty string) | Invalid | Empty input |

### 5.2 Financial Formula Test Vectors

**Brecha Cambiaria Formula:**
$$\text{Brecha} (\%) = \frac{\text{Rate}_{\text{Parallel}} - \text{Rate}_{\text{Official}}}{\text{Rate}_{\text{Official}}} \times 100$$

- Example: Official = 1000.00, MEP = 1250.00 $\rightarrow$ Brecha = $+25.00\%$.
- Test cases must verify zero division protection (Official $\le 0$).

### 5.3 BCRA Credit Classifications (Situación 1 to 6)

| Code | Situation Name | Risk Level | Expected UI Color Tone |
|---|---|---|---|
| 1 | Normal | Normal / Low | Green (`text-emerald-400`, `bg-emerald-950/40`) |
| 2 | Con seguimiento especial / Bajo riesgo | Low-Medium | Yellow / Amber (`text-amber-400`, `bg-amber-950/40`) |
| 3 | Con problemas / Riesgo medio | Medium | Amber / Orange (`text-orange-400`, `bg-orange-950/40`) |
| 4 | Con alto riesgo de insolvencia | High | Red (`text-rose-400`, `bg-rose-950/40`) |
| 5 | Irrecuperable | Severe Default | Deep Red / Crimson (`text-red-500`, `bg-red-950/50`) |
| 6 | Irrecuperable por disposición técnica | Technical Default | Purple / Dark Red (`text-purple-400`, `bg-purple-950/40`) |

---

## 6. Testing Command Cheat Sheet

### Backend Tests:
```bash
# Run complete backend test suite
pytest backend/tests/ -v

# Run with test coverage report
pytest backend/tests/ --cov=backend/app --cov-report=term-missing

# Run a specific test module
pytest backend/tests/test_risk_service.py -v

# Run a specific test function
pytest backend/tests/test_risk_service.py::test_modulo11_validation -v

# Code style and lint checks
ruff check backend/
ruff format backend/ --check
```

### Frontend Tests:
```bash
# Run all frontend tests once
npm --prefix frontend run test

# Run tests in watch mode during development
npm --prefix frontend run test -- --watch

# Run a specific test file
npm --prefix frontend run test src/utils/__tests__/cuit.test.ts

# TypeScript compilation and build validation
npm --prefix frontend run build

# Frontend linting
npm --prefix frontend run lint
```

---

## 7. QA Agent Handoff & Acceptance Protocol

When implementing tasks from the backlog, agents must adhere to the collaborative verification lifecycle:

1. **Self-Test Before Handoff:**
   - The implementing Engineer must run both backend and frontend test suites and verify all tests pass locally with zero regressions.
2. **Handoff Signal:**
   - Post handoff message: `@qa-engineer ready for review`.
3. **QA Verification Verdict:**
   - The QA Engineer executes tests, audits edge cases against acceptance criteria, and responds with a binary verdict:

```markdown
## QA: [PASS | FAIL]

### Acceptance Criteria
- [x] [Criterion 1 description] - PASS
- [ ] [Criterion 2 description] - FAIL
      [Detail: Action performed and unexpected error or behavior observed]

### Test Execution
- Command: `pytest backend/tests/ -v` (or `npm --prefix frontend run test`)
- Output: X passed, Y failed in Z seconds

### Coverage Gaps (if any)
- [List any scenario specified in acceptance criteria that lacks automated test coverage]
```

4. **Circuit Breaker Protocol:**
   - If a task receives **3 consecutive FAIL verdicts**, the Engineer must pause and escalate to the `debugger` agent or request human intervention. Infinite retry loops are strictly prohibited.
