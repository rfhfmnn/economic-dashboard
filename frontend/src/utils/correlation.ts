/**
 * Mathematical engine for rolling Pearson correlation and statistical summaries.
 */

import type {
  MacroSeriesPoint,
  RollingCorrelationPoint,
  WorkbenchSeriesStats,
  WorkbenchSource,
} from '../types'
import { downsampleToMonthly } from './alignment'


/**
 * Calculates Pearson correlation coefficient between two numeric vectors of equal length.
 * Returns null if variance of either vector is zero or length < 2.
 */
export function calculatePearsonR(x: number[], y: number[]): number | null {
  const n = x.length
  if (n !== y.length || n < 2) return null

  const sumX = x.reduce((a, b) => a + b, 0)
  const sumY = y.reduce((a, b) => a + b, 0)
  const meanX = sumX / n
  const meanY = sumY / n

  let numerator = 0
  let varX = 0
  let varY = 0

  for (let i = 0; i < n; i++) {
    const diffX = x[i] - meanX
    const diffY = y[i] - meanY
    numerator += diffX * diffY
    varX += diffX * diffX
    varY += diffY * diffY
  }

  if (varX === 0 || varY === 0) {
    return 0 // Flat/constant series -> 0 correlation
  }

  const denominator = Math.sqrt(varX * varY)
  if (denominator === 0) return 0

  const r = numerator / denominator
  // Ensure strict bounding between -1.00 and +1.00
  return Math.max(-1.0, Math.min(1.0, Number(r.toFixed(4))))
}

/**
 * Calculates rolling Pearson correlation over a sliding window (e.g., 30, 90, 180 days/periods).
 * Handles mixed frequencies automatically via monthly downsampling.
 */
export function calculateRollingCorrelation(
  seriesA: {
    points: MacroSeriesPoint[]
    frequency: 'diaria' | 'mensual' | 'trimestral'
  },
  seriesB: {
    points: MacroSeriesPoint[]
    frequency: 'diaria' | 'mensual' | 'trimestral'
  },
  windowDays: 30 | 90 | 180 = 90
): {
  points: RollingCorrelationPoint[]
  isDownsampled: boolean
} {
  const needsDownsampling =
    seriesA.frequency !== 'diaria' || seriesB.frequency !== 'diaria'

  let ptsA = seriesA.points
  let ptsB = seriesB.points

  let effectiveWindow: number

  if (needsDownsampling) {
    // Convert any daily series to monthly
    if (seriesA.frequency === 'diaria') {
      ptsA = downsampleToMonthly(ptsA, 'last')
    }
    if (seriesB.frequency === 'diaria') {
      ptsB = downsampleToMonthly(ptsB, 'last')
    }

    // Convert window days to equivalent months
    // 30 days -> 2 months minimum window, 90 days -> 3 months, 180 days -> 6 months
    effectiveWindow = windowDays === 30 ? 2 : windowDays === 90 ? 3 : 6
  } else {
    // Both are daily: window in calendar days/observations
    // Approximate daily observations window (e.g. 30, 90, 180)
    effectiveWindow = windowDays
  }

  // Intersect dates where both have observations
  const mapA = new Map<string, number>()
  for (const p of ptsA) {
    mapA.set(p.fecha.slice(0, 10), p.valor)
  }

  const mapB = new Map<string, number>()
  for (const p of ptsB) {
    mapB.set(p.fecha.slice(0, 10), p.valor)
  }

  // Find sorted mutual dates
  const mutualDates = Array.from(mapA.keys())
    .filter((d) => mapB.has(d))
    .sort()

  const rollingPoints: RollingCorrelationPoint[] = []

  for (let i = 0; i < mutualDates.length; i++) {
    const curDate = mutualDates[i]

    if (i + 1 < effectiveWindow) {
      // Not enough observations yet for window
      rollingPoints.push({
        fecha: curDate,
        r: null,
      })
      continue
    }

    const windowSliceA: number[] = []
    const windowSliceB: number[] = []

    for (let j = i - effectiveWindow + 1; j <= i; j++) {
      const d = mutualDates[j]
      windowSliceA.push(mapA.get(d)!)
      windowSliceB.push(mapB.get(d)!)
    }

    const r = calculatePearsonR(windowSliceA, windowSliceB)
    rollingPoints.push({
      fecha: curDate,
      r,
    })
  }

  return {
    points: rollingPoints,
    isDownsampled: needsDownsampling,
  }
}

/**
 * Calculates statistical summary for a series:
 * latest value, latest date, period variation %, min, max, and sample standard deviation.
 */
export function calculateSeriesStats(
  id: string,
  name: string,
  source: WorkbenchSource,
  points: MacroSeriesPoint[],
  unit?: string
): WorkbenchSeriesStats {
  if (!points || points.length === 0) {
    return {
      id,
      name,
      source,
      ultimoValor: null,
      fechaUltimo: null,
      variacionPeriodo: null,
      minimo: null,
      maximo: null,
      desvioEstandar: null,
      unit,
    }
  }

  const sorted = [...points].sort((a, b) => a.fecha.localeCompare(b.fecha))
  const values = sorted.map((p) => p.valor).filter((v) => v !== null && !isNaN(v))

  if (values.length === 0) {
    return {
      id,
      name,
      source,
      ultimoValor: null,
      fechaUltimo: null,
      variacionPeriodo: null,
      minimo: null,
      maximo: null,
      desvioEstandar: null,
      unit,
    }
  }

  const firstVal = values[0]
  const lastPt = sorted[sorted.length - 1]
  const lastVal = lastPt.valor

  // Period percentage variation
  let variacionPeriodo: number | null = null
  if (firstVal !== 0 && lastVal !== null && !isNaN(lastVal)) {
    variacionPeriodo = Number((((lastVal - firstVal) / firstVal) * 100).toFixed(2))
  }

  const minimo = Math.min(...values)
  const maximo = Math.max(...values)
  const promedio = values.length > 0 ? Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)) : null

  // Sample standard deviation (s with Bessel's correction N-1)
  let desvioEstandar: number | null = null
  if (values.length > 1) {
    const mean = values.reduce((a, b) => a + b, 0) / values.length
    const sumSquares = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0)
    desvioEstandar = Number(Math.sqrt(sumSquares / (values.length - 1)).toFixed(4))
  } else {
    desvioEstandar = 0
  }

  return {
    id,
    name,
    source,
    ultimoValor: lastVal,
    fechaUltimo: lastPt.fecha,
    variacionPeriodo,
    minimo,
    maximo,
    desvioEstandar,
    promedio,
    unit,
  }
}
