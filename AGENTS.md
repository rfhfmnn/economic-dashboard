# AGENTS.md — AI Agent Guidelines & Operating Manual

Welcome to the **Economic & Credit Risk Dashboard (BCRA)** repository. This document defines the architectural rules, agent roles, engineering standards, and collaborative workflows expected of all AI agents working on this codebase.

---

## 1. Project Mission & High-Level Architecture

The goal of this project is to build an institutional-grade financial and credit risk dashboard powered by public data from the **Banco Central de la República Argentina (BCRA)** and complementary financial FX sources (DolarApi).

### Core Workflows:
1. **Macro & FX Monitor:**
   - Real-time and historical monetary aggregates, policy rates, international reserves, and inflation indices (CER, UVA, Badlar).
   - Financial exchange rates (Official vs. MEP / CCL / Blue) and FX spreads (*brecha cambiaria*).
   - Dynamic variable selector querying BCRA series catalogs.
2. **Credit Risk Screener (Central de Deudores):**
   - Single CUIT/CUIL lookup detailing 24-month debt classification history (*Situación 1 to 6*), bank debt distribution, and bounced checks (*cheques rechazados*).
   - Automated early-warning risk badge engine (credit deterioration, non-bank lender concentration, recent unpaid checks, debt acceleration).
3. **Batch Portfolio & Comparative Board:**
   - Multi-debtor assessment via CSV/TXT upload with client-side Módulo 11 CUIT validation and comparative risk sorting.
4. **Executive Reporting:**
   - Printable 1-page executive credit dossier with print stylesheets (`@media print`) and Excel/PDF export capabilities.

### Tech Stack:
- **Backend:** Python 3.11+, FastAPI, SQLite (SQLAlchemy / SQLModel), HTTPX (resilient client with custom SSL handling), Pytest, ReportLab / OpenPyXL.
- **Frontend:** React 18+, Vite, TypeScript, Tailwind CSS, Lucide React, Recharts.
- **Tooling & Orchestration:** Git, GitHub CLI (`gh`), Vitest / Pytest, Ruff / ESLint.

---

## 2. Repository Layout

```text
economic-dashboard/
├── AGENTS.md                           # This operational manual
├── README.md                           # Human-facing project documentation
├── _docs/
│   ├── plan.md                         # Comprehensive architecture blueprint & data specifications
│   ├── tasks.md                        # Implementation task backlog
│   ├── design-system.md                # Official UI tokens, components & anti-drift guardrails
│   └── testing-guidelines.md           # Testing standards, vectors & QA verification
├── .agent/
│   ├── agents/                         # Specialized persona definitions
│   │   ├── pm/agent.md                 # Task grooming & acceptance criteria
│   │   ├── backend-developer/agent.md  # Server-side API & DB engineering
│   │   ├── frontend-developer/agent.md # UI component & client state engineering
│   │   ├── fullstack-developer/agent.md# End-to-end integration
│   │   ├── qa-engineer/agent.md        # Acceptance criteria validation & QA verdicts
│   │   ├── debugger/agent.md           # Defect root cause analysis & fixes
│   │   ├── python-pro/agent.md         # Advanced Python patterns & performance
│   │   └── ui-designer/agent.md        # UI/UX design & layout polish
│   └── skills/
│       └── design-dashboards/          # Dashboard design principles & references
├── backend/                            # FastAPI backend service
│   ├── app/
│   │   ├── main.py                     # App entrypoint
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

---

## 3. Agent Roles & Collaboration Workflow

### The Orchestrator

The main session acts as the Orchestrator. It launches the PM, the Engineer, and QA as sub-agents. **It does not groom, implement, or test code itself.** Its sole responsibility is state management and workflow enforcement.

#### Lifecycle

1. Pick the next open issue from the backlog.
2. **PM** grooms it (defines acceptance criteria).
3. **Engineer** implements it (writes code and tests).
4. **QA** verifies it against the PM's criteria.
5. On **FAIL**: Send the QA comment as input back to step 3. *(Max 3 attempts)*.
6. On **PASS**: Close the issue.
7. Repeat until the backlog is empty.

#### Rules

- **Single Tasking:** Tasks are strictly GitHub issues. The Orchestrator and agents must process them **one at a time** (no parallel implementation of multiple issues).
- **Context Awareness:** The Engineer MUST read the acceptance criteria before writing the first line of code, and re-read them before calling `@qa-engineer ready for review`.
- **Version Control:** The Engineer must commit work regularly using conventional commits, rather than making a single massive commit at the end.
- **Do not skip step 2:** No code can be written without PM grooming.
- **Strict Role Boundaries:** The Engineer MUST NOT close the issue. QA MUST NOT fix the code (only outputs PASS or FAIL with reasons).
- **The Circuit Breaker:** If a task receives 3 consecutive FAIL verdicts from QA, the Orchestrator MUST pause, leave the issue open, and request human intervention. Do not loop endlessly.
- **Closing Authority:** Only the Orchestrator closes the issue, and ONLY after QA explicitly outputs `## QA: PASS`.

### Specialized Roles & Responsibilities:

