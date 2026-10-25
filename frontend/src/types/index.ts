/**
 * TypeScript domain type definitions for Economic & Credit Risk Dashboard (BCRA).
 */

export type TabType = 'macro' | 'screener' | 'batch'

export interface SystemStatusResponse {
  status: string
  system: string
  bcra_connected: boolean
  dolarapi_connected: boolean
  offline_mode: boolean
  cached_records?: {
    macro_series: number
    cuits: number
  }
  timestamp: string
}

// -------------------------------------------------------------
// Macroeconomic & FX Interfaces
// -------------------------------------------------------------

export interface MacroIndicator {
  idVariable: number
  descripcion: string
  valor: number
  fecha: string
  categoria: string
  unit?: string
}

export interface MacroSeriesPoint {
  fecha: string
  valor: number
}

export interface MacroSeriesResponse {
  id_variable: number
  variable_name: string
  count: number
  data: MacroSeriesPoint[]
}

export interface VariableCatalogItem {
  idVariable: number
  descripcion: string
  categoria?: string
  unit?: string
}

export const KNOWN_BCRA_VARIABLES: Record<number, { name: string; unit?: string }> = {
  1: { name: 'Reservas internacionales', unit: 'USD M' },
  4: { name: 'Tipo de cambio oficial (A3500)', unit: 'ARS/USD' },
  5: { name: 'Tipo de cambio minorista', unit: 'ARS/USD' },
  6: { name: 'Tasa de política monetaria', unit: '% TNA' },
  7: { name: 'Tasa BADLAR bancos privados', unit: '% TNA' },
  15: { name: 'Base monetaria total', unit: 'ARS M' },
  27: { name: 'Inflación intermensual', unit: '%' },
  28: { name: 'Inflación interanual', unit: '%' },
  29: { name: 'Índice de precios al consumidor (CER)', unit: 'Índice' },
  30: { name: 'Unidad de valor adquisitivo (UVA)', unit: 'ARS' },
  31: { name: 'Unidad de vivienda (UVI)', unit: 'ARS' },
  34: { name: 'Préstamos al sector privado', unit: 'ARS M' },
  35: { name: 'Depósitos a plazo fijo', unit: 'ARS M' },
  74: { name: 'Reservas internacionales (sin DEG 2009)', unit: 'USD M' },
  77: { name: 'Reservas internacionales (variación diaria)', unit: 'USD M' },
}

export interface FxRate {
  moneda: string
  nombre: string
  compra: number
  venta: number
  fechaActualizacion: string
}

export interface FxSpreadItem {
  tipo: string
  oficial_venta: number
  paralelo_venta: number
  brecha_porcentaje: number
  timestamp: string
}

export interface FxSpreadsResponse {
  oficial_base: number
  rates: Record<string, FxRate>
  spreads: Record<string, FxSpreadItem>
  timestamp: string
}

export interface FxHistoryPoint {
  fecha: string
  valor: number
  compra?: number
  venta?: number
}

export interface FxHistoryResponse {
  rates: {
    oficial: FxHistoryPoint[]
    mep: FxHistoryPoint[]
    ccl: FxHistoryPoint[]
    blue: FxHistoryPoint[]
  }
  last_updated?: string
  source?: string
}

export interface IndicatorsSummaryResponse {
  indicators: MacroIndicator[]
  fx_summary: Record<string, any>
  timestamp: string
}

// -------------------------------------------------------------
// Credit Risk & Central de Deudores Interfaces
// -------------------------------------------------------------

export interface AlertBadge {
  id: string
  name: string
  severity: 'low' | 'medium' | 'high' | 'critical' | 'normal'
  description: string
}

export interface DebtEntity {
  entidad: string
  situacion: number
  monto: number
  diasAtraso?: number
}

export interface HistoryPoint {
  periodo: string
  situacion: number
}

export interface BouncedCheckItem {
  numeroCheque?: string
  fechaRechazo: string
  monto: number
  causal?: string
  pagado?: boolean
  fechaPago?: string | null
  estadoMulta?: string
}

export interface BouncedCheckSummary {
  cantidad: number
  total_monto: number
  detalles?: BouncedCheckItem[]
}

