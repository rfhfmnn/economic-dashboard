import { describe, it, expect } from 'vitest'
import {
  rebaseSeriesToBase100,
  chainMonthlyVariations,
  findBaseObservation,
  formatDateToDdMmYyyy,
  formatIndexValue,
  formatIndexVariation,
  computeIndexVariation,
  isMonthlyVariationSeries,
} from './indexer'
import type { MacroSeriesPoint } from '../types'

describe('Base-100 Indexation Engine (indexer.ts)', () => {
  describe('Standard series rebase to base 100', () => {
    it('normalizes a positive time-series setting base t0 to 100.00', () => {
      const points: MacroSeriesPoint[] = [
        { fecha: '2026-01-01', valor: 500 },
        { fecha: '2026-02-01', valor: 750 },
        { fecha: '2026-03-01', valor: 1000 },
      ]

      const result = rebaseSeriesToBase100(points)

      expect(result).toHaveLength(3)
      expect(result[0]).toEqual({
        fecha: '2026-01-01',
        valor: 100.0,
        originalValor: 500,
        variationPct: 0.0,
      })
      expect(result[1]).toEqual({
        fecha: '2026-02-01',
        valor: 150.0,
        originalValor: 750,
        variationPct: 50.0,
      })
      expect(result[2]).toEqual({
        fecha: '2026-03-01',
        valor: 200.0,
        originalValor: 1000,
        variationPct: 100.0,
      })
    })

    it('respects decimal precision parameter', () => {
      const points: MacroSeriesPoint[] = [
        { fecha: '2026-01-01', valor: 300 },
        { fecha: '2026-02-01', valor: 400 },
      ]

      const result = rebaseSeriesToBase100(points, { precision: 4 })
      expect(result[1].valor).toBe(133.3333)
      expect(result[1].variationPct).toBe(33.3333)
    })

    it('re-indexes series that are already indices (e.g. CER, UVA, IPC)', () => {
      const cerPoints: MacroSeriesPoint[] = [
        { fecha: '2026-05-01', valor: 120.5 },
        { fecha: '2026-06-01', valor: 126.525 }, // +5%
        { fecha: '2026-07-01', valor: 132.55 },
      ]

      const result = rebaseSeriesToBase100(cerPoints)
      expect(result[0].valor).toBe(100.0)
      expect(result[1].valor).toBe(105.0)
      expect(result[1].variationPct).toBe(5.0)
    })
  })

  describe('Custom base date handling (customBaseDate)', () => {
    const points: MacroSeriesPoint[] = [
      { fecha: '2026-01-10', valor: 200 },
      { fecha: '2026-02-10', valor: 400 },
      { fecha: '2026-03-10', valor: 600 },
    ]

    it('anchors t0 to an exact custom base date without clipping the range', () => {
      const result = rebaseSeriesToBase100(points, { customBaseDate: '2026-02-10' })

      expect(result).toHaveLength(3)
      // Earlier observation has index < 100 and negative variation
      expect(result[0]).toEqual({
        fecha: '2026-01-10',
        valor: 50.0,
        originalValor: 200,
        variationPct: -50.0,
      })
      // Base date is exactly 100
      expect(result[1]).toEqual({
        fecha: '2026-02-10',
        valor: 100.0,
        originalValor: 400,
        variationPct: 0.0,
      })
      // Subsequent observation is > 100
      expect(result[2]).toEqual({
        fecha: '2026-03-10',
        valor: 150.0,
        originalValor: 600,
        variationPct: 50.0,
      })
    })

    it('selects the immediate subsequent business day when custom date falls on a weekend or non-trading day', () => {
      // 2026-02-14 is Saturday; available observation is Monday 2026-02-16
      const seriesWithWeekends: MacroSeriesPoint[] = [
        { fecha: '2026-02-13', valor: 100 }, // Friday
        { fecha: '2026-02-16', valor: 110 }, // Monday
        { fecha: '2026-02-17', valor: 121 },
      ]

      const result = rebaseSeriesToBase100(seriesWithWeekends, { customBaseDate: '2026-02-14' })

      // Base observation chosen should be 2026-02-16 (110)
      expect(result[1].fecha).toBe('2026-02-16')
      expect(result[1].valor).toBe(100.0)
      // Friday 2026-02-13: 100 / 110 * 100 = 90.91
      expect(result[0].valor).toBe(90.91)
      expect(result[0].variationPct).toBe(-9.09)
      // Tuesday 2026-02-17: 121 / 110 * 100 = 110.0
      expect(result[2].valor).toBe(110.0)
    })

    it('falls back to the closest available observation when custom date is beyond the series end', () => {
      const result = rebaseSeriesToBase100(points, { customBaseDate: '2026-12-31' })
      // Last observation is 2026-03-10 (600)
      expect(result[2].valor).toBe(100.0)
      expect(result[0].valor).toBe(33.33)
    })
  })

  describe('Monthly percentage variation chaining (isMonthlyVariation)', () => {
    it('compounds monthly percentage variations forward from base date = 100.0', () => {
      const inflationRates: MacroSeriesPoint[] = [
        { fecha: '2026-01-31', valor: 4.0 }, // +4%
        { fecha: '2026-02-28', valor: 3.0 }, // +3%
        { fecha: '2026-03-31', valor: 2.0 }, // +2%
      ]

      const result = chainMonthlyVariations(inflationRates, '2026-01-31')

      expect(result[0].valor).toBe(100.0)
      expect(result[0].variationPct).toBe(0.0)

      // Feb: 100 * (1 + 3/100) = 103.00
      expect(result[1].valor).toBe(103.0)
      expect(result[1].variationPct).toBe(3.0)

      // Mar: 103 * (1 + 2/100) = 105.06
      expect(result[2].valor).toBe(105.06)
      expect(result[2].variationPct).toBe(5.06)
    })

    it('de-compounds monthly percentage variations backward for dates prior to t0', () => {
      const inflationRates: MacroSeriesPoint[] = [
        { fecha: '2026-01-31', valor: 5.0 }, // +5% in Jan
        { fecha: '2026-02-28', valor: 4.0 }, // +4% in Feb
        { fecha: '2026-03-31', valor: 2.0 }, // +2% in Mar
      ]

      // Anchor base to Feb
      const result = chainMonthlyVariations(inflationRates, '2026-02-28')

      expect(result[1].valor).toBe(100.0)
      expect(result[1].variationPct).toBe(0.0)

      // Forward: Mar: 100 * 1.02 = 102.00
      expect(result[2].valor).toBe(102.0)
      expect(result[2].variationPct).toBe(2.0)

      // Backward: Jan: since Feb index (100) = Jan index * 1.04 => Jan index = 100 / 1.04 = 96.15
      expect(result[0].valor).toBe(96.15)
      expect(result[0].variationPct).toBe(-3.85)
    })
  })

  describe('Edge cases and safety defenses', () => {
    it('returns empty array when input points array is empty', () => {
      expect(rebaseSeriesToBase100([])).toEqual([])
      expect(chainMonthlyVariations([])).toEqual([])
    })

    it('safely handles zero base value without division by zero', () => {
      const pointsWithZero: MacroSeriesPoint[] = [
        { fecha: '2026-01-01', valor: 0 },
        { fecha: '2026-02-01', valor: 100 },
      ]

      const result = rebaseSeriesToBase100(pointsWithZero)
      expect(result[0].valor).toBeNull()
      expect(result[1].valor).toBeNull()
      expect(result[0].variationPct).toBeNull()
    })

    it('safely handles negative base value without crashing or sign reversal', () => {
      const pointsWithNegative: MacroSeriesPoint[] = [
        { fecha: '2026-01-01', valor: -50 },
        { fecha: '2026-02-01', valor: 100 },
      ]

      const result = rebaseSeriesToBase100(pointsWithNegative)
      expect(result[0].valor).toBeNull()
      expect(result[1].valor).toBeNull()
    })

    it('handles single observation series', () => {
      const singlePoint: MacroSeriesPoint[] = [{ fecha: '2026-01-01', valor: 1250 }]
      const result = rebaseSeriesToBase100(singlePoint)

      expect(result).toHaveLength(1)
      expect(result[0].valor).toBe(100.0)
      expect(result[0].variationPct).toBe(0.0)
      expect(result[0].originalValor).toBe(1250)
    })

    it('preserves chronological order regardless of unsorted inputs', () => {
      const unsorted: MacroSeriesPoint[] = [
        { fecha: '2026-03-01', valor: 300 },
        { fecha: '2026-01-01', valor: 100 },
        { fecha: '2026-02-01', valor: 200 },
      ]

      const result = rebaseSeriesToBase100(unsorted)
      expect(result[0].fecha).toBe('2026-01-01')
      expect(result[0].valor).toBe(100.0)
      expect(result[1].fecha).toBe('2026-02-01')
      expect(result[1].valor).toBe(200.0)
      expect(result[2].fecha).toBe('2026-03-01')
      expect(result[2].valor).toBe(300.0)
    })
  })

  describe('Observation search and detection helpers', () => {
    const points: MacroSeriesPoint[] = [
      { fecha: '2026-03-01', valor: 10 },
      { fecha: '2026-03-15', valor: 20 },
      { fecha: '2026-03-30', valor: 30 },
    ]

    it('findBaseObservation returns first point when no targetDate is supplied', () => {
      expect(findBaseObservation(points)).toEqual({ fecha: '2026-03-01', valor: 10 })
    })

    it('findBaseObservation returns exact match when targetDate exists', () => {
      expect(findBaseObservation(points, '2026-03-15')).toEqual({ fecha: '2026-03-15', valor: 20 })
    })

    it('findBaseObservation returns first observation when targetDate is before start of series', () => {
      expect(findBaseObservation(points, '2026-01-01')).toEqual({ fecha: '2026-03-01', valor: 10 })
    })

    it('isMonthlyVariationSeries correctly detects monthly variation series', () => {
      expect(isMonthlyVariationSeries({ id: 27 })).toBe(true)
      expect(isMonthlyVariationSeries({ unit: '%', title: 'Inflación intermensual' })).toBe(true)
      expect(isMonthlyVariationSeries({ unit: '%', title: 'Variación mensual de precios' })).toBe(true)
      // Rates are % TNA, not monthly variations
      expect(isMonthlyVariationSeries({ id: 6, unit: '% TNA', title: 'Tasa de política monetaria' })).toBe(false)
      expect(isMonthlyVariationSeries({ id: 7, unit: '% TNA', title: 'Tasa BADLAR' })).toBe(false)
    })
  })

  describe('Formatting and variation helpers', () => {
    it('formatDateToDdMmYyyy formats YYYY-MM-DD and YYYY-MM correctly', () => {
      expect(formatDateToDdMmYyyy('2026-08-15')).toBe('15/08/2026')
      expect(formatDateToDdMmYyyy('2026-08')).toBe('01/08/2026')
      expect(formatDateToDdMmYyyy('')).toBe('')
    })

    it('formatIndexValue formats numbers with 2 decimals in es-AR', () => {
      expect(formatIndexValue(142.35)).toBe('142,35')
      expect(formatIndexValue(100)).toBe('100,00')
      expect(formatIndexValue(null)).toBe('-')
    })

    it('formatIndexVariation formats positive, negative and zero changes', () => {
      expect(formatIndexVariation(42.35)).toBe('+42,35%')
      expect(formatIndexVariation(-12.1)).toBe('-12,10%')
      expect(formatIndexVariation(0)).toBe('0,00%')
      expect(formatIndexVariation(null)).toBe('-')
    })

    it('computeIndexVariation computes index - 100 rounded to 2 decimals', () => {
      expect(computeIndexVariation(142.356)).toBe(42.36)
      expect(computeIndexVariation(85.5)).toBe(-14.5)
      expect(computeIndexVariation(null)).toBeNull()
    })
  })
})
