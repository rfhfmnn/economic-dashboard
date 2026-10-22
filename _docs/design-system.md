# Design System & UI Specification — Economic & Credit Risk Dashboard (BCRA)

This document establishes the official visual design system, design tokens, typography, component specifications, and anti-drift guardrails for the **Economic & Credit Risk Dashboard**.

> [!IMPORTANT]
> **Anti-Drift Mandate:** Every AI agent, frontend engineer, and UI designer working on this codebase **must** adhere strictly to the tokens, color semantics, numeric formats, and component patterns defined herein. Do not invent arbitrary colors, font sizes, border radiuses, or layout hierarchies.

---

## 1. Design Philosophy & Aesthetic Foundation

The Economic & Credit Risk Dashboard is an **institutional-grade financial intelligence instrument** designed for economic and credit risk analysts, financial institutions, and credit committees.

### Core Tenets:
1. **Instrument, Not Graphic Art:** Every visual element must support fast perception, high-density data comparison, and decisive action. Avoid decorative widgets, arbitrary gradients, or non-data chrome.
2. **Tabular Precision:** Financial metrics, tax IDs, and debt values require strict numerical alignment (`tabular-nums` and monospace styling) and zero ambiguity.
3. **Preattentive Risk Communication:** Credit risk classifications (BCRA Situación 1 through 6) and early warning alerts follow a strict, universally recognized semantic color hierarchy.
4. **Institutional Dark & Light Theme Disciplined Tokens:** High-contrast, clean elevation with subtle 1px border separation (`border-slate-800` / `border-slate-200`) instead of heavy muddy drop shadows.
5. **Print Compliance:** The 1-page executive credit dossier must render with pixel-perfect clarity when printed or exported to PDF (`@media print`).

---

## 2. Color Palette & Semantic Tokens

### 2.1 Neutral Base Scales (Slate / Zinc)
The dashboard uses Tailwind's **Slate** palette as the primary neutral scale for both Dark and Light modes.

| Token | Light Mode Hex | Dark Mode Hex | Usage |
|---|---|---|---|
| `bg-app` | `#f8fafc` (`slate-50`) | `#090d16` (Deep Navy Slate) | Application canvas background |
| `bg-surface` | `#ffffff` (`white`) | `#0f172a` (`slate-900`) | Card containers, panels, modals |
| `bg-surface-elevated` | `#f1f5f9` (`slate-100`) | `#1e293b` (`slate-800`) | Hovered rows, inputs, table headers |
| `bg-surface-muted` | `#e2e8f0` (`slate-200`) | `#334155` (`slate-700`) | Pill backgrounds, inactive tabs, dividers |
| `border-subtle` | `#e2e8f0` (`slate-200`) | `#1e293b` (`slate-800`) | Default card & section borders |
| `border-strong` | `#cbd5e1` (`slate-300`) | `#334155` (`slate-700`) | Focus rings, active borders, table dividers |
| `text-primary` | `#0f172a` (`slate-900`) | `#f8fafc` (`slate-50`) | Primary metric values, headers, titles |
| `text-secondary` | `#475569` (`slate-600`) | `#94a3b8` (`slate-400`) | Metric labels, table column headers, helper text |
| `text-muted` | `#94a3b8` (`slate-400`) | `#64748b` (`slate-500`) | Timestamps, disabled text, secondary metadata |

---

### 2.2 BCRA Central de Deudores Credit Rating Scale (Situaciones 1 to 6)
The BCRA classifies borrowers into 6 standardized debt situations. **These colors must remain strictly consistent across the entire application** (heatmaps, badges, tables, charts, and dossiers):

