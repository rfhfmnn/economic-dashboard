# Project Backlog & Implementation Tasks

## 1. Project Scaffolding and Passing Test Setup
Goal: Initialize the repository workspace with basic backend and frontend directory structures alongside an automated passing test.
Description: Set up the base project structure containing a Python FastAPI backend and a React Vite frontend directory. Configure a standard testing tool like pytest in the backend with a minimal healthcheck test that passes immediately. Provide a basic script or instructions to run both the test suite and local development servers.

## 2. SQLite Database Schema and Connection Setup
Goal: Configure SQLite database connections and create ORM models for macro series, variable catalog, CUIT cache, and portfolio items.
Description: Implement the database connection and session management in `backend/app/database.py` using SQLite with SQLAlchemy or SQLModel. Define database models and schema tables for `macro_series`, `macro_variables`, `cuit_cache`, and `portfolio_items` according to the system specifications. Include automated tests that verify table creation and basic write and read operations against a test database.

## 3. BCRA API Client with Resilient Fallback and Mock Data
Goal: Build an HTTP client for BCRA Estadísticas and Central de Deudores APIs with custom SSL handling, retries, and synthetic mock fallback.
Description: Create `backend/app/clients/bcra_client.py` using HTTPX to query BCRA endpoints with timeout handling and custom SSL configuration to handle Argentine public certificate quirks. Implement `backend/app/clients/mock_data.py` to return realistic synthetic responses when offline or when external endpoints fail. Add unit tests verifying both real request handling and seamless fallback to mock data under network error conditions.

## 4. Parallel FX Rates Client and Brecha Cambiaria Calculation
Goal: Fetch financial exchange rates (MEP, CCL, Blue) and compute the spread percentage against the official BCRA exchange rate.
Description: Implement `backend/app/clients/fx_client.py` to fetch parallel market quotations from public financial APIs like DolarApi with cached fallback values. Create helper functions to calculate the exchange rate spread (brecha cambiaria) comparing official wholesale and retail rates against MEP, CCL, and Blue dollar quotations. Write unit tests to validate correct rate parsing and spread percentage calculations across various market scenarios.

## 5. Macroeconomic Data Ingestion and Caching Service
Goal: Implement the service layer to fetch, normalize, and cache key BCRA macroeconomic series in the SQLite database.
Description: Create `backend/app/services/macro_service.py` to orchestrate fetching monetary base, international reserves, policy rates, and inflation indices from the BCRA client. Store normalized time-series data into the `macro_series` table and maintain an up-to-date catalog in `macro_variables`. Implement unit tests verifying that series are properly stored, retrieved by date range, and deduplicated without redundant network calls.

## 6. Macroeconomic and FX REST API Endpoints
Goal: Expose FastAPI REST endpoints for macroeconomic indicators summary, historical series, FX spreads, variable catalog, and system status.
Description: Build `backend/app/routes/macro_routes.py` with endpoints for `/api/macro/indicators/summary`, `/api/macro/series/{variable_id}`, `/api/macro/fx-spreads`, and `/api/macro/catalog`. Integrate system health and status reporting at `/api/system/status` showing API connectivity and database sync timestamps. Write comprehensive endpoint tests using FastAPI TestClient to validate JSON response structures and query parameter filtering.

## 7. CUIT Validation and Central de Deudores Service
Goal: Implement AFIP CUIT checksum validation and the Central de Deudores data extraction service.
Description: Build a CUIT/CUIL utility implementing the AFIP Módulo 11 checksum algorithm to validate Argentine tax IDs before querying external services. Create `backend/app/services/risk_service.py` to fetch credit records from the BCRA Central de Deudores API, parsing current debts by financial institution, 24-month classification history, and rejected checks. Add unit tests verifying CUIT validation with valid and invalid IDs and validating structured debt extraction from sample payloads.

## 8. Early-Warning Credit Risk Rules Engine
Goal: Build an automated risk scoring engine to evaluate credit deterioration, non-bank concentration, unpaid checks, and debt acceleration.
Description: Extend `backend/app/services/risk_service.py` to analyze parsed credit data and generate standardized warning badges such as credit rating downgrades within six months or debt growth exceeding 50% year-over-year. Calculate financial institution concentration metrics to flag elevated debt held in non-traditional fintech or trust lenders, as well as recent unpaid bounced checks. Implement unit tests asserting that specific debt scenarios correctly trigger corresponding risk alert flags.