| Role | Persona File | Primary Mandate |
|---|---|---|
| **Product Manager** | `.agent/agents/pm/agent.md` | Grooms issues, defines testable criteria, explicitly assigns tasks to specific engineers. |
| **Backend Developer** | `.agent/agents/backend-developer/agent.md` | Focuses on FastAPI endpoints, SQLite, BCRA/FX clients, SSL bypass, caching, and Python tests. |
| **Frontend Developer** | `.agent/agents/frontend-developer/agent.md` | Implements React components, Recharts visualizations, Tailwind styling, Módulo 11, and UI tests. |
| **Fullstack Developer** | `.agent/agents/fullstack-developer/agent.md` | End-to-end features requiring simultaneous frontend and backend modifications. |
| **QA Engineer** | `.agent/agents/qa-engineer/agent.md` | Verifies criteria, runs tests, issues binary `## QA: PASS` or `## QA: FAIL`. Never writes feature code. |
| **Debugger** | `.agent/agents/debugger/agent.md` | Investigates test failures or runtime defects, identifies root causes, and implements minimal targeted fixes. |

### Handoff & Communication Rules:
- **Rule:** When an Engineer finishes coding and local testing, they MUST leave a comment saying `@qa-engineer ready for review` and stop executing to await QA assessment.

---

## 4. Architectural Rules & Engineering Principles

### 1. Resilient External API Integrations & Offline Mock Mode
- Argentine government APIs (specifically `api.bcra.gob.ar`) frequently encounter custom or non-standard SSL certificate chains and intermittent downtime.
- **Rule:** All HTTP requests to external endpoints must utilize timeouts, graceful retry mechanisms, and custom SSL contexts.
- **Rule:** Always maintain comprehensive synthetic fallback data in `backend/app/clients/mock_data.py`. When offline or if an external API fails, the backend must seamlessly fall back to realistic mock payloads without crashing.

### 2. CUIT Validation Standard
- Every Argentine tax ID (CUIT/CUIL) submitted to single lookup or batch upload **must** be validated using the official **AFIP Módulo 11 checksum algorithm**.
- Validation must occur both client-side (for instant feedback) and server-side (for API defense).

### 3. Database & Caching Discipline
- The project uses **SQLite** for local storage and caching.
- Table schemas (`macro_series`, `macro_variables`, `cuit_cache`, `portfolio_items`) must be indexed on query keys.
- Cached CUIT records prevent unnecessary repetitive hits to external services.

### 4. Dependency Management
- **Rule:** Agents MUST NOT add new dependencies (`npm install` or `pip install`) unless explicitly required by the task description or approved by a human.

### 5. Anti-Loop & Escalation Protocol
- **Rule:** If a test fails more than **3 consecutive times** during an attempt to fix it, the Engineer MUST stop, commit their current state, and escalate the issue to the `Debugger` agent or request human intervention. Do not burn resources on infinite loops.

### 6. Financial Dashboard UX, Design System & Anti-Drift Compliance
- **Rule:** All frontend components and styling MUST strictly comply with `_docs/design-system.md` to prevent UI drift across agent sessions.
- Follow financial dashboard principles: clear metric hierarchy, color-coded risk alerts, and dual-axis comparison capability.
- Credit ratings follow BCRA classifications. Use consistent severity colors (Situación 1: Emerald, 2: Amber, 3: Orange, 4: Rose, 5: Red, 6: Purple) as defined in the design system.
- All monetary values, CUITs, rates, and percentages must use monospace tabular alignment (`font-mono` / `tabular-nums`).
- The 1-page executive credit dossier must support clean printing via `@media print` stylesheets without clipping or page overflowing.

---

## 5. Definition of Done (DoD)

A task or GitHub issue is considered **Done** only when:
1. **Criteria Met:** Every acceptance criterion defined in the task is implemented.
2. **Automated Tests Passing:** Unit or integration tests are written and pass (`pytest` for backend, `vitest` for frontend).
3. **Linting & Formatting:** Code adheres to styling guidelines (no Ruff or ESLint warnings).
4. **No Regressions:** Existing test suites continue to pass cleanly.
5. **Clean Git Commit:** Code is committed with conventional commit messages (`feat:`, `fix:`, `test:`, `docs:`, `refactor:`).
6. **QA Verification:** The QA engineer has executed the test suite, verified the criteria, and provided a formal `## QA: PASS` verdict.

---

## 6. Command Cheat Sheet

### Backend (Python / FastAPI):
```bash
# Run backend development server
uvicorn backend.app.main:app --reload --port 8000

# Run all backend tests
pytest backend/tests/ -v

# Code Linting & Formatting
ruff check backend/
ruff format backend/
```

### Frontend (React / Vite / TS):
```bash
# Install dependencies
npm --prefix frontend install

# Start development server
npm --prefix frontend run dev

# Run TypeScript type-checking & build
npm --prefix frontend run build

# Run frontend tests & linting
npm --prefix frontend run test
npm --prefix frontend run lint
```

### GitHub Issues & Collaboration:
```bash
# List open issues
gh issue list

# Add handoff or QA comment to an issue
gh issue comment <issue-number> --body "@qa-engineer ready for review"

# Close verified issue
gh issue close <issue-number> --comment "Verified by QA - all acceptance criteria passed"
```