| Situation | Official Classification | Severity | Solid Badge Token | Muted Heatmap Token | Hex Value |
|---|---|---|---|---|---|
| **Situación 1** | Normal / En situación normal | Optimal | `bg-emerald-600 text-white` | `bg-emerald-500/20 text-emerald-400 border-emerald-500/30` | `#059669` / `#10b981` |
| **Situación 2** | Con seguimiento especial / Riesgo bajo | Low / Watch | `bg-amber-500 text-slate-950` | `bg-amber-500/20 text-amber-400 border-amber-500/30` | `#d97706` / `#f59e0b` |
| **Situación 3** | Con problemas / Riesgo medio | Medium Warning | `bg-orange-500 text-white` | `bg-orange-500/20 text-orange-400 border-orange-500/30` | `#ea580c` / `#f97316` |
| **Situación 4** | Alto riesgo de insolvencia / Riesgo alto | High Alert | `bg-rose-600 text-white` | `bg-rose-500/20 text-rose-400 border-rose-500/30` | `#e11d48` / `#f43f5e` |
| **Situación 5** | Irrecuperable / Default | Critical Loss | `bg-red-700 text-white` | `bg-red-600/20 text-red-400 border-red-600/30` | `#b91c1c` / `#ef4444` |
| **Situación 6** | Irrecuperable por disposición técnica | Tech Loss | `bg-purple-800 text-white` | `bg-purple-600/20 text-purple-300 border-purple-600/30` | `#6b21a8` / `#a855f7` |

```css
/* Quick Reference Utility Mapping */
.risk-sit-1 { color: #10b981; background-color: rgba(16, 185, 129, 0.15); border-color: rgba(16, 185, 129, 0.3); }
.risk-sit-2 { color: #f59e0b; background-color: rgba(245, 158, 11, 0.15); border-color: rgba(245, 158, 11, 0.3); }
.risk-sit-3 { color: #f97316; background-color: rgba(249, 115, 22, 0.15); border-color: rgba(249, 115, 22, 0.3); }
.risk-sit-4 { color: #f43f5e; background-color: rgba(244, 63, 94, 0.15); border-color: rgba(244, 63, 94, 0.3); }
.risk-sit-5 { color: #ef4444; background-color: rgba(239, 68, 68, 0.15); border-color: rgba(239, 68, 68, 0.3); }
.risk-sit-6 { color: #c084fc; background-color: rgba(192, 132, 252, 0.15); border-color: rgba(192, 132, 252, 0.3); }
```

---

### 2.3 Early-Warning Risk Badges & System Status Tokens

| Alert / Status | Severity | Icon (Lucide) | Badge Classes (Dark Mode) |
|---|---|---|---|
| **Deterioration Alert** (Rating downgrade in last 6M) | High | `TrendingDown` | `bg-rose-950/50 text-rose-400 border border-rose-800/60` |
| **High Non-Bank Exposure** (>30% in Fintech / Trusts) | Medium | `Building2` / `AlertTriangle` | `bg-amber-950/50 text-amber-400 border border-amber-800/60` |
| **Recent Unpaid Checks** (Active cheques in last 90D) | High | `FileWarning` | `bg-red-950/50 text-red-400 border border-red-800/60` |
| **Debt Acceleration** (>50% YoY credit increase) | Medium | `Activity` / `Zap` | `bg-orange-950/50 text-orange-400 border border-orange-800/60` |
| **Clean Risk Profile** (No alerts, Sit 1 across 24M) | Normal | `CheckCircle2` | `bg-emerald-950/50 text-emerald-400 border border-emerald-800/60` |
| **System Status: Live BCRA** | Success | `Radio` (pulsing) | `bg-emerald-500/10 text-emerald-400 border border-emerald-500/20` |
| **System Status: Mock Fallback** | Warning | `ServerCog` | `bg-amber-500/10 text-amber-400 border border-amber-500/20` |
| **System Status: Offline / Error** | Error | `WifiOff` | `bg-rose-500/10 text-rose-400 border border-rose-500/20` |

---

### 2.4 Macroeconomic & Financial Series Chart Palette
When rendering multiple financial series in Recharts (Macro View & FX Spreads), assign colors according to their functional category:

