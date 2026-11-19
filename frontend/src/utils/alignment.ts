/**
 * Mathematical alignment and temporal harmonization engine for multi-frequency series.
 */

import type { MacroSeriesPoint } from '../types'
import type { ExpressionMode } from './transforms'
import { transformOriginal, transformBase100, transformMoM, transformYoY } from './transforms'

export interface AlignedPoint {
  fecha: string
  [seriesKey: string]: number | string | null
}

/**
 * Normalizes an array of date-sorted series points by rebasing to t0 = 100.
 * If baseValue is 0 or invalid, returns values unchanged or 100 for t0.
 */
export function rebaseToBase100(points: MacroSeriesPoint[]): MacroSeriesPoint[] {
  if (!points || points.length === 0) return []
  const firstValid = points.find((p) => p.valor !== null && p.valor !== undefined && !isNaN(p.valor) && p.valor !== 0)
  if (!firstValid) return points

  const baseVal = firstValid.valor
  return points.map((p) => ({
    fecha: p.fecha,
    valor: p.valor !== null && !isNaN(p.valor) ? Number(((p.valor / baseVal) * 100).toFixed(4)) : 0,
  }))
}

/**
 * Normalizes an array of date-sorted series points to percentage variation relative to t0 (% Δ).
 */
export function rebaseToPercentChange(points: MacroSeriesPoint[]): MacroSeriesPoint[] {
  if (!points || points.length === 0) return []
  const firstValid = points.find((p) => p.valor !== null && p.valor !== undefined && !isNaN(p.valor) && p.valor !== 0)
  if (!firstValid) return points

  const baseVal = firstValid.valor
  return points.map((p) => ({
    fecha: p.fecha,
    valor: p.valor !== null && !isNaN(p.valor) ? Number((((p.valor - baseVal) / baseVal) * 100).toFixed(4)) : 0,
  }))
}

/**
 * Step forward-fill a sparse or monthly/quarterly series across an array of sorted target daily dates.
 */
export function forwardFillDaily(
  points: MacroSeriesPoint[],
  targetDates: string[]
): MacroSeriesPoint[] {
  if (!targetDates || targetDates.length === 0) return []
  if (!points || points.length === 0) {
    return targetDates.map((f) => ({ fecha: f, valor: 0 }))
  }

  // Create point map for direct matches
  const pointMap = new Map<string, number>()
  for (const pt of points) {
    pointMap.set(pt.fecha.slice(0, 10), pt.valor)
  }

  const sortedPoints = [...points].sort((a, b) => a.fecha.localeCompare(b.fecha))
  const firstObsDate = sortedPoints[0].fecha.slice(0, 10)

  let lastValue: number | null = null
  const result: MacroSeriesPoint[] = []

  // Track pointer in sorted points
  let ptIdx = 0

  for (const date of targetDates) {
    // Advance pointer up to current date
    while (ptIdx < sortedPoints.length && sortedPoints[ptIdx].fecha.slice(0, 10) <= date) {
      lastValue = sortedPoints[ptIdx].valor
      ptIdx++
    }

    if (date < firstObsDate) {
      // Prior to first observation: use first known value or 0
      result.push({ fecha: date, valor: sortedPoints[0].valor })
    } else {
      result.push({ fecha: date, valor: lastValue ?? sortedPoints[0].valor })
    }
  }

  return result
}

/**
 * Downsamples a daily series into monthly points (taking the last observation or mean of each month).
 */