export interface DebtorReport {
  cuit: string
  cuit_formateado: string
  denominacion: string
  peor_situacion: number
  deuda_total: number
  nivel_riesgo: string
  periodo?: string
  entidades: DebtEntity[]
  historia_24m: HistoryPoint[]
  cheques_rechazados: BouncedCheckSummary
  alertas_tempranas: AlertBadge[]
  resumen?: {
    entidades_count: number
    cheques_count: number
    cheques_monto: number
    alerts_count: number
  }
}

// -------------------------------------------------------------
// Batch Portfolio Interfaces
// -------------------------------------------------------------

export interface BatchDebtorItem {
  cuit: string
  cuit_formateado: string
  denominacion: string
  peor_situacion: number
  deuda_total: number
  nivel_riesgo: string
  cantidad_entidades: number
  total_cheques_rechazados: number
  alertas_tempranas: AlertBadge[]
  entidades?: DebtEntity[]
}

export interface BatchInvalidItem {
  raw: string
  error: string
}

export interface BatchPortfolioResponse {
  portfolio_name: string
  total_cuits: number
  valid_count: number
  invalid_count: number
  total_debt: number
  peor_situacion_portfolio: number
  debtors: BatchDebtorItem[]
  invalid_items: BatchInvalidItem[]
  timestamp: string
}

// -------------------------------------------------------------
// REM (Relevamiento de Expectativas de Mercado) Interfaces
// -------------------------------------------------------------

export type RemCohort = 'todos' | 'top_10'

export interface RemKpiItem {
  value: number
  period: string
  unit: string
  p25: number
  p75: number
  top10_divergence: number
  divergence_flag: boolean
}

export interface RemDivergenceAlert {
  indicador: string
  periodo: string
  todos_mediana: number
  top10_mediana: number
  divergence: number
  unidad: string
}

export interface RemSummaryResponse {
  report_period: string
  report_date: string
  cohort: RemCohort
  kpis: {
    cpi_next_month: RemKpiItem
    cpi_12m: RemKpiItem
    fx_year_end: RemKpiItem
    policy_rate: RemKpiItem
  }
  divergence_alerts: RemDivergenceAlert[]
  total_participants: number
}

export interface RemSparklinePoint {
  period: string
  value: number
}

export interface RemModularHorizonData {
  value: number
  unit: string
  period: string
  p25: number
  p75: number
  top10_divergence: number
  divergence_flag: boolean
  future_sparkline: RemSparklinePoint[]
  historical_sparkline: RemSparklinePoint[]
}

export interface RemAvailableHorizon {
  id: string
  name: string
}

export interface RemModularVariableData {
  id: string
  name: string
  category: string
  is_monthly: boolean
  is_quarterly: boolean
  default_horizon: string
  available_horizons: RemAvailableHorizon[]
  horizons: Record<string, RemModularHorizonData>
}

export interface RemModularKpisResponse {
  report_period: string
  cohort: RemCohort
  variables: Record<string, RemModularVariableData>
}

export interface RemCpiComparisonPoint {
  period: string
  period_label: string
  real_cpi: number
  expected_cpi: number
  surprise_delta: number
  p25: number
  p75: number
  dispersion: number
  direction: 'overshoot' | 'undershoot' | 'inline'
}

export interface RemCpiComparisonResponse {
  cohort: RemCohort
  lookback_months: number
  summary: {
    mean_absolute_error: number
    average_bias: number
    latest_month: string
    latest_surprise: number
    latest_direction: string
  }
  series: RemCpiComparisonPoint[]
}

export interface RemForecastConePoint {
  period: string
  mediana: number
  promedio: number
  p10: number
  p25: number
  p75: number
  p90: number
  minimo: number
  maximo: number
  iqr_lower: number
  iqr_upper: number
  band_iqr: number
  p10_p90_lower: number
  p10_p90_upper: number
  participantes: number
}

export interface RemForecastConeResponse {
  variable: string
  indicator_name: string
  unit: string
  report_period: string
  cohort: RemCohort
  points: RemForecastConePoint[]
}

export interface RemTableRow {
  indicador: string
  categoria: string
  periodo: string
  periodoTipo: string
  unidad: string
  mediana: number
  promedio: number
  desvio: number
  p10: number
  p25: number
  p75: number
  p90: number
  minimo: number
  maximo: number
  participantes: number
  top10_divergence: number
  divergence_flag: boolean
}

export interface RemTableResponse {
  report_period: string
  cohort: RemCohort
  category_filter: string
  total_records: number
  categories: string[]
  rows: RemTableRow[]
}
