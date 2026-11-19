/**
 * Pure mathematical transformation engines for workbench analytical expression modes:
 * - Native original units
 * - Dynamic base 100 (t0 = 100)
 * - Month-over-month percentage change (MoM %)
 * - Year-over-year percentage change (YoY %)
 */

import type { MacroSeriesPoint } from '../types'

export type ExpressionMode = 'original' | 'base100' | 'mom' | 'yoy'

export interface TransformOptions {
  frequency?: 'diaria' | 'mensual' | 'trimestral'
  dailyMoMLag?: number // default 21 business days
  dailyYoYLag?: number // default 252 business days
}

/**
 * Returns values in their native original units.
 */
export function transformOriginal(points: MacroSeriesPoint[]): MacroSeriesPoint[] {
  if (!points || points.length === 0) return []
  const sorted = [...points].sort((a, b) => a.fecha.localeCompare(b.fecha))
  return sorted.map((p) => ({
    fecha: p.fecha,
    valor: p.valor !== null && !isNaN(p.valor) ? Number(p.valor.toFixed(4)) : 0,
  }))
}

/**
 * Normalizes time-series points by dynamic rebasing to t0 = 100 on the first valid point.
 * Formula: V_{base100, t} = (V_t / V_0) * 100
 */
export function transformBase100(points: MacroSeriesPoint[]): MacroSeriesPoint[] {
  if (!points || points.length === 0) return []
  const sorted = [...points].sort((a, b) => a.fecha.localeCompare(b.fecha))
  const firstValid = sorted.find(
    (p) => p.valor !== null && p.valor !== undefined && !isNaN(p.valor) && p.valor !== 0
  )
  if (!firstValid) return sorted

  const baseVal = firstValid.valor
  return sorted.map((p) => ({
    fecha: p.fecha,
    valor:
      p.valor !== null && !isNaN(p.valor)
        ? Number(((p.valor / baseVal) * 100).toFixed(4))
        : 0,
  }))
}

/**
 * Helper to determine previous month key in YYYY-MM format.
 */
function getPreviousMonthKey(yearMonth: string): string {
  const [yearStr, monthStr] = yearMonth.split('-')
  let year = parseInt(yearStr, 10)
  let month = parseInt(monthStr, 10) - 1
  if (month === 0) {
    month = 12
    year -= 1
  }
  return `${year}-${String(month).padStart(2, '0')}`
}

/**
 * Computes month-over-month (MoM %) percentage variation:
 * \Delta\%_m = ((V_t - V_{t-1}) / V_{t-1}) * 100
 *
 * For monthly series: relative to immediate prior month (t - 1).
 * For daily series: relative to 21 business days prior or the last business day of the previous calendar month.
 */
export function transformMoM(
  points: MacroSeriesPoint[],
  frequency: 'diaria' | 'mensual' | 'trimestral' = 'diaria',
  options: { dailyLag?: number } = {}
): MacroSeriesPoint[] {
  if (!points || points.length < 2) return []

  const sorted = [...points].sort((a, b) => a.fecha.localeCompare(b.fecha))
  const lag = options.dailyLag ?? 21
  const result: MacroSeriesPoint[] = []

  if (frequency === 'mensual' || frequency === 'trimestral') {
    // For monthly: compare with immediate previous observation (t - 1)
    for (let i = 1; i < sorted.length; i++) {
      const prevVal = sorted[i - 1].valor
      const curVal = sorted[i].valor
      if (prevVal !== 0 && !isNaN(prevVal) && !isNaN(curVal)) {
        const change = ((curVal - prevVal) / Math.abs(prevVal)) * 100
        result.push({
          fecha: sorted[i].fecha,
          valor: Number(change.toFixed(4)),
        })
      }
    }
  } else {
    // Daily series:
    // Pre-calculate last observation of each calendar month for fallback when i < lag
    const lastDayOfMonthMap = new Map<string, number>()
    for (const p of sorted) {
      const ym = p.fecha.slice(0, 7)
      lastDayOfMonthMap.set(ym, p.valor)
    }

    for (let i = 1; i < sorted.length; i++) {
      let prevVal: number | undefined

      if (i >= lag) {
        prevVal = sorted[i - lag].valor
      } else {
        // Fallback: look for the last observation of the previous calendar month
        const curYm = sorted[i].fecha.slice(0, 7)
        const prevYm = getPreviousMonthKey(curYm)
        prevVal = lastDayOfMonthMap.get(prevYm)
      }

      if (prevVal !== undefined && prevVal !== 0 && !isNaN(prevVal) && !isNaN(sorted[i].valor)) {
        const curVal = sorted[i].valor
        const change = ((curVal - prevVal) / Math.abs(prevVal)) * 100
        result.push({
          fecha: sorted[i].fecha,
          valor: Number(change.toFixed(4)),
        })
      }
    }
  }

  return result
}

