/**
 * Temporal periodicity resampling engine for Argentine macroeconomic and financial time-series.
 * Dynamically harmonizes BCRA and INDEC series into monthly or quarterly periods
 * according to financial taxonomies.
 */

import type { ChartSeries } from '../components/macro/MacroChart'
import type { MacroSeriesPoint, Periodicity, SeriesTaxonomy, ResampledPoint } from '../types'
import { KNOWN_BCRA_VARIABLES } from '../types'

export type { Periodicity, SeriesTaxonomy, ResampledPoint }

export interface ResampledSeriesResult {
  id: number | string
  title: string
  unit?: string
  data: ResampledPoint[]
  axis: 'left' | 'right'
  color: string
  strokeDasharray?: string
  taxonomy: SeriesTaxonomy
  aggregationMethod: string
  periodicity: Periodicity
  hasPartialPeriod: boolean
}

/**
 * Infer the financial taxonomy of a macroeconomic time series based on ID, unit, and title metadata.
 */
export function inferSeriesTaxonomy(series: {
  id?: number | string
  title?: string
  unit?: string
}): SeriesTaxonomy {
  const numId = typeof series.id === 'number' ? series.id : Number(String(series.id || '').replace(/\D/g, ''))

  // Explicit known BCRA catalog variable IDs
  if (numId) {
    switch (numId) {
      // Exchange rates
      case 4: // Tipo de cambio oficial (A3500)
      case 5: // Tipo de cambio minorista
        return 'fx'

      // Interest rates (% TNA)
      case 6: // Tasa de política monetaria
      case 7: // Tasa BADLAR bancos privados
      case 11: // Tasa BAIBAR
        return 'rate'

      // Balance sheet stocks (ARS M / USD M)
      case 1: // Reservas internacionales
      case 15: // Base monetaria total
      case 16: // Billetes y monedas en circulación
      case 34: // Préstamos al sector privado
      case 35: // Depósitos a plazo fijo
      case 74: // Reservas sin DEG
        return 'stock'

      // Cumulative flows
      case 77: // Reservas variación diaria
        return 'flow'

      // Indices & inflation rates
      case 27: // Inflación intermensual
      case 28: // Inflación interanual
      case 29: // CER (Índice)
      case 30: // UVA (Unidad)
      case 31: // UVI (Unidad)
        return 'index'
    }
  }

  const rawUnit = (series.unit || (numId && KNOWN_BCRA_VARIABLES[numId]?.unit) || '').trim().toLowerCase()
  const rawTitle = (series.title || (numId && KNOWN_BCRA_VARIABLES[numId]?.name) || '').trim().toLowerCase()

  // Rates
  if (
    rawUnit.includes('% tna') ||
    rawUnit.includes('% tea') ||
    rawUnit === '% tna' ||
    rawUnit === 'tna' ||
    rawTitle.includes('tasa de interés') ||
    rawTitle.includes('tasa badlar') ||
    rawTitle.includes('tasa de política') ||
    rawTitle.includes('tasa nominal anual')
  ) {
    return 'rate'
  }

  // FX rates
  if (
    rawUnit.includes('ars/usd') ||
    rawUnit.includes('usd/ars') ||
    rawTitle.includes('tipo de cambio') ||
    rawTitle.includes('dólar') ||
    rawTitle.includes('cotización') ||
    rawTitle.includes('mep') ||
    rawTitle.includes('ccl') ||
    rawTitle.includes('blue')
  ) {
    return 'fx'
  }

  // Stocks
  if (
    rawTitle.includes('reserva') ||
    rawTitle.includes('base monetaria') ||
    rawTitle.includes('depósito') ||
    rawTitle.includes('préstamo') ||
    rawTitle.includes('saldo') ||
    rawTitle.includes('patrimonio') ||
    rawTitle.includes('circulación')
  ) {
    return 'stock'
  }

  // Flows
  if (
    rawTitle.includes('flujo') ||
    rawTitle.includes('variación diaria') ||
    rawTitle.includes('balanza comercial') ||
    rawTitle.includes('superávit') ||
    rawTitle.includes('déficit')
  ) {
    return 'flow'
  }

  // Indices / native monthly indicators
  if (
    rawUnit.includes('índice') ||
    rawUnit.includes('indice') ||
    rawTitle.includes('ipc') ||
    rawTitle.includes('inflación') ||
    rawTitle.includes('índice') ||
    rawTitle.includes('indice') ||
    rawTitle.includes('cer') ||
    rawTitle.includes('uva') ||
    rawTitle.includes('uvi') ||
    rawTitle.includes('emae') ||
    rawTitle.includes('ipi')
  ) {
    return 'index'
  }

  if (rawUnit.includes('%')) {
    return 'rate'
  }

  return 'stock'
}

/**
 * Returns localized sentence case badge label explaining the aggregation rule applied.
 */
