/**
 * Deflation engine for Argentine macroeconomic time-series using INDEC CPI (IPC Nacional).
 */

import type { CpiPoint, MacroSeriesPoint } from '../types'
import { KNOWN_BCRA_VARIABLES } from '../types'

const MONTH_NAMES_ES: Record<string, string> = {
  '01': 'Ene',
  '02': 'Feb',
  '03': 'Mar',
  '04': 'Abr',
  '05': 'May',
  '06': 'Jun',
  '07': 'Jul',
  '08': 'Ago',
  '09': 'Sep',
  '10': 'Oct',
  '11': 'Nov',
  '12': 'Dic',
}

const FULL_MONTH_NAMES_ES: Record<string, string> = {
  '01': 'Enero',
  '02': 'Febrero',
  '03': 'Marzo',
  '04': 'Abril',
  '05': 'Mayo',
  '06': 'Junio',
  '07': 'Julio',
  '08': 'Agosto',
  '09': 'Septiembre',
  '10': 'Octubre',
  '11': 'Noviembre',
  '12': 'Diciembre',
}

/**
 * Format a canonical YYYY-MM or YYYY-MM-DD date into localized Spanish short period (e.g. 'Ago-2026').
 */
export function formatBaseMonth(dateStr?: string, full: boolean = false): string {
  if (!dateStr || dateStr.length < 7) return ''
  const year = dateStr.slice(0, 4)
  const month = dateStr.slice(5, 7)
  const dict = full ? FULL_MONTH_NAMES_ES : MONTH_NAMES_ES
  const monthName = dict[month] || month
  return full ? `${monthName} ${year}` : `${monthName}-${year}`
}

/**
 * Determines whether a macroeconomic series is eligible to be deflated into constant ARS purchasing power.
 *
 * Eligible: ARS monetary amounts (e.g. Base monetaria #15, Billetes y monedas #16, Depósitos #35, Préstamos #34, ARS M).
 * Ineligible:
 *  - Percentage rates (% / % TNA: BADLAR #7, Tasa de política #6, Inflación #27, #28)
 *  - Foreign currency amounts (USD / USD M: Reservas #1, #74, #77)
 *  - Indices (CER #29, UVA #30, UVI #31)
 *  - Exchange rates (ARS/USD #4, #5)
 */
export function isSeriesEligibleForDeflation(series: {
  id?: number | string
  unit?: string
  title?: string
}): boolean {
  const numId = typeof series.id === 'number' ? series.id : Number(String(series.id || '').replace(/\D/g, ''))

  // Explicit ineligible known BCRA IDs
  const explicitIneligibleIds = new Set([
    1,   // Reservas internacionales (USD M)
    4,   // Tipo de cambio oficial mayorista (ARS/USD)
    5,   // Tipo de cambio minorista (ARS/USD)
    6,   // Tasa de política monetaria (% TNA)
    7,   // Tasa BADLAR (% TNA)
    11,  // Tasa BAIBAR (% TNA)
    27,  // Inflación intermensual (%)
    28,  // Inflación interanual (%)
    29,  // CER (Índice)
    30,  // UVA (Índice / Unidad)
    31,  // UVI (Índice / Unidad)
    74,  // Reservas internacionales sin DEG (USD M)
    77,  // Reservas variación diaria (USD M)
  ])

  if (numId && explicitIneligibleIds.has(numId)) {
    return false
  }

  // Explicit eligible known BCRA IDs (ARS stocks)
  const explicitEligibleIds = new Set([
    15,  // Base monetaria total (ARS M)
    16,  // Billetes y monedas en circulación (ARS M)
    34,  // Préstamos al sector privado (ARS M)
    35,  // Depósitos a plazo fijo (ARS M)
  ])

  if (numId && explicitEligibleIds.has(numId)) {
    return true
  }

  const rawUnit = (series.unit || (numId && KNOWN_BCRA_VARIABLES[numId]?.unit) || '').trim().toUpperCase()
  const rawTitle = (series.title || (numId && KNOWN_BCRA_VARIABLES[numId]?.name) || '').toLowerCase()

  // Ineligible keywords in unit
  if (
    rawUnit.includes('%') ||
    rawUnit.includes('USD') ||
    rawUnit.includes('DOLAR') ||
    rawUnit.includes('DÓLAR') ||
    rawUnit.includes('INDICE') ||
    rawUnit.includes('ÍNDICE') ||
    rawUnit.includes('/USD')
  ) {
    return false
  }

  // Ineligible keywords in title
  if (
    rawTitle.includes('tasa') ||
    rawTitle.includes('inflación') ||
    rawTitle.includes('inflacion') ||
    rawTitle.includes('tipo de cambio') ||
    rawTitle.includes('reservas') ||
    rawTitle.includes('cer') ||
    rawTitle.includes('uva') ||
    rawTitle.includes('uvi') ||
    rawTitle.includes('índice') ||
    rawTitle.includes('indice') ||
    rawTitle.includes('brecha')
  ) {
    return false
  }

  // Positive eligibility indicator: unit mentions ARS, $, Pesos, or contains monetary aggregate
  if (
    rawUnit.includes('ARS') ||
    rawUnit.includes('$') ||
    rawUnit.includes('PESO') ||
    rawTitle.includes('base monetaria') ||
    rawTitle.includes('billetes') ||
    rawTitle.includes('depósitos') ||
    rawTitle.includes('depositos') ||
    rawTitle.includes('préstamos') ||
    rawTitle.includes('prestamos') ||
    rawTitle.includes('circulación') ||
    rawTitle.includes('circulacion')
  ) {
    return true
  }

  return false
}