/**
 * Computes year-over-year (YoY %) percentage variation:
 * \Delta\%_a = ((V_t - V_{t-12}) / V_{t-12}) * 100
 *
 * For monthly series: relative to same month of previous year (t - 12).
 * For quarterly series: relative to same quarter of previous year (t - 4).
 * For daily series: relative to 252 business days prior or closest business day ~1 calendar year prior.
 */
export function transformYoY(
  points: MacroSeriesPoint[],
  frequency: 'diaria' | 'mensual' | 'trimestral' = 'diaria',
  options: { dailyLag?: number } = {}
): MacroSeriesPoint[] {
  if (!points || points.length === 0) return []

  const sorted = [...points].sort((a, b) => a.fecha.localeCompare(b.fecha))
  const lag = options.dailyLag ?? (frequency === 'mensual' ? 12 : frequency === 'trimestral' ? 4 : 252)
  const result: MacroSeriesPoint[] = []

  if (frequency === 'mensual' || frequency === 'trimestral') {
    for (let i = lag; i < sorted.length; i++) {
      const prevVal = sorted[i - lag].valor
      const curVal = sorted[i].valor
      if (prevVal !== 0 && !isNaN(prevVal) && !isNaN(curVal)) {
        const change = ((curVal - prevVal) / Math.abs(prevVal)) * 100
        result.push({
          fecha: sorted[i].fecha,
          valor: Number(change.toFixed(4)),
        })
      }
    }
  } else {
    // Daily series:
    // First, check if index lag (252 business days) is available
    // Also build a fast lookup map for calendar year lookup (1 calendar year prior)
    for (let i = 1; i < sorted.length; i++) {
      let prevVal: number | undefined

      if (i >= lag) {
        prevVal = sorted[i - lag].valor
      } else {
        // Fallback: look for observation ~1 calendar year prior
        const curDate = sorted[i].fecha.slice(0, 10)
        const curYear = parseInt(curDate.slice(0, 4), 10)
        const targetDate = `${curYear - 1}${curDate.slice(4)}`

        // Find closest point before or on targetDate
        for (let j = i - 1; j >= 0; j--) {
          if (sorted[j].fecha.slice(0, 10) <= targetDate) {
            prevVal = sorted[j].valor
            break
          }
        }
      }

      if (prevVal !== undefined && prevVal !== 0 && !isNaN(prevVal) && !isNaN(sorted[i].valor)) {
        const curVal = sorted[i].valor
        const change = ((curVal - prevVal) / Math.abs(prevVal)) * 100
        result.push({
          fecha: sorted[i].fecha,
          valor: Number(change.toFixed(4)),
        })
      }
    }
  }

  return result
}

/**
 * Applies expression mode transformation based on active mode selector.
 */
export function applyExpressionMode(
  points: MacroSeriesPoint[],
  mode: ExpressionMode,
  frequency: 'diaria' | 'mensual' | 'trimestral' = 'diaria'
): MacroSeriesPoint[] {
  switch (mode) {
    case 'original':
      return transformOriginal(points)
    case 'base100':
      return transformBase100(points)
    case 'mom':
      return transformMoM(points, frequency)
    case 'yoy':
      return transformYoY(points, frequency)
    default:
      return transformOriginal(points)
  }
}

/**
 * Human-readable sentence case labels for expression modes.
 */
export function getExpressionModeLabel(mode: ExpressionMode): string {
  switch (mode) {
    case 'original':
      return 'Unidad original'
    case 'base100':
      return 'Base 100 (t₀ = 100)'
    case 'mom':
      return 'Variación intermensual (MoM %)'
    case 'yoy':
      return 'Variación interanual (YoY %)'
  }
}

/**
 * Formats a value according to the active expression mode.
 */
export function formatExpressionValue(
  value: number | null | undefined,
  mode: ExpressionMode,
  unit?: string
): string {
  if (value === null || value === undefined || isNaN(value)) {
    return '—'
  }
  const num = Number(value)
  if (mode === 'mom' || mode === 'yoy') {
    return `${num > 0 ? '+' : ''}${num.toFixed(2)}%`
  }
  if (mode === 'base100') {
    return num.toFixed(2)
  }
  return `${num.toLocaleString('es-AR', { maximumFractionDigits: 2 })}${unit ? ` ${unit}` : ''}`
}