export function getTaxonomyAggregationLabel(taxonomy: SeriesTaxonomy, periodicity: Periodicity): string {
  if (periodicity === 'original') {
    return 'Frecuencia original'
  }

  if (periodicity === 'mensual') {
    switch (taxonomy) {
      case 'fx':
        return 'Promedio mensual'
      case 'rate':
        return 'Tasa efectiva mensual capitalizada (TEM)'
      case 'stock':
        return 'Saldo de cierre fin de período'
      case 'flow':
        return 'Suma acumulada mensual'
      case 'index':
        return 'Valor oficial mensual'
    }
  }

  // trimestral
  switch (taxonomy) {
    case 'fx':
      return 'Promedio trimestral'
    case 'rate':
      return 'Tasa efectiva trimestral capitalizada (TET)'
    case 'stock':
      return 'Saldo de cierre fin de trimestre'
    case 'flow':
      return 'Suma acumulada trimestral'
    case 'index':
      return 'Valor oficial trimestral'
  }
}

/**
 * Number of days in a calendar month (1-based: month 1 = January).
 * Naturally accounts for leap years.
 */
export function getDaysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/**
 * Returns the calendar days between two ISO date strings (YYYY-MM-DD).
 */
export function getDaysBetween(dateA: string, dateB: string): number {
  const [y1, m1, d1] = dateA.slice(0, 10).split('-').map(Number)
  const [y2, m2, d2] = dateB.slice(0, 10).split('-').map(Number)
  const utcA = Date.UTC(y1, m1 - 1, d1)
  const utcB = Date.UTC(y2, m2 - 1, d2)
  return Math.round((utcB - utcA) / (1000 * 60 * 60 * 24))
}

/**
 * Format a canonical ISO date for the end of a given month.
 */
export function getMonthEndDate(year: number, month: number): string {
  const lastDay = getDaysInMonth(year, month)
  return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
}

/**
 * Format a canonical ISO date for the end of a given quarter (1..4).
 */
export function getQuarterEndDate(year: number, quarter: number): string {
  switch (quarter) {
    case 1:
      return `${year}-03-31`
    case 2:
      return `${year}-06-30`
    case 3:
      return `${year}-09-30`
    case 4:
    default:
      return `${year}-12-31`
  }
}

/**
 * Determines whether a given period is incomplete / in-progress.
 */
export function isPeriodPartial(
  periodEndDate: string,
  lastObsDate: string,
  isLatestPeriod: boolean,
  referenceDate: Date = new Date()
): boolean {
  if (!isLatestPeriod) return false

  const [refYear, refMonth, refDay] = [
    referenceDate.getUTCFullYear(),
    referenceDate.getUTCMonth() + 1,
    referenceDate.getUTCDate(),
  ]
  const refIso = `${refYear}-${String(refMonth).padStart(2, '0')}-${String(refDay).padStart(2, '0')}`

  // If the reference date is inside or before the period end date, it's ongoing
  if (refIso <= periodEndDate) {
    return true
  }

  // If the last observation in the series ended more than 3 calendar days before the period end date
  // (i.e. cut off mid-month or mid-quarter before the last business days)
  const missingDays = getDaysBetween(lastObsDate, periodEndDate)
  return missingDays > 3
}

/**
 * Calculate compounded effective rate for interest rate series (% TNA).
 * Formula: \prod (1 + TNA_i \times d_i / 36500) - 1, weighted by weekend/holiday days elapsed.
 */
export function calculateEffectiveRate(
  points: MacroSeriesPoint[],
  totalPeriodDays: number,
  isPartial: boolean,
  periodEndDate: string
): number {
  if (points.length === 0) return 0

  if (points.length === 1) {
    // Single observation in the period:
    // If complete period (e.g. native monthly series), assume it applies for the full period days;
    // If partial period, weight by 1 day.
    const d = isPartial ? 1 : totalPeriodDays
    const tna = points[0].valor
    const factor = 1 + (tna * d) / 36500
    const eff = (factor - 1) * 100
    return Math.round(eff * 100) / 100
  }

  let accumulatedFactor = 1.0

  for (let i = 0; i < points.length; i++) {
    const current = points[i]
    let d = 1

    if (i < points.length - 1) {
      const next = points[i + 1]
      const diff = getDaysBetween(current.fecha, next.fecha)
      d = Math.max(1, diff)
    } else {
      // Last observation of the period
      if (isPartial) {
        d = 1
      } else {
        const remaining = getDaysBetween(current.fecha, periodEndDate) + 1
        d = Math.max(1, remaining)
      }
    }

    const dailyFactor = 1 + (current.valor * d) / 36500
    accumulatedFactor *= dailyFactor
  }

  const effectiveRate = (accumulatedFactor - 1) * 100
  return Math.round(effectiveRate * 100) / 100
}

/**
 * Resample a raw array of MacroSeriesPoint observations into monthly or quarterly frequency.
 */
