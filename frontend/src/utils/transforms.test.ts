import { describe, it, expect } from 'vitest'
import {
  transformOriginal,
  transformBase100,
  transformMoM,
  transformYoY,
  applyExpressionMode,
  getExpressionModeLabel,
  formatExpressionValue,
  type ExpressionMode,
} from './transforms'
import type { MacroSeriesPoint } from '../types'

describe('Analytical Transforms Engine (transforms.ts)', () => {
  describe('transformOriginal', () => {
    it('returns empty array when input is empty', () => {
      expect(transformOriginal([])).toEqual([])
    })

    it('returns points in original units sorted by date', () => {
      const points: MacroSeriesPoint[] = [
        { fecha: '2026-02-01', valor: 2500.5 },
        { fecha: '2026-01-01', valor: 2400.12345 },
      ]
      const result = transformOriginal(points)
      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({ fecha: '2026-01-01', valor: 2400.1235 })
      expect(result[1]).toEqual({ fecha: '2026-02-01', valor: 2500.5 })
    })
  })

  describe('transformBase100', () => {
    it('returns empty array when input is empty', () => {
      expect(transformBase100([])).toEqual([])
    })

    it('rebases series so t0 = 100 on the first valid point', () => {
      const points: MacroSeriesPoint[] = [
        { fecha: '2026-01-01', valor: 50 },
        { fecha: '2026-02-01', valor: 75 },
        { fecha: '2026-03-01', valor: 100 },
      ]
      const result = transformBase100(points)
      expect(result).toHaveLength(3)
      expect(result[0]).toEqual({ fecha: '2026-01-01', valor: 100 })
      expect(result[1]).toEqual({ fecha: '2026-02-01', valor: 150 })
      expect(result[2]).toEqual({ fecha: '2026-03-01', valor: 200 })
    })

    it('skips initial zero value to find the first valid non-zero base', () => {
      const points: MacroSeriesPoint[] = [
        { fecha: '2026-01-01', valor: 0 },
        { fecha: '2026-02-01', valor: 200 },
        { fecha: '2026-03-01', valor: 300 },
      ]
      const result = transformBase100(points)
      expect(result[0]).toEqual({ fecha: '2026-01-01', valor: 0 })
      expect(result[1]).toEqual({ fecha: '2026-02-01', valor: 100 })
      expect(result[2]).toEqual({ fecha: '2026-03-01', valor: 150 })
    })

    it('handles negative values correctly', () => {
      const points: MacroSeriesPoint[] = [
        { fecha: '2026-01-01', valor: 100 },
        { fecha: '2026-02-01', valor: -50 },
      ]
      const result = transformBase100(points)
      expect(result[0].valor).toBe(100)
      expect(result[1].valor).toBe(-50)
    })
  })

  describe('transformMoM', () => {
    it('returns empty array when input has fewer than 2 points', () => {
      expect(transformMoM([])).toEqual([])
      expect(transformMoM([{ fecha: '2026-01-01', valor: 100 }])).toEqual([])
    })

    it('calculates monthly MoM percentage change accurately for monthly frequency', () => {
      const points: MacroSeriesPoint[] = [
        { fecha: '2026-01-01', valor: 100 },
        { fecha: '2026-02-01', valor: 104 },
        { fecha: '2026-03-01', valor: 101.92 },
      ]
      const result = transformMoM(points, 'mensual')
      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({ fecha: '2026-02-01', valor: 4.0 })
      expect(result[1]).toEqual({ fecha: '2026-03-01', valor: -2.0 })
    })

    it('calculates daily MoM with 21 business days lag for daily frequency', () => {
      // 25 daily points
      const points: MacroSeriesPoint[] = Array.from({ length: 25 }, (_, i) => ({
        fecha: `2026-01-${String(i + 1).padStart(2, '0')}`,
        valor: 100 + i * 2, // 100, 102, 104, ..., 148
      }))

      const result = transformMoM(points, 'diaria', { dailyLag: 21 })
      // From index 21 onwards (points 21, 22, 23, 24)
      const pt21 = result.find((p) => p.fecha === '2026-01-22')!
      // Index 21 is '2026-01-22', valor is 100 + 21*2 = 142. Lag 21 is index 0 (100).
      // (142 - 100) / 100 * 100 = 42%
      expect(pt21.valor).toBe(42.0)
    })

    it('falls back to last observation of previous calendar month for daily points when i < lag', () => {
      const points: MacroSeriesPoint[] = [
        { fecha: '2026-01-30', valor: 100 },
        { fecha: '2026-01-31', valor: 102 },
        { fecha: '2026-02-03', valor: 105 },
      ]

      const result = transformMoM(points, 'diaria', { dailyLag: 21 })
      // '2026-02-03' has previous calendar month January with last value 102
      // (105 - 102) / 102 * 100 = 2.9412%
      const febPoint = result.find((p) => p.fecha === '2026-02-03')
      expect(febPoint).toBeDefined()
      expect(febPoint!.valor).toBeCloseTo(2.9412, 3)
    })
  })

  describe('transformYoY', () => {
    it('returns empty array when input has fewer points than lag', () => {
      const points: MacroSeriesPoint[] = [
        { fecha: '2026-01-01', valor: 100 },
        { fecha: '2026-02-01', valor: 105 },
      ]
      expect(transformYoY(points, 'mensual')).toEqual([])
    })

    it('calculates monthly YoY percentage change accurately for 12-month lag', () => {
      const points: MacroSeriesPoint[] = []
      // 14 months of data: Jan 2025 to Feb 2026
      for (let i = 0; i < 14; i++) {
        const year = i < 12 ? 2025 : 2026
        const month = (i % 12) + 1
        points.push({
          fecha: `${year}-${String(month).padStart(2, '0')}-01`,
          valor: 100 + i * 10,
        })
      }

      const result = transformYoY(points, 'mensual')
      expect(result).toHaveLength(2)
      // Jan 2026 (index 12, val 220) vs Jan 2025 (index 0, val 100): (220 - 100) / 100 * 100 = 120%
      expect(result[0]).toEqual({ fecha: '2026-01-01', valor: 120.0 })
      // Feb 2026 (index 13, val 230) vs Feb 2025 (index 1, val 110): (230 - 110) / 110 * 100 = 109.0909%
      expect(result[1].valor).toBeCloseTo(109.0909, 3)
    })

    it('calculates quarterly YoY with 4-quarter lag', () => {
      const points: MacroSeriesPoint[] = [
        { fecha: '2025-03-01', valor: 100 },
        { fecha: '2025-06-01', valor: 110 },
        { fecha: '2025-09-01', valor: 120 },
        { fecha: '2025-12-01', valor: 130 },
        { fecha: '2026-03-01', valor: 140 },
      ]
      const result = transformYoY(points, 'trimestral')
      expect(result).toHaveLength(1)
      // (140 - 100) / 100 * 100 = 40%
      expect(result[0]).toEqual({ fecha: '2026-03-01', valor: 40.0 })
    })

    it('calculates daily YoY with 252 business days lag or 1 calendar year fallback', () => {
      const points: MacroSeriesPoint[] = [
        { fecha: '2025-05-15', valor: 1000 },
        { fecha: '2026-05-15', valor: 1500 },
      ]
      const result = transformYoY(points, 'diaria')
      expect(result).toHaveLength(1)
      // (1500 - 1000) / 1000 * 100 = 50%
      expect(result[0]).toEqual({ fecha: '2026-05-15', valor: 50.0 })
    })
  })

  describe('applyExpressionMode', () => {
    const samplePoints: MacroSeriesPoint[] = [
      { fecha: '2026-01-01', valor: 100 },
      { fecha: '2026-02-01', valor: 110 },
    ]

    it('applies original mode', () => {
      const res = applyExpressionMode(samplePoints, 'original', 'mensual')
      expect(res).toEqual(samplePoints)
    })

    it('applies base100 mode', () => {
      const res = applyExpressionMode(samplePoints, 'base100', 'mensual')
      expect(res[0].valor).toBe(100)
      expect(res[1].valor).toBe(110)
    })

    it('applies mom mode', () => {
      const res = applyExpressionMode(samplePoints, 'mom', 'mensual')
      expect(res).toHaveLength(1)
      expect(res[0].valor).toBe(10.0)
    })

    it('defaults to original mode when unknown mode', () => {
      const res = applyExpressionMode(samplePoints, 'unknown' as ExpressionMode, 'mensual')
      expect(res).toEqual(samplePoints)
    })
  })

  describe('getExpressionModeLabel (Strict sentence case)', () => {
    it('returns exact sentence case label for all four expression modes', () => {
      expect(getExpressionModeLabel('original')).toBe('Unidad original')
      expect(getExpressionModeLabel('base100')).toBe('Base 100 (t₀ = 100)')
      expect(getExpressionModeLabel('mom')).toBe('Variación intermensual (MoM %)')
      expect(getExpressionModeLabel('yoy')).toBe('Variación interanual (YoY %)')
    })
  })

  describe('formatExpressionValue', () => {
    it('formats MoM and YoY values with signed percentage', () => {
      expect(formatExpressionValue(3.456, 'mom')).toBe('+3.46%')
      expect(formatExpressionValue(-1.2, 'mom')).toBe('-1.20%')
      expect(formatExpressionValue(0, 'mom')).toBe('0.00%')

      expect(formatExpressionValue(15.8, 'yoy')).toBe('+15.80%')
      expect(formatExpressionValue(-0.55, 'yoy')).toBe('-0.55%')
    })

    it('formats base100 values with 2 decimals', () => {
      expect(formatExpressionValue(104.256, 'base100')).toBe('104.26')
    })

    it('formats original values with locale number formatting and optional unit', () => {
      expect(formatExpressionValue(1250000.5, 'original', 'Millones ARS')).toContain('1.250.000,5')
      expect(formatExpressionValue(1250000.5, 'original', 'Millones ARS')).toContain('Millones ARS')
    })

    it('handles null, undefined, or NaN gracefully', () => {
      expect(formatExpressionValue(null, 'original')).toBe('—')
      expect(formatExpressionValue(undefined, 'mom')).toBe('—')
      expect(formatExpressionValue(NaN, 'base100')).toBe('—')
    })
  })
})