## 9. Credit Risk and Batch Query REST API Endpoints
Goal: Expose FastAPI REST endpoints for single CUIT credit risk reports and multi-CUIT batch portfolio evaluations.
Description: Build `backend/app/routes/risk_routes.py` providing the `GET /api/risk/deudores/{cuit}` endpoint to return full credit history, bank breakdowns, bounced checks, and risk badges. Implement the `POST /api/risk/batch` endpoint to accept uploaded lists of CUITs in CSV or plain text, validate them, and return a consolidated comparative risk portfolio. Write API tests verifying error handling for malformed CUITs and correct JSON schema responses for batch requests.

## 10. Report Export Engine for Excel Workbooks and PDF Dossiers
Goal: Implement backend generation services for one-page executive PDF dossiers and Excel portfolio export files.
Description: Create `backend/app/services/export_service.py` using libraries such as ReportLab or openpyxl to generate binary document exports. Expose `GET /api/export/cuit-dossier/{cuit}` to render a printable 1-page executive credit dossier and `POST /api/export/batch-excel` to download evaluated batch portfolios as spreadsheets. Write unit tests verifying that valid binary files with appropriate MIME types and headers are produced.

## 11. Frontend Shell, Navigation, and API Client Setup
Goal: Set up the React application shell with Tailwind CSS, Lucide icons, multi-tab routing, and a typed API client.
Description: Configure the frontend in `frontend/` with Vite, React, TypeScript, and Tailwind CSS, defining common layouts like Header and Navbar. Create a typed API service layer in `frontend/src/services/api.ts` with TypeScript interfaces in `frontend/src/types/index.ts` to communicate with backend endpoints. Add component tests or a simple render test ensuring the shell, tab switcher, and shared layout components mount cleanly.

## 12. Macro and FX Monitor View
Goal: Build the interactive frontend view for tracking macroeconomic indicators, historical charts, FX spreads, and dynamic variable selection.
Description: Implement `MetricCard.tsx`, `MacroChart.tsx`, `FxSpreadChart.tsx`, and `VariablePicker.tsx` in `frontend/src/components/macro/` using Recharts for time-series visualization. Allow users to select predefined timeframes (1M, 3M, 6M, 1Y, 5Y, Max), compare dual-axis series such as reserves versus monetary base, and search the dynamic variable catalog. Verify the view renders accurately with mock and live data and handles loading and error states gracefully.

## 13. Single CUIT Credit Risk Screener View
Goal: Build the interactive credit risk screener view displaying entity debt tables, a 24-month situation matrix, rejected checks, and alert badges.
Description: Create `CuitSearchInput.tsx`, `RiskBadgeGrid.tsx`, `DebtEntityTable.tsx`, `HistoryHeatmap.tsx`, and `BouncedChecks.tsx` in `frontend/src/components/risk/`. Provide instant client-side CUIT checksum validation, visualize the 24-month credit rating evolution across Situaciones 1 through 6 in a color-coded matrix, and show all active early-warning flags. Verify the components correctly display single-debtor credit reports and handle non-existent or invalid CUIT inputs.

## 14. Batch Portfolio Upload and Comparative Board
Goal: Build the batch portfolio interface supporting drag-and-drop file upload and comparative risk ranking across multiple CUITs.
Description: Implement `FileUploadZone.tsx` and `PortfolioTable.tsx` in `frontend/src/components/batch/` to handle CSV and TXT files containing multiple CUITs. Display evaluated portfolios in a sortable table ranked by worst situation, total debt exposure, and alert severity, with quick buttons to trigger Excel exports. Add UI tests or component checks verifying upload parsing, validation feedback, and table sorting interactions.

## 15. Printable Executive Credit Dossier Component
Goal: Create a clean one-page printable credit dossier modal with dedicated print stylesheets for executive credit committees.
Description: Implement `DossierModal.tsx` in `frontend/src/components/risk/` assembling debtor legal information, key risk badges, bank debt distribution, and the historical heatmap into a compact 1-page layout. Apply `@media print` CSS rules in `frontend/src/index.css` to remove navigation elements and format the dossier cleanly for physical printing or browser PDF saving. Ensure the modal includes a quick-trigger PDF download button wired to the backend export endpoint.