export interface DeflatorModel {
  baseMonth: string // YYYY-MM
  baseMonthFormatted: string // e.g. 'Ago-2026'
  baseIndex: number
  factorByMonth: Map<string, number>
  latestCpiMonth: string
  hasCpiData: boolean
}

/**
 * Builds the cumulative price index model and computes deflation factors for each month:
 *
 * Formula:
 *  I_0 = 100
 *  I_t = I_{t-1} * (1 + \pi_t / 100)
 *  Factor(m) = I_{base} / I_m
 */
export function buildDeflatorModel(cpiPoints: CpiPoint[]): DeflatorModel {
  if (!cpiPoints || cpiPoints.length === 0) {
    return {
      baseMonth: '',
      baseMonthFormatted: '',
      baseIndex: 100,
      factorByMonth: new Map<string, number>(),
      latestCpiMonth: '',
      hasCpiData: false,
    }
  }

  // Sort ascending by date
  const sorted = [...cpiPoints].sort((a, b) => a.fecha.localeCompare(b.fecha))

  // Accumulate index if not present or inconsistent
  const indexByMonth = new Map<string, number>()
  let cumulative = 100.0

  sorted.forEach((pt, idx) => {
    const monthKey = pt.fecha.slice(0, 7)
    if (idx === 0) {
      cumulative = pt.indice && pt.indice > 0 ? pt.indice : 100.0
    } else {
      if (pt.indice && pt.indice > 0) {
        cumulative = pt.indice
      } else {
        cumulative = cumulative * (1.0 + (pt.valor || 0) / 100.0)
      }
    }
    indexByMonth.set(monthKey, cumulative)
  })

  const latestPoint = sorted[sorted.length - 1]
  const latestCpiMonth = latestPoint.fecha.slice(0, 7)
  const baseMonth = latestCpiMonth
  const baseIndex = indexByMonth.get(baseMonth) || cumulative
  const baseMonthFormatted = formatBaseMonth(baseMonth)

  // Factor(m) = I_base / I_m
  const factorByMonth = new Map<string, number>()
  indexByMonth.forEach((idxVal, mKey) => {
    const factor = idxVal > 0 ? baseIndex / idxVal : 1.0
    factorByMonth.set(mKey, factor)
  })

  return {
    baseMonth,
    baseMonthFormatted,
    baseIndex,
    factorByMonth,
    latestCpiMonth,
    hasCpiData: true,
  }
}

/**
 * Deflates a list of series observations using the provided monthly deflator factors.
 * Observations in months later than latest published CPI month fallback to factor 1.0 (nominal)
 * and trigger hasPendingCpi = true.
 */
export function deflateSeries(
  points: MacroSeriesPoint[],
  deflator: DeflatorModel
): { deflatedPoints: MacroSeriesPoint[]; hasPendingCpi: boolean } {
  if (!deflator.hasCpiData || points.length === 0) {
    return { deflatedPoints: points, hasPendingCpi: false }
  }

  let hasPendingCpi = false

  const deflatedPoints = points.map((p) => {
    const monthKey = p.fecha.slice(0, 7)

    if (deflator.latestCpiMonth && monthKey > deflator.latestCpiMonth) {
      hasPendingCpi = true
      return { fecha: p.fecha, valor: p.valor }
    }

    const factor = deflator.factorByMonth.get(monthKey) ?? 1.0
    const realValue = p.valor * factor

    return {
      fecha: p.fecha,
      valor: Math.round(realValue * 100) / 100,
    }
  })

  return { deflatedPoints, hasPendingCpi }
}
