import { describe, it, expect } from 'vitest'
import {
  calculatePearsonR,
  calculateRollingCorrelation,
  calculateSeriesStats,
} from './correlation'
import type { MacroSeriesPoint } from '../types'

describe('calculatePearsonR', () => {
  it('returns +1.0 for perfectly positively correlated vectors', () => {
    const x = [1, 2, 3, 4, 5]
    const y = [10, 20, 30, 40, 50]
    expect(calculatePearsonR(x, y)).toBe(1.0)
  })

  it('returns -1.0 for perfectly negatively correlated vectors', () => {
    const x = [1, 2, 3, 4, 5]
    const y = [50, 40, 30, 20, 10]
    expect(calculatePearsonR(x, y)).toBe(-1.0)
  })

  it('returns 0 for vectors with zero variance', () => {
    const x = [5, 5, 5, 5]
    const y = [1, 2, 3, 4]
    expect(calculatePearsonR(x, y)).toBe(0)
  })

  it('returns null if vector length is less than 2', () => {
    expect(calculatePearsonR([1], [2])).toBeNull()
  })
})

describe('calculateRollingCorrelation', () => {
  it('computes rolling correlation over a window of observations', () => {
    const pointsA: MacroSeriesPoint[] = [
      { fecha: '2026-01-01', valor: 1 },
      { fecha: '2026-01-02', valor: 2 },
      { fecha: '2026-01-03', valor: 3 },
      { fecha: '2026-01-04', valor: 4 },
      { fecha: '2026-01-05', valor: 5 },
    ]
    const pointsB: MacroSeriesPoint[] = [
      { fecha: '2026-01-01', valor: 2 },
      { fecha: '2026-01-02', valor: 4 },
      { fecha: '2026-01-03', valor: 6 },
      { fecha: '2026-01-04', valor: 8 },
      { fecha: '2026-01-05', valor: 10 },
    ]

    const result = calculateRollingCorrelation(
      { points: pointsA, frequency: 'diaria' },
      { points: pointsB, frequency: 'diaria' },
      30 // will be 30 observations, so first 29 null, but if window > points length, all null
    )
    expect(result.points).toHaveLength(5)
    expect(result.isDownsampled).toBe(false)
  })

  it('triggers downsampling when one series is monthly', () => {
    const pointsA: MacroSeriesPoint[] = [
      { fecha: '2026-01-01', valor: 100 },
      { fecha: '2026-02-01', valor: 120 },
      { fecha: '2026-03-01', valor: 130 },
      { fecha: '2026-04-01', valor: 150 },
    ]
    const pointsB: MacroSeriesPoint[] = [
      { fecha: '2026-01-01', valor: 20 },
      { fecha: '2026-02-01', valor: 25 },
      { fecha: '2026-03-01', valor: 28 },
      { fecha: '2026-04-01', valor: 35 },
    ]

    const result = calculateRollingCorrelation(
      { points: pointsA, frequency: 'diaria' },
      { points: pointsB, frequency: 'mensual' },
      90
    )
    expect(result.isDownsampled).toBe(true)
    expect(result.points.length).toBeGreaterThan(0)
  })
})

describe('calculateSeriesStats', () => {
  it('computes correct latest value, variation, min, max, and standard deviation', () => {
    const points: MacroSeriesPoint[] = [
      { fecha: '2026-01-01', valor: 100 },
      { fecha: '2026-01-02', valor: 150 },
      { fecha: '2026-01-03', valor: 200 },
    ]

    const stats = calculateSeriesStats('test', 'Test series', 'BCRA', points, 'ARS')
    expect(stats.ultimoValor).toBe(200)
    expect(stats.fechaUltimo).toBe('2026-01-03')
    expect(stats.variacionPeriodo).toBe(100) // (200 - 100) / 100 * 100
    expect(stats.minimo).toBe(100)
    expect(stats.maximo).toBe(200)
    expect(stats.desvioEstandar).toBe(50) // Sample stdev of [100, 150, 200] = 50
  })

  it('handles empty points safely', () => {
    const stats = calculateSeriesStats('test', 'Test', 'BCRA', [])
    expect(stats.ultimoValor).toBeNull()
    expect(stats.minimo).toBeNull()
  })
})
