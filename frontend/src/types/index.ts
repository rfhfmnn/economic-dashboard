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