## 16. End-to-End Integration, Mock Toggle, and System Polish
Goal: Connect all frontend views to live backend endpoints, verify offline mock mode toggling, and perform complete system sanity checks.
Description: Wire all frontend views to the FastAPI backend, verifying seamless operation whether using live BCRA endpoints or offline mock mode via configuration toggles. Test real-world Argentine test CUITs and edge cases such as individuals with no debt history, high-risk debtors, and bounced check records. Conduct an end-to-end audit verifying error banners, loading indicators, responsive layouts, and cross-browser print functionality.

## 17. ArgentinaDatos REM API Client and Report Caching
Goal: Build an HTTP client to fetch market expectation reports from ArgentinaDatos API with local caching and offline fallbacks.
Description: Implement `backend/app/clients/rem_client.py` using HTTPX to query `/v1/finanzas/rem` for available report periods and `/v1/finanzas/rem/{año}/{mes}` for detailed indicator projections. Store retrieved reports in SQLite with a configurable time-to-live to prevent redundant network traffic to public APIs, backed by synthetic fallback data in `backend/app/clients/mock_data.py`. Write unit tests verifying payload normalization, error handling, and offline fallback behavior.

## 18. REM Consensus and Inflation Expectation Analysis Service
Goal: Implement the service layer to compute market consensus paths and compare actual INDEC inflation against historical REM forecasts.
Description: Create `backend/app/services/rem_service.py` to extract monthly inflation, official exchange rate paths, and interest rate curves from cached REM reports. Calculate expectation-versus-reality metrics by pairing actual INDEC CPI monthly figures with market expectations published in preceding REM reports, computing forecast error deltas and interquartile dispersion ($P_{25} - P_{75}$). Expose FastAPI routes under `/api/macro/rem/*` and write tests verifying surprise delta calculations and cohort filtering ("todos" vs. "top_10").

## 19. REM Expectations View Shell and Executive KPI Cards
Goal: Build the REM sub-view within Monitor Macroeconómico, including report selectors, cohort toggles, and executive summary cards.
Description: Implement `RemView.tsx` and `RemMetricCard.tsx` in `frontend/src/components/macro/rem/` with a sub-navigation toggle in `MacroView.tsx` to switch between "Series BCRA & FX" and "Expectativas REM". Provide controls to select published report dates and toggle between "Todos los participantes" and "Top 10 Más Precisos" cohorts. Add component tests ensuring that metric cards for 12-month expected inflation, next-month inflation, year-end exchange rate, and policy rate render accurately with appropriate consensus metrics.

## 20. REM CPI Expectation vs. Reality Chart and Forecast Cone
Goal: Build the interactive Recharts visualization comparing actual INDEC monthly inflation against historical REM forecasts and future projection cones.
Description: Implement `CpiExpectationChart.tsx` in `frontend/src/components/macro/rem/` displaying historical months with solid actual inflation bars and dashed previous-report expected inflation lines. Extend the timeline into future projection months using an expectation cone with shaded confidence bands representing the interquartile range ($P_{25} - P_{75}$) and full percentile spread ($P_{10} - P_{90}$). Write component tests verifying that historical delta bars and projection bands correctly parse backend comparison series and display rich tooltips on hover.

## 21. REM Nominal FX Trajectory and Consensus Breakdown Table
Goal: Build the nominal exchange rate projection chart and the multi-indicator detailed consensus breakdown table.
Description: Implement `FxProjectionChart.tsx` and `RemTable.tsx` in `frontend/src/components/macro/rem/` showing official exchange rate paths across future months alongside a comprehensive tabular breakdown. Structure the table with categorical filters (Precios, Tipo de Cambio, Tasas, Actividad) and monospace tabular columns for Median, Mean, Interquartile Range, Min/Max, and Participant counts. Add component tests verifying that category filters update table rows and that numeric values display with strict tabular monospace alignment.

## 22. Monitor Macroeconómico Headland Header and Navigation Polish
Goal: Update the top navigation bar to display solely "Monitor macroeconómico" without the "Series BCRA" badge.
Description: Modify `Navbar.tsx` in `frontend/src/components/layout/` to remove the badge property for the macro tab. Update `frontend/src/App.test.tsx` and associated UI tests to verify that the navbar displays the unadorned header "Monitor macroeconómico". Ensure all existing frontend test suites pass cleanly.