| Indicator Category | Color Name | Hex Code | Visual Encoding |
|---|---|---|---|
| **International Reserves** (*Reservas*) | Emerald Teal | `#10b981` | Solid line with subtle gradient area fill |
| **Monetary Base** (*Base Monetaria*) | Institutional Blue | `#3b82f6` | Solid line with contrasting stroke |
| **Policy Rates** (*Tasa de Política / Pases*) | Vivid Violet | `#8b5cf6` | Stepped or solid line |
| **Official Exchange Rate** (*Mayorista A3500*) | Slate Gray | `#94a3b8` | Baseline dashed or thin line |
| **Financial Dólar MEP** | Sky Blue | `#0ea5e9` | Prominent medium line |
| **Financial Dólar CCL** (*Cable*) | Indigo | `#6366f1` | Prominent medium line |
| **Parallel Dólar Blue** | Amber Orange | `#f59e0b` | High-visibility line |
| **FX Spread %** (*Brecha Cambiaria*) | Rose Coral | `#f43f5e` | Dual-axis right-hand side line / bar |
| **Inflation Indices** (*CER / UVA / Badlar*) | Cyan / Fuchsia | `#06b6d4` / `#d946ef` | Differentiated secondary lines |

---

## 3. Typography & Numerical Formatting Standards

### 3.1 Font Families
- **Interface & Prose Font:** Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif (`font-sans`).
- **Data, Metrics, Tax IDs & Financial Tables:** JetBrains Mono, "Fira Code", monospace (`font-mono` + `tabular-nums`).

### 3.2 Type Hierarchy

| Level | Size | Weight | Tracking | Usage | Tailwind Classes |
|---|---|---|---|---|---|
| **Display / Hero KPI** | 2rem (32px) | Bold (700) | `-0.02em` | Main metric values in summary cards | `text-3xl font-bold font-mono tracking-tight text-slate-50` |
| **H1 Screen Title** | 1.5rem (24px) | SemiBold (600) | `-0.01em` | View titles (Macro Monitor, Central de Deudores) | `text-2xl font-semibold tracking-tight text-slate-100` |
| **H2 Section Header** | 1.125rem (18px) | SemiBold (600) | normal | Card titles, modal headers, table sections | `text-lg font-semibold text-slate-200` |
| **H3 Subsection Header**| 0.875rem (14px) | Medium (500) | normal | Chart legends, drawer titles, subheaders | `text-sm font-medium text-slate-300` |
| **Body Regular** | 0.875rem (14px) | Regular (400) | normal | General descriptions, modal body, table cells | `text-sm font-normal text-slate-300` |
| **Table Header / Label**| 0.75rem (12px) | Medium (500) | `+0.05em` | Column headers, KPI labels (UPPERCASE) | `text-xs font-medium uppercase tracking-wider text-slate-400` |
| **Caption / Timestamp** | 0.6875rem (11px)| Regular (400) | normal | Footers, sync timestamps, data sources | `text-[11px] font-normal text-slate-500` |

### 3.3 Strict Numerical & Locale Rules
Financial analysts expect standard notation. Never mix formats.

1. **Argentine Currency (ARS):**
   - Standard: `$ 1.250.000` (dots for thousands, comma for decimals).
   - Abbreviated Dashboard KPIs: `$ 1,25 M` (Millions) or `$ 4,82 B` (Billions). Always indicate units (`miles de $` or `$ M`).
2. **US Dollar (USD):**
   - Standard: `USD 1.150,00` or `US$ 1.150,00`.
3. **Percentages & Spreads:**
   - Always include the explicit sign for deltas: `+14,2%` (rose/green depending on meaning), `-2,8%`.
   - Brecha Cambiaria: Display with one decimal point (e.g. `24,5%`).
4. **Tax IDs (CUIT/CUIL):**
   - Must always be formatted as `XX-XXXXXXXX-X` (e.g., `30-50001091-2`).
   - Use `font-mono tracking-wider font-semibold`.
