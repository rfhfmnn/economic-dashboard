/**
 * Dynamic base-100 indexation and multi-variable normalization engine for macroeconomic time-series.
 * Re-expresses heterogeneous financial series (stocks, foreign currency, indices, rates, and variations)
 * onto a unified visual scale anchored to a dynamic base date (t0 = 100).
 */

import type { MacroSeriesPoint } from '../types'

export interface IndexedPoint {
  fecha: string
  valor: number | null
  originalValor: number
  variationPct: number | null
}

export interface RebaseOptions {
  customBaseDate?: string
  defaultBaseDate?: string
  isMonthlyVariation?: boolean
  precision?: number
}

export interface RebasedSeriesResult {
  id: number | string
  title: string
  unit?: string
  baseDate: string
  baseValue: number | null
  data: IndexedPoint[]
}

/**
 * Formats an ISO date string (YYYY-MM-DD or YYYY-MM) to DD/MM/AAAA.
 */
export function formatDateToDdMmYyyy(dateStr?: string): string {
  if (!dateStr) return ''
  const clean = dateStr.trim()
  if (clean.length === 10) {
    const [year, month, day] = clean.split('-')
    if (year && month && day) {
      return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`
    }
  }
  if (clean.length === 7) {
    const [year, month] = clean.split('-')
    if (year && month) {
      return `01/${month.padStart(2, '0')}/${year}`
    }
  }
  return clean
}

/**
 * Formats a numeric index value to localized string with 2 decimal places.
 */
export function formatIndexValue(val: number | null | undefined, locale: string = 'es-AR'): string {
  if (val === null || val === undefined || isNaN(val)) return '-'
  return val.toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/**
 * Formats a percentage variation from base (+X,XX% or -X,XX%).
 */
export function formatIndexVariation(
  change: number | null | undefined,
  locale: string = 'es-AR'
): string {
  if (change === null || change === undefined || isNaN(change)) return '-'
  const formatted = Math.abs(change).toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  if (change > 0.0001) return `+${formatted}%`
  if (change < -0.0001) return `-${formatted}%`
  return `0,00%`
}

/**
 * Detects whether a time-series represents a monthly percentage variation (e.g. IPC intermensual).
 */
export function isMonthlyVariationSeries(series: {
  id?: number | string
  unit?: string
  title?: string
}): boolean {
  const numId = typeof series.id === 'number' ? series.id : Number(String(series.id || '').replace(/\D/g, ''))
  // Variable #27 = Inflación intermensual BCRA/INDEC
  if (numId === 27) return true

  const titleLower = (series.title || '').toLowerCase()
  const unit = (series.unit || '').trim()

  if (unit === '%' && (titleLower.includes('intermensual') || titleLower.includes('variación mensual') || titleLower.includes('variacion mensual'))) {
    return true
  }

  return false
}

/**
 * Finds the base observation t0 within an ordered time series.
 * If targetDate is specified:
 *   1. Matches exact date if present.
 *   2. If weekend / holiday, selects the immediate subsequent available business observation.
 *   3. If targetDate is later than all available points, falls back to the closest available point.
 * If targetDate is omitted, selects the first observation.
 */
export function findBaseObservation(
  points: MacroSeriesPoint[],
  targetDate?: string
): MacroSeriesPoint | null {
  if (!points || points.length === 0) return null

  // Ensure points are considered in chronological order
  const validPoints = points.filter((p) => p && typeof p.valor === 'number' && !isNaN(p.valor))
  if (validPoints.length === 0) return null

  if (!targetDate) {
    return validPoints[0]
  }

  const cleanTarget = targetDate.trim()

  // 1. Exact match
  const exact = validPoints.find((p) => p.fecha === cleanTarget)
  if (exact) return exact

  // 2. Immediate subsequent observation (fecha >= targetDate)
  const subsequent = validPoints.find((p) => p.fecha >= cleanTarget)
  if (subsequent) return subsequent

  // 3. Fallback to closest observation by absolute time difference
  const targetTime = new Date(cleanTarget).getTime()
  if (isNaN(targetTime)) return validPoints[0]

  let closest = validPoints[0]
  let minDiff = Math.abs(new Date(validPoints[0].fecha).getTime() - targetTime)

  for (let i = 1; i < validPoints.length; i++) {
    const diff = Math.abs(new Date(validPoints[i].fecha).getTime() - targetTime)
    if (diff < minDiff) {
      minDiff = diff
      closest = validPoints[i]
    }
  }

  return closest
}

/**
 * Reconstructs a cumulative index series from monthly percentage variations
 * by compounding factors: (1 + r_t / 100) forward and backward starting from t0 = 100.
 */
export function chainMonthlyVariations(
  points: MacroSeriesPoint[],
  baseDate?: string,
  precision: number = 2
): IndexedPoint[] {
  if (!points || points.length === 0) return []

  const sorted = [...points].sort((a, b) => a.fecha.localeCompare(b.fecha))
  const basePoint = findBaseObservation(sorted, baseDate)
  if (!basePoint) return []

  const baseIdx = sorted.findIndex((p) => p.fecha === basePoint.fecha)
  if (baseIdx === -1) return []

  const result: IndexedPoint[] = new Array(sorted.length)
  const factor = Math.pow(10, precision)

  // Anchor base date to 100.0
  result[baseIdx] = {
    fecha: sorted[baseIdx].fecha,
    valor: 100.0,
    originalValor: sorted[baseIdx].valor,
    variationPct: 0.0,
  }

  // Forward pass: I_t = I_{t-1} * (1 + r_t / 100)
  for (let i = baseIdx + 1; i < sorted.length; i++) {
    const prevIndex = result[i - 1].valor
    const rate = sorted[i].valor

    if (prevIndex === null || isNaN(rate)) {
      result[i] = {
        fecha: sorted[i].fecha,
        valor: null,
        originalValor: sorted[i].valor,
        variationPct: null,
      }
    } else {
      const compounded = prevIndex * (1 + rate / 100)
      const rounded = Math.round(compounded * factor) / factor
      result[i] = {
        fecha: sorted[i].fecha,
        valor: rounded,
        originalValor: sorted[i].valor,
        variationPct: Math.round((rounded - 100.0) * factor) / factor,
      }
    }
  }

  // Backward pass: I_{t-1} = I_t / (1 + r_t / 100)
  for (let i = baseIdx - 1; i >= 0; i--) {
    const nextIndex = result[i + 1].valor
    const nextRate = sorted[i + 1].valor

    if (nextIndex === null || isNaN(nextRate) || 1 + nextRate / 100 <= 0) {
      result[i] = {
        fecha: sorted[i].fecha,
        valor: null,
        originalValor: sorted[i].valor,
        variationPct: null,
      }
    } else {
      const deCompounded = nextIndex / (1 + nextRate / 100)
      const rounded = Math.round(deCompounded * factor) / factor
      result[i] = {
        fecha: sorted[i].fecha,
        valor: rounded,
        originalValor: sorted[i].valor,
        variationPct: Math.round((rounded - 100.0) * factor) / factor,
      }
    }
  }

  return result
}

/**
 * Re-expresses a time-series into base 100 applying the formula:
 *   I_t = (X_t / X_{t_0}) * 100
 *
 * Edge cases handled:
 * - Empty points array -> returns empty array.
 * - Non-positive base value (X_{t_0} <= 0) -> returns null values safely without crashing or dividing by zero.
 * - Missing or staggered data -> anchors safely to the first available observation on or after t_0.
 * - Percentage variations -> chains monthly variations forward and backward.
 */
export function rebaseSeriesToBase100(
  points: MacroSeriesPoint[],
  options: RebaseOptions = {}
): IndexedPoint[] {
  if (!points || points.length === 0) return []

  const precision = options.precision ?? 2
  const factor = Math.pow(10, precision)

  // Monthly variations chaining
  if (options.isMonthlyVariation) {
    const targetBase = options.customBaseDate || options.defaultBaseDate
    return chainMonthlyVariations(points, targetBase, precision)
  }

  const sorted = [...points].sort((a, b) => a.fecha.localeCompare(b.fecha))
  const targetBase = options.customBaseDate || options.defaultBaseDate
  const basePoint = findBaseObservation(sorted, targetBase)

  if (!basePoint) return []

  const baseValue = basePoint.valor

  // Safe defense against zero or negative base values
  if (baseValue <= 0 || isNaN(baseValue)) {
    return sorted.map((p) => ({
      fecha: p.fecha,
      valor: null,
      originalValor: p.valor,
      variationPct: null,
    }))
  }

  return sorted.map((p) => {
    if (typeof p.valor !== 'number' || isNaN(p.valor)) {
      return {
        fecha: p.fecha,
        valor: null,
        originalValor: p.valor,
        variationPct: null,
      }
    }

    const rawIndex = (p.valor / baseValue) * 100.0
    const roundedIndex = Math.round(rawIndex * factor) / factor
    const rawVariation = ((p.valor - baseValue) / baseValue) * 100.0
    const roundedVariation = Math.round(rawVariation * factor) / factor

    return {
      fecha: p.fecha,
      valor: roundedIndex,
      originalValor: p.valor,
      variationPct: roundedVariation,
    }
  })
}

/**
 * Helper to compute percentage change relative to base 100: (I_t - 100).
 */
export function computeIndexVariation(indexValue: number | null | undefined): number | null {
  if (indexValue === null || indexValue === undefined || isNaN(indexValue)) {
    return null
  }
  return Math.round((indexValue - 100.0) * 100) / 100
}