export function resampleSeriesPoints(
  points: MacroSeriesPoint[],
  taxonomy: SeriesTaxonomy,
  periodicity: Periodicity,
  referenceDate?: Date
): ResampledPoint[] {
  if (!points || points.length === 0) return []
  if (periodicity === 'original') {
    return points.map((p) => ({ ...p, isPartial: false }))
  }

  // Sort chronological
  const sorted = [...points].sort((a, b) => a.fecha.localeCompare(b.fecha))
  const globalLastDate = sorted[sorted.length - 1].fecha

  // Group by period key: 'YYYY-MM' or 'YYYY-Q1'..'YYYY-Q4'
  const groups = new Map<string, MacroSeriesPoint[]>()

  sorted.forEach((p) => {
    const year = p.fecha.slice(0, 4)
    const month = parseInt(p.fecha.slice(5, 7), 10)

    let key = ''
    if (periodicity === 'mensual') {
      key = p.fecha.slice(0, 7)
    } else {
      const quarter = Math.ceil(month / 3)
      key = `${year}-Q${quarter}`
    }

    const list = groups.get(key)
    if (list) {
      list.push(p)
    } else {
      groups.set(key, [p])
    }
  })

  const groupKeys = Array.from(groups.keys()).sort()
  const result: ResampledPoint[] = []

  groupKeys.forEach((key, index) => {
    const pts = groups.get(key)!
    const isLatestPeriod = index === groupKeys.length - 1
    const lastPt = pts[pts.length - 1]

    let periodEndDate = ''
    let totalPeriodDays = 30

    if (periodicity === 'mensual') {
      const year = parseInt(key.slice(0, 4), 10)
      const month = parseInt(key.slice(5, 7), 10)
      periodEndDate = getMonthEndDate(year, month)
      totalPeriodDays = getDaysInMonth(year, month)
    } else {
      const year = parseInt(key.slice(0, 4), 10)
      const quarter = parseInt(key.slice(6, 7), 10)
      periodEndDate = getQuarterEndDate(year, quarter)
      // Days in quarter
      const mStart = (quarter - 1) * 3 + 1
      totalPeriodDays =
        getDaysInMonth(year, mStart) +
        getDaysInMonth(year, mStart + 1) +
        getDaysInMonth(year, mStart + 2)
    }

    const isPartial = isPeriodPartial(
      periodEndDate,
      lastPt.fecha,
      isLatestPeriod && lastPt.fecha === globalLastDate,
      referenceDate
    )

    let aggregatedValue = 0

    switch (taxonomy) {
      case 'fx': {
        // Arithmetic average
        const sum = pts.reduce((acc, cur) => acc + cur.valor, 0)
        aggregatedValue = Math.round((sum / pts.length) * 100) / 100
        break
      }

      case 'rate': {
        // Compounded effective rate (TEM / TET)
        aggregatedValue = calculateEffectiveRate(pts, totalPeriodDays, isPartial, periodEndDate)
        break
      }

      case 'stock': {
        // End-of-period closing value (last available business day of the period)
        aggregatedValue = lastPt.valor
        break
      }

      case 'flow': {
        // Cumulative sum
        const sum = pts.reduce((acc, cur) => acc + cur.valor, 0)
        aggregatedValue = Math.round(sum * 100) / 100
        break
      }

      case 'index': {
        // If native monthly series with 1 observation per month: preserve published official value
        if (pts.length === 1) {
          aggregatedValue = pts[0].valor
        } else if (periodicity === 'trimestral') {
          // If quarterly and points are monthly variation rates (unit is % or title contains inflation)
          // Compound variation over the months: \prod (1 + v_i / 100) - 1
          // Otherwise take last point of the quarter (EOP for index levels)
          const isVariation = pts.some((p) => p.valor < 30) // Heuristic for monthly variations vs index base 100
          if (isVariation) {
            let factor = 1.0
            pts.forEach((p) => {
              factor *= 1 + p.valor / 100
            })
            aggregatedValue = Math.round((factor - 1) * 100 * 100) / 100
          } else {
            aggregatedValue = lastPt.valor
          }
        } else {
          // Daily index (e.g. CER / UVA / UVI daily index): end-of-month closing value
          aggregatedValue = lastPt.valor
        }
        break
      }
    }

    result.push({
      fecha: periodEndDate,
      valor: aggregatedValue,
      isPartial,
      count: pts.length,
      originalFecha: lastPt.fecha,
    })
  })

  return result
}

/**
 * Resample a full ChartSeries object into monthly or quarterly periodicity.
 */
export function resampleChartSeries(
  series: ChartSeries,
  periodicity: Periodicity,
  referenceDate?: Date
): ResampledSeriesResult {
  const taxonomy = inferSeriesTaxonomy(series)
  const aggregationMethod = getTaxonomyAggregationLabel(taxonomy, periodicity)
  const resampledData = resampleSeriesPoints(series.data, taxonomy, periodicity, referenceDate)
  const hasPartialPeriod = resampledData.some((p) => p.isPartial)

  // When rates are resampled to monthly or quarterly, update the unit display to % TEM or % TET
  let unit = series.unit
  if (taxonomy === 'rate') {
    if (periodicity === 'mensual') {
      unit = '% TEM'
    } else if (periodicity === 'trimestral') {
      unit = '% TET'
    }
  }

  return {
    ...series,
    unit,
    data: resampledData,
    taxonomy,
    aggregationMethod,
    periodicity,
    hasPartialPeriod,
  }
}