5. **Dates:**
   - Display format: `DD/MM/YYYY` (Argentine standard) or `DD MMM YYYY` (e.g. `22 Oct 2026`).
   - Timestamps: `DD/MM/YYYY HH:mm:ss`.

---

## 4. Spacing, Elevation & Layout Grid

### 4.1 Layout Dimensions
- **Max Canvas Width:** `max-w-7xl` (`1280px`) or full-bleed `w-full px-4 sm:px-6 lg:px-8`.
- **Vertical Spacing Rhythm:**
  - Section-to-section gap: `gap-6` (24px) or `space-y-6`.
  - Inner card padding: `p-5` or `p-6` (20px - 24px) for desktop; `p-4` (16px) for compact cards.
  - Card header to body gap: `mb-4`.

### 4.2 Elevation, Borders & Glassmorphism
- **No heavy muddy shadows:** Institutional finance UI uses crisp 1px borders for structure.
- **Card Styling Standard:**
  ```tsx
  className="bg-slate-900/90 border border-slate-800 rounded-lg shadow-sm backdrop-blur-sm"
  ```
- **Active / Interactive Hover:**
  ```tsx
  className="transition-all duration-150 hover:border-slate-700 hover:bg-slate-900"
  ```
- **Corner Radii:**
  - Metric Cards & Panels: `rounded-lg` (8px).
  - Buttons, Inputs, Dropdowns: `rounded-md` (6px).
  - Status Badges & Pills: `rounded-full` (9999px) or `rounded-md` (compact tags).
  - Heatmap Cells: `rounded-sm` (2px - 4px).

---

## 5. Component Specifications

### 5.1 Top Navigation & Header (`Navbar.tsx` / `Header.tsx`)
- **Structure:**
  - Left: Logo / Brand badge (`BCRA Monitor` or `Credit Risk Screener`), institution title, environment indicator (`PRODUCTION` / `MOCK MODE`).
  - Center: Segmented tab switcher (`Macro & FX Monitor` | `Credit Risk Screener` | `Batch Portfolio`).
  - Right: System connectivity pill (Live API vs Mock, DB sync timestamp) + theme toggle (if enabled).
- **Segmented Tab Switcher Spec:**
  - Container: `bg-slate-950 p-1 rounded-lg border border-slate-800 inline-flex`.
  - Active Tab: `bg-slate-800 text-white shadow-sm font-medium px-4 py-2 rounded-md transition-all text-sm`.
  - Inactive Tab: `text-slate-400 hover:text-slate-200 px-4 py-2 rounded-md transition-all text-sm`.

---

### 5.2 Macro KPI Metric Card (`MetricCard.tsx`)
- **Visual Anatomy:**
  1. Top Row: Metric Label (uppercase `text-xs font-medium text-slate-400`) + Category Icon or Variable ID pill (`text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-400`).
  2. Main Row: Formatted Value (`text-2xl font-bold font-mono text-slate-50`) + Currency unit.
  3. Bottom Row: Delta / Trend badge (`+1,8% vs mes anterior`) with `TrendingUp` or `TrendingDown` + mini sparkline or baseline reference.
- **Delta Rules:**
  - For positive financial metrics (Reserves): Increase = Green (`text-emerald-400`), Decrease = Red (`text-rose-400`).
  - For inflation/risk metrics (Inflation, FX Spread): Increase = Red/Amber, Decrease = Green.

---

### 5.3 CUIT Search & Validation Input (`CuitSearchInput.tsx`)
- **Requirements:**
  - Automatic input formatting (inserts hyphens `XX-XXXXXXXX-X` on type).
  - Instant client-side **AFIP Módulo 11 validation**:
    - Valid CUIT: Shows green checkmark icon (`Check` in `text-emerald-400`) and enables search button.
    - Invalid CUIT: Shows error state (`border-rose-500/80 focus:ring-rose-500`), displays descriptive message (`"CUIT inválido: dígito verificador no coincide"`), and disables search trigger.
  - Keyboard Support: `Enter` triggers query automatically.
  - Quick Samples: Provide 2-3 clickable sample CUIT chips (e.g., Company with Sit 1, Debtor with Sit 4 + Checks, Multi-bank borrower) for rapid testing.