## 23. INDEC Official API Client and Caching Infrastructure
Goal: Implement a resilient HTTP client for api.indec.gob.ar authenticated with Bearer JWT tokens and backed by SQLite caching.
Description: Create `backend/app/clients/indec_client.py` using HTTPX with `INDEC_API_TOKEN` environment variable support. Define a dataset registry mapping standard economic variables (IPC, EMAE, IPI, Canastas, Desempleo, Balanza Comercial) to their PostgREST endpoints. Store fetched responses in the `indec_cache` table in `backend/app/database.py`. Write unit tests in `backend/tests/test_indec_client.py` verifying authentication headers, caching logic, and error handling for missing/invalid tokens.

## 24. INDEC Economic Data Service and REST Endpoints
Goal: Expose normalized FastAPI REST endpoints for INDEC indicators summary, variable catalog, and historical series.
Description: Build `backend/app/services/indec_service.py` to calculate latest indicator values, monthly/interannual variations, and normalized date points. Expose `GET /api/macro/indec/summary`, `GET /api/macro/indec/catalog`, and `GET /api/macro/indec/series/{variable_id}` in `backend/app/routes/indec_routes.py` and register them in `backend/app/main.py`. Write API integration tests in `backend/tests/test_indec_routes.py` verifying response payloads and error scenarios.

## 25. INDEC Macroeconomic Monitor View and Interactive Time-Series Board
Goal: Build the interactive frontend tab for INDEC real-economy data mirroring the BCRA variable monitor layout.
Description: Create `IndecView.tsx` in `frontend/src/components/macro/indec/` featuring the top 8 KPI cards, a categorized `VariablePicker` selector, and an interactive `MacroChart` supporting dual-axis comparison and timeframe toggles (1Y, 2Y, 5Y, Max). Add the third sub-navigation toggle in `MacroView.tsx` ("Variables INDEC & Economía Real"). Implement typed API methods in `frontend/src/services/api.ts` and write component tests in `frontend/src/components/macro/indec/__tests__/IndecView.test.tsx`.

## 26. Intelligent Variable Periodicity Resampling Engine
Goal: Implement intelligent variable periodicity resampling in the macroeconomic monitor based on financial taxonomy.
Description: Create `frontend/src/utils/resampler.ts` supporting dynamic aggregation ('Original', 'Mensual', 'Trimestral') across BCRA and INDEC time-series. Classify series by financial taxonomy: exchange rates/prices via arithmetic monthly averages, interest rates via compounded effective monthly rates (TEM), stocks/balances via end-of-period closing values, flows via cumulative sums, and official INDEC indices via official published values. Handle in-progress months with partial observation flags and dotted styling. Integrate the periodicity selector into `MacroChart.tsx` toolbar with contextual informative tooltips. Include comprehensive unit tests in `frontend/src/utils/resampler.test.ts` and component test coverage in `frontend/src/components/macro/MacroChart.test.tsx`.

## 27. Dynamic Base 100 Indexation and Multi-Series Normalization
Goal: Implement dynamic base 100 indexation and multi-series normalization in the macroeconomic chart.
Description: Create `frontend/src/utils/indexer.ts` supporting dynamic rebase of time-series to base 100 on the first visible business day ($t_0$) of the selected timeframe, with support for custom base date input. Rebase existing INDEC and BCRA index series, and chain monthly percentage variations into cumulative indices. Combine seamlessly with the constant-price inflation deflator (real purchasing power index). Consolidate multiple series into a single unified left Y-axis with a neutral horizontal $Y=100$ reference line. Update tooltips with indexed values, cumulative percentage variations, and native units. Support dual-column CSV exports and high-resolution PNG downloads with methodological annotations. Include unit tests in `frontend/src/utils/indexer.test.ts` and component test updates in `MacroChart.test.tsx`.

## 28. Banco de trabajo multivariable y motor de correlación cruzada
GitHub issue: #31

## Goal

Provide a cross-variable analytical workbench with a universal catalog pool across BCRA, INDEC, FX, and REM data, featuring multi-series normalization, rolling correlation analysis, and consolidated exports.

## Acceptance criteria

