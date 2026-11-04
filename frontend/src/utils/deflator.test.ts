import { describe, it, expect } from 'vitest'
import {
  formatBaseMonth,
  isSeriesEligibleForDeflation,
  buildDeflatorModel,
  deflateSeries,
} from './deflator'
import type { CpiPoint, MacroSeriesPoint } from '../types'

describe('deflator utility', () => {
  describe('formatBaseMonth', () => {
    it('formats YYYY-MM to short Spanish representation', () => {
      expect(formatBaseMonth('2026-09')).toBe('Sep-2026')
      expect(formatBaseMonth('2026-08')).toBe('Ago-2026')
      expect(formatBaseMonth('2026-01')).toBe('Ene-2026')
    })

    it('formats with full month name when requested', () => {
      expect(formatBaseMonth('2026-09', true)).toBe('Septiembre 2026')
      expect(formatBaseMonth('2026-08', true)).toBe('Agosto 2026')
    })

    it('returns empty string on empty or invalid input', () => {
      expect(formatBaseMonth('')).toBe('')
      expect(formatBaseMonth(undefined)).toBe('')
    })
  })

  describe('isSeriesEligibleForDeflation', () => {
    it('identifies eligible ARS monetary series by ID', () => {
      expect(isSeriesEligibleForDeflation({ id: 15, title: 'Base monetaria total' })).toBe(true)
      expect(isSeriesEligibleForDeflation({ id: 16, title: 'Billetes y monedas en circulación' })).toBe(true)
      expect(isSeriesEligibleForDeflation({ id: 34, title: 'Préstamos al sector privado' })).toBe(true)
      expect(isSeriesEligibleForDeflation({ id: 35, title: 'Depósitos a plazo fijo' })).toBe(true)
    })

    it('identifies eligible series by unit or monetary name heuristics', () => {
      expect(isSeriesEligibleForDeflation({ title: 'Depósitos totales', unit: 'ARS M' })).toBe(true)
      expect(isSeriesEligibleForDeflation({ title: 'Créditos bancarios', unit: 'Millones ARS' })).toBe(true)
      expect(isSeriesEligibleForDeflation({ title: 'Circulación monetaria', unit: 'Pesos' })).toBe(true)
    })

    it('identifies percentage rate series as ineligible', () => {
      expect(isSeriesEligibleForDeflation({ id: 7, title: 'BADLAR', unit: '% TNA' })).toBe(false)
      expect(isSeriesEligibleForDeflation({ id: 6, title: 'Tasa de política monetaria', unit: '% TNA' })).toBe(false)
      expect(isSeriesEligibleForDeflation({ id: 27, title: 'Inflación intermensual', unit: '%' })).toBe(false)
      expect(isSeriesEligibleForDeflation({ id: 28, title: 'Inflación interanual', unit: '%' })).toBe(false)
    })

    it('identifies foreign currency amounts as ineligible', () => {
      expect(isSeriesEligibleForDeflation({ id: 1, title: 'Reservas internacionales', unit: 'USD M' })).toBe(false)
      expect(isSeriesEligibleForDeflation({ id: 74, title: 'Reservas sin DEG', unit: 'USD M' })).toBe(false)
      expect(isSeriesEligibleForDeflation({ id: 77, title: 'Variación reservas', unit: 'USD M' })).toBe(false)
    })

    it('identifies index and FX rate series as ineligible (CER, UVA, exchange rates)', () => {
      expect(isSeriesEligibleForDeflation({ id: 29, title: 'CER', unit: 'Índice' })).toBe(false)
      expect(isSeriesEligibleForDeflation({ id: 30, title: 'UVA', unit: 'ARS' })).toBe(false)
      expect(isSeriesEligibleForDeflation({ id: 31, title: 'UVI', unit: 'ARS' })).toBe(false)
      expect(isSeriesEligibleForDeflation({ id: 4, title: 'Tipo de cambio oficial', unit: 'ARS/USD' })).toBe(false)
      expect(isSeriesEligibleForDeflation({ id: 5, title: 'Tipo de cambio minorista', unit: 'ARS/USD' })).toBe(false)
    })
  })

  describe('buildDeflatorModel and deflateSeries', () => {
    const mockCpi: CpiPoint[] = [
      { fecha: '2026-06-30', valor: 2.0, indice: 100.0 },
      { fecha: '2026-07-31', valor: 2.5, indice: 102.5 },
      { fecha: '2026-08-31', valor: 2.0, indice: 104.55 },
    ]

    it('computes cumulative price index and latest base month', () => {
      const model = buildDeflatorModel(mockCpi)
      expect(model.hasCpiData).toBe(true)
      expect(model.baseMonth).toBe('2026-08')
      expect(model.baseMonthFormatted).toBe('Ago-2026')
      expect(model.baseIndex).toBe(104.55)

      // Latest month deflator factor must be exactly 1.0 (I_base / I_base)
      expect(model.factorByMonth.get('2026-08')).toBe(1.0)

      // Prior months must have factor > 1.0 (deflating past nominals to higher purchasing power)
      const factorJuly = model.factorByMonth.get('2026-07')!
      expect(factorJuly).toBeCloseTo(104.55 / 102.5, 4)
      expect(factorJuly).toBeGreaterThan(1.0)

      const factorJune = model.factorByMonth.get('2026-06')!
      expect(factorJune).toBeCloseTo(104.55 / 100.0, 4)
      expect(factorJune).toBeGreaterThan(factorJuly)
    })

    it('deflates observations in past months and leaves latest month at 1.0', () => {
      const model = buildDeflatorModel(mockCpi)
      const points: MacroSeriesPoint[] = [
        { fecha: '2026-06-15', valor: 1000 },
        { fecha: '2026-07-15', valor: 1000 },
        { fecha: '2026-08-15', valor: 1000 },
      ]

      const { deflatedPoints, hasPendingCpi } = deflateSeries(points, model)
      expect(hasPendingCpi).toBe(false)
      expect(deflatedPoints[2].valor).toBe(1000) // Aug 2026 is base month
      expect(deflatedPoints[1].valor).toBeCloseTo(1000 * (104.55 / 102.5), 1) // July 2026
      expect(deflatedPoints[0].valor).toBeCloseTo(1000 * (104.55 / 100.0), 1) // June 2026
    })

    it('falls back to factor 1.0 for observations in months following latest published CPI and flags pending', () => {
      const model = buildDeflatorModel(mockCpi)
      const points: MacroSeriesPoint[] = [
        { fecha: '2026-08-20', valor: 500 },
        { fecha: '2026-09-05', valor: 520 }, // Month after latest CPI (2026-08)
      ]

      const { deflatedPoints, hasPendingCpi } = deflateSeries(points, model)
      expect(hasPendingCpi).toBe(true)
      expect(deflatedPoints[0].valor).toBe(500)
      expect(deflatedPoints[1].valor).toBe(520) // Retains nominal
    })

    it('handles empty CPI data gracefully', () => {
      const emptyModel = buildDeflatorModel([])
      expect(emptyModel.hasCpiData).toBe(false)
      const points = [{ fecha: '2026-08-01', valor: 100 }]
      const { deflatedPoints, hasPendingCpi } = deflateSeries(points, emptyModel)
      expect(deflatedPoints).toEqual(points)
      expect(hasPendingCpi).toBe(false)
    })
  })
})