---

### 5.4 24-Month Debt Trajectory Matrix (`HistoryHeatmap.tsx`)
The centerpiece of the Credit Risk Screener.

- **Layout Structure:**
  - Rows: One row per financial entity (Bank / Fintech / Trust) + One row for "Worst Situation Summary".
  - Columns: 24 contiguous monthly blocks, ordered chronologically (oldest on left, most recent on right).
  - Cell Dimensions: Square or subtle rectangle (`w-7 h-7 sm:w-8 h-8 rounded-sm`).
- **Cell Content & Interaction:**
  - Inside each cell: The situation number (e.g., `1`, `2`, `4`) in bold monospace font.
  - Background color strictly mapped to the Situación 1-6 palette.
  - Hover / Focus: Interactive tooltip detailing Month/Year (e.g., `Mar 2026`), Entity Name, Amount owed (thousands of ARS), and Days past due.
  - Legend: Persistent horizontal key below the heatmap showing color blocks for Situación 1 through 6.

---

### 5.5 Entity Breakdown & Bounced Checks Tables (`DebtEntityTable.tsx`, `BouncedChecks.tsx`)
- **Styling Rules:**
  - Table Header: `bg-slate-950/60 text-slate-400 text-xs font-medium uppercase tracking-wider py-3 px-4 border-b border-slate-800 text-left`.
  - Numerical Columns: Right-aligned (`text-right font-mono`), including Debt Amount and Days Past Due.
  - Row Alternation: Subtle hover state `hover:bg-slate-800/50 transition-colors`.
  - Empty Checks State: Clean green banner: *"No se registran cheques rechazados en los últimos 24 meses"*.
  - Unpaid Check Highlight: If a bounced check is `unpaid` (*No abonado*), highlight the status pill in `bg-red-950/50 text-red-400 border border-red-800`.

---

### 5.6 Batch Portfolio Upload & Comparative Board (`FileUploadZone.tsx`, `PortfolioTable.tsx`)
- **Upload Dropzone:**
  - Dashed border `border-2 border-dashed border-slate-700 hover:border-slate-500 rounded-lg p-8 text-center transition-all bg-slate-900/40`.
  - Supports `.csv` and `.txt`. Displays file name, detected CUIT count, and validation summary (e.g. `24 válidos, 2 descartados por Módulo 11`).
- **Comparative Ranking Table:**
  - Default sort: Worst Situation (descending: 6 to 1) -> Total Exposure -> Active Alerts.
  - Sticky table header on scroll (`sticky top-0 bg-slate-900`).
  - Action buttons: "Ver Detalle" (loads single CUIT view) and "Exportar Excel" (`Download` icon).

---

### 5.7 Charts & Recharts Visual Specifications
- **Axis Styling:**
  - XAxis & YAxis: `stroke="#64748b" fontSize={11} tickLine={false} axisLine={{ stroke: '#334155' }}`.
  - CartesianGrid: `stroke="#1e293b" strokeDasharray="3 3" vertical={false}`.
- **Custom Tooltip Glassmorphism:**
  ```tsx
  <div className="bg-slate-900/95 border border-slate-700 p-3 rounded-lg shadow-xl text-xs backdrop-blur-md">
    <p className="text-slate-400 font-medium mb-1.5">{label}</p>
    {payload.map((item) => (
      <div key={item.name} className="flex items-center justify-between gap-4 py-0.5">
        <span className="flex items-center gap-1.5 text-slate-300">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
          {item.name}
        </span>
        <span className="font-mono font-semibold text-slate-100">{item.value}</span>
      </div>
    ))}
  </div>
  ```