- [ ] Clicking on the `'workbench'` tab in `Navbar.tsx` labelled `"Banco de trabajo"` navigates to `WorkbenchView` and highlights the tab.
- [ ] Typing into `UniversalSearchBar` dynamically autocompletes matching series across BCRA, INDEC, FX, and REM catalogs.
- [ ] Each search result item displays its source badge (`[BCRA]`, `[INDEC]`, `[FX]`, `[REM]`), canonical name, and category.
- [ ] Selecting a search result adds the series to the active series tray and closes or clears the search dropdown.
- [ ] Series already present in the active series tray are disabled in the search results dropdown to prevent duplicate additions.
- [ ] The active series tray supports adding up to a maximum of 5 simultaneous series.
- [ ] Attempting to add a 6th series is disabled and shows an informative tooltip or message that the 5-series limit has been reached.
- [ ] Each active series chip displays its assigned distinctive color, source badge, name, individual loading status, and a removal button (`X`).
- [ ] Clicking the removal button removes the series from the tray, chart, and statistics table.
- [ ] If a series fails to load or experiences network timeout, its chip displays the resilient warning badge `"Dato demorado"` while the other active series continue to render normally.
- [ ] Quick timeframe buttons (`1M`, `3M`, `6M`, `1Y`, `5Y`, `Max`) update the visible date range across all active series.
- [ ] Custom date inputs (`desde` and `hasta`) allow manual date range filtering and validate chronological order.
- [ ] Toggling the switch `"Ajustar por inflación (términos reales)"` deflates eligible ARS monetary series using the official IPC series into constant currency.
- [ ] Non-ARS or ineligible series (percentages, indices, USD exchange rates) remain unaffected by the inflation switch and display an explanatory tooltip.
- [ ] The visual mode toggle allows switching between `"Serie temporal normalizada"` and `"Correlación móvil"`.
- [ ] In normalized time series mode, the user can toggle between `"Base 100 (t₀ = 100)"` and `"Variación porcentual (% Δ)"`.
- [ ] Monthly or quarterly series projected on a daily time axis are displayed with visual stepped forward-fill (`stepAfter`) styling.
- [ ] In rolling correlation mode, dropdown selectors allow picking `"Serie A"` and `"Serie B"` from the active series tray.
- [ ] In rolling correlation mode, the window selector supports `30 días`, `90 días`, and `180 días`.
- [ ] When mixing daily and monthly/quarterly series in rolling correlation mode, automatic monthly downsampling is applied and flagged to the user.
- [ ] The rolling correlation chart Y-axis is strictly bounded between -1.00 and +1.00 with a neutral zero reference line ($Y=0$).
- [ ] The bottom statistics table renders a row for each active series with columns for series name/source, latest value, latest date, period variation (%), minimum, maximum, and sample standard deviation.
- [ ] Numeric values in the statistics table use monospace tabular alignment (`font-mono` and `tabular-nums`).
- [ ] Clicking `"Exportar CSV"` generates and downloads a consolidated CSV file containing all active series aligned by date.
- [ ] Clicking `"Exportar Excel"` triggers a download of a consolidated multi-sheet Excel spreadsheet (`.xlsx`) with aligned series, statistics, and correlation matrix.
- [ ] All UI titles, section headers, tab labels, button copy, tooltips, and badges strictly follow sentence case (no Title Case).

## Out of scope

- Econometric cointegration tests (Engle-Granger, Johansen) and predictive Machine Learning models.
- Manual editing or cell overwriting of historical observations.
- 3D surface charts or scatter plot point clouds outside 2D time series and rolling correlation.

## Constraints

- Stay inside frontend components in `frontend/src/components/workbench/`, mathematical engines in `frontend/src/utils/alignment.ts` and `frontend/src/utils/correlation.ts`, navbar in `frontend/src/components/layout/Navbar.tsx`, backend routes in `backend/app/routes/` and services in `backend/app/services/`.
- Libraries: React, TypeScript, Tailwind CSS, Recharts, Lucide React, FastAPI, HTTPX, SQLite, openpyxl / ReportLab. No new npm or pip dependencies without prior approval.
- Follow strict sentence case for all titles, labels, badges, and documentation (no Title Case).
- Follow tabular numbers and design tokens defined in `_docs/design-system.md` and `AGENTS.md`.