export function downsampleToMonthly(
  points: MacroSeriesPoint[],
  method: 'last' | 'mean' = 'last'
): MacroSeriesPoint[] {
  if (!points || points.length === 0) return []

  const monthGroups = new Map<string, number[]>()
  for (const pt of points) {
    if (pt.valor === null || pt.valor === undefined || isNaN(pt.valor)) continue
    const monthKey = pt.fecha.slice(0, 7) // YYYY-MM
    if (!monthGroups.has(monthKey)) {
      monthGroups.set(monthKey, [])
    }
    monthGroups.get(monthKey)!.push(pt.valor)
  }

  const result: MacroSeriesPoint[] = []
  const sortedMonths = Array.from(monthGroups.keys()).sort()

  for (const month of sortedMonths) {
    const vals = monthGroups.get(month)!
    if (vals.length === 0) continue

    let val: number
    if (method === 'mean') {
      val = vals.reduce((acc, v) => acc + v, 0) / vals.length
    } else {
      val = vals[vals.length - 1]
    }

    // Canonical monthly date representation: YYYY-MM-01 or end of month
    result.push({
      fecha: `${month}-01`,
      valor: Number(val.toFixed(4)),
    })
  }

  return result
}

/**
 * Harmonizes and aligns multiple series onto a common date axis.
 * Each input series is given a unique key in the returned points.
 */
export function alignTimeSeries(
  seriesEntries: Array<{
    key: string
    frequency: 'diaria' | 'mensual' | 'trimestral'
    points: MacroSeriesPoint[]
  }>,
  options: {
    normalization?: 'none' | 'base100' | 'percent'
    expressionMode?: ExpressionMode
    startDate?: string
    endDate?: string
  } = {}
): AlignedPoint[] {
  if (!seriesEntries || seriesEntries.length === 0) return []

  const mode = options.expressionMode

  // 1. Filter and transform points based on expression mode
  const filteredSeries = seriesEntries.map((s) => {
    let pts = [...s.points].sort((a, b) => a.fecha.localeCompare(b.fecha))

    if (mode === 'mom') {
      // For rolling MoM, calculate first so historical points prior to startDate provide bases
      pts = transformMoM(pts, s.frequency)
    } else if (mode === 'yoy') {
      // For rolling YoY, calculate first so historical points prior to startDate provide bases
      pts = transformYoY(pts, s.frequency)
    }

    if (options.startDate) {
      pts = pts.filter((p) => p.fecha >= options.startDate!)
    }
    if (options.endDate) {
      pts = pts.filter((p) => p.fecha <= options.endDate!)
    }

    // Apply base100 or original or legacy normalization to the filtered visible range
    if (mode === 'base100' || (!mode && options.normalization === 'base100')) {
      pts = transformBase100(pts)
    } else if (mode === 'original') {
      pts = transformOriginal(pts)
    } else if (!mode && options.normalization === 'percent') {
      pts = rebaseToPercentChange(pts)
    }

    return {
      key: s.key,
      frequency: s.frequency,
      points: pts,
    }
  })

  // 2. Collect unique dates across all daily series or all series
  const allDatesSet = new Set<string>()
  for (const s of filteredSeries) {
    for (const p of s.points) {
      allDatesSet.add(p.fecha.slice(0, 10))
    }
  }

  const allDates = Array.from(allDatesSet).sort()
  if (allDates.length === 0) return []

  // 3. Forward-fill non-daily series across the master daily date index
  const alignedSeriesMap = new Map<string, Map<string, number>>()

  for (const s of filteredSeries) {
    const valMap = new Map<string, number>()
    if (s.frequency === 'mensual' || s.frequency === 'trimestral') {
      const filled = forwardFillDaily(s.points, allDates)
      for (const p of filled) {
        valMap.set(p.fecha, p.valor)
      }
    } else {
      // Daily series: direct mapping
      for (const p of s.points) {
        valMap.set(p.fecha.slice(0, 10), p.valor)
      }
    }
    alignedSeriesMap.set(s.key, valMap)
  }

  // 4. Construct unified AlignedPoint array
  const aligned: AlignedPoint[] = allDates.map((date) => {
    const row: AlignedPoint = { fecha: date }
    for (const s of filteredSeries) {
      const valMap = alignedSeriesMap.get(s.key)
      const val = valMap?.get(date)
      row[s.key] = val !== undefined ? val : null
    }
    return row
  })

  return aligned
}