- **Timeframe Selector Pills:**
  - Set options: `1M`, `3M`, `6M`, `1Y`, `5Y`, `MAX`.
  - Compact button group: `text-xs font-medium px-2.5 py-1 rounded border border-slate-800`.

---

## 6. Executive 1-Page Credit Dossier (`@media print` Spec)

The Dossier must strictly format into a **single printed A4 / Letter page**.

```css
@media print {
  /* 1. Page Dimensions & Zero Margin Budget */
  @page {
    size: A4 portrait;
    margin: 10mm 12mm 10mm 12mm;
  }

  /* 2. Chrome Removal */
  nav, header, .no-print, button, input, .tab-switcher, .system-status {
    display: none !important;
  }

  /* 3. High-Contrast Print Theme */
  body, .dossier-container {
    background-color: #ffffff !important;
    color: #0f172a !important;
    font-size: 10pt !important;
    box-shadow: none !important;
  }

  /* 4. Keep Visual Contrast on Badges & Heatmaps */
  * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  /* 5. Prevent Element Splitting */
  .dossier-card, .dossier-header, .dossier-matrix, .dossier-table {
    break-inside: avoid !important;
    page-break-inside: avoid !important;
  }

  /* 6. Crisp Borders for Print */
  .dossier-border {
    border: 1px solid #cbd5e1 !important;
  }
}
```

### Dossier Page Budget (Top to Bottom):
1. **Header (12% page height):** Institution Title, CUIT, Official Denomination, Assessment Date, Worst Situation Stamp.
2. **Key Indicators Grid (18% page height):** Total Debt (ARS), Entity Count, Worst Current Situation, Active Warning Badges.
3. **24-Month Trajectory Heatmap (25% page height):** Compact version of the 24-month grid with color legend.
4. **Entity Exposure Table (25% page height):** Top 5 lenders with balances, days past due, and participation share.
5. **Bounced Checks & Final Observations (20% page height):** Cheques summary, analyst notes signoff block.

---

## 7. Anti-Drift Checklist for AI Agents & Developers

Before submitting any frontend component, style change, or review handoff, check off this mandatory verification list:

- [ ] **Color Fidelity:** Did you use the official BCRA Situación 1-6 tokens (`emerald`, `amber`, `orange`, `rose`, `red`, `purple`) without altering shades?
- [ ] **Tabular Numerals:** Are all monetary values, percentages, CUITs, and debt balances styled with `font-mono` and right-aligned in tables?
- [ ] **Currency Formatting:** Are ARS values formatted using standard thousand separators (`$ 1.250.000` or `$ 1,25 M`)?
- [ ] **CUIT Formatting:** Is CUIT rendered as `XX-XXXXXXXX-X` with client-side Módulo 11 validation on inputs?
- [ ] **Card Elevation:** Are cards styled with subtle `border-slate-800` instead of arbitrary heavy box-shadows or saturated colored borders?
- [ ] **Interactive States:** Do buttons, tabs, and table rows have appropriate hover, focus-visible, and disabled states?
- [ ] **Loading & Empty States:** Are skeleton loaders used instead of abrupt layout shifts, and do empty tables display informative feedback?
- [ ] **Print Isolation:** If touching the dossier, does it fit within a single A4 page under `@media print` with navigation elements hidden?

---

## 8. Tailwind CSS Configuration Extension Reference

To ensure consistent class availability, ensure `frontend/tailwind.config.js` extends these custom theme aliases:

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        app: {
          dark: '#090d16',
          surface: '#0f172a',
          elevated: '#1e293b',
          muted: '#334155',
        },
        risk: {
          1: '#10b981', // Situación 1 - Normal
          2: '#f59e0b', // Situación 2 - Seguimiento especial
          3: '#f97316', // Situación 3 - Con problemas
          4: '#f43f5e', // Situación 4 - Alto riesgo
          5: '#ef4444', // Situación 5 - Irrecuperable
          6: '#c084fc', // Situación 6 - Irrecuperable por disp. técnica
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
};
```
