import { describe, it, expect } from 'vitest'
import {
  inferSeriesTaxonomy,
  getTaxonomyAggregationLabel,
  getDaysInMonth,
  getDaysBetween,
  getMonthEndDate,
  getQuarterEndDate,
  isPeriodPartial,
  calculateEffectiveRate,
  resampleSeriesPoints,
  resampleChartSeries,
  resampleSeries,
} from './resampler'
import type { ChartSeries } from '../components/macro/MacroChart'

describe('Temporal Periodicity Resampler Engine', () => {
  describe('Taxonomy Inference', () => {
    it('correctly classifies known BCRA variables by ID', () => {
      expect(inferSeriesTaxonomy({ id: 1 })).toBe('stock') // Reservas
      expect(inferSeriesTaxonomy({ id: 4 })).toBe('fx') // TC Oficial A3500
      expect(inferSeriesTaxonomy({ id: 5 })).toBe('fx') // TC Minorista
      expect(inferSeriesTaxonomy({ id: 6 })).toBe('rate') // Tasa política monetaria
      expect(inferSeriesTaxonomy({ id: 7 })).toBe('rate') // Tasa BADLAR
      expect(inferSeriesTaxonomy({ id: 11 })).toBe('rate') // Tasa BAIBAR
      expect(inferSeriesTaxonomy({ id: 15 })).toBe('stock') // Base monetaria
      expect(inferSeriesTaxonomy({ id: 16 })).toBe('stock') // Billetes y monedas
      expect(inferSeriesTaxonomy({ id: 27 })).toBe('index') // Inflación mensual
      expect(inferSeriesTaxonomy({ id: 28 })).toBe('index') // Inflación interanual
      expect(inferSeriesTaxonomy({ id: 29 })).toBe('index') // CER
      expect(inferSeriesTaxonomy({ id: 30 })).toBe('index') // UVA
      expect(inferSeriesTaxonomy({ id: 34 })).toBe('stock') // Préstamos
      expect(inferSeriesTaxonomy({ id: 35 })).toBe('stock') // Depósitos
      expect(inferSeriesTaxonomy({ id: 74 })).toBe('stock') // Reservas sin DEG
      expect(inferSeriesTaxonomy({ id: 77 })).toBe('flow') // Reservas variación diaria
    })

    it('infers taxonomy from unit and title strings for unknown IDs', () => {
      expect(inferSeriesTaxonomy({ title: 'Dólar blue informal', unit: 'ARS/USD' })).toBe('fx')
      expect(inferSeriesTaxonomy({ title: 'Tasa de pases pasivos', unit: '% TNA' })).toBe('rate')
      expect(inferSeriesTaxonomy({ title: 'Saldo en cuenta corriente', unit: 'ARS M' })).toBe('stock')
      expect(inferSeriesTaxonomy({ title: 'Balanza comercial mensual', unit: 'USD M' })).toBe('flow')
      expect(inferSeriesTaxonomy({ title: 'Índice de producción industrial (IPI)', unit: 'Índice' })).toBe('index')
      expect(inferSeriesTaxonomy({ title: 'EMAE estimador mensual de actividad', unit: 'Índice' })).toBe('index')
    })
  })

  describe('Aggregation Labels & Sentence Case Standards', () => {
    it('returns strict sentence case labels for all combinations', () => {
      const periodicities = ['original', 'mensual', 'trimestral'] as const
      const taxonomies = ['fx', 'rate', 'stock', 'flow', 'index'] as const

      periodicities.forEach((p) => {
        taxonomies.forEach((t) => {
          const label = getTaxonomyAggregationLabel(t, p)
          expect(label).toBeDefined()
          expect(label.length).toBeGreaterThan(0)

          // Verify strict sentence case:
          // The first character may be uppercase, but words other than acronyms (TEM, TET) must not be capitalized
          const words = label.split(' ')
          expect(words[0][0]).toBe(words[0][0].toUpperCase())

          // Words after the first word must not start with an uppercase letter unless they are known acronyms
          for (let i = 1; i < words.length; i++) {
            const word = words[i].replace(/[(),]/g, '')
            if (['TEM', 'TET'].includes(word)) continue
            expect(word[0]).toBe(word[0].toLowerCase())
          }
        })
      })

      expect(getTaxonomyAggregationLabel('fx', 'mensual')).toBe('Promedio mensual')
      expect(getTaxonomyAggregationLabel('rate', 'mensual')).toBe('Tasa efectiva mensual capitalizada (TEM)')
      expect(getTaxonomyAggregationLabel('stock', 'mensual')).toBe('Saldo de cierre fin de período')
      expect(getTaxonomyAggregationLabel('flow', 'mensual')).toBe('Suma acumulada mensual')
      expect(getTaxonomyAggregationLabel('index', 'mensual')).toBe('Valor oficial mensual')

      expect(getTaxonomyAggregationLabel('fx', 'trimestral')).toBe('Promedio trimestral')
      expect(getTaxonomyAggregationLabel('rate', 'trimestral')).toBe('Tasa efectiva trimestral capitalizada (TET)')
      expect(getTaxonomyAggregationLabel('stock', 'trimestral')).toBe('Saldo de cierre fin de trimestre')
      expect(getTaxonomyAggregationLabel('flow', 'trimestral')).toBe('Suma acumulada trimestral')
      expect(getTaxonomyAggregationLabel('index', 'trimestral')).toBe('Valor oficial trimestral')
    })
  })

  describe('Calendar & Leap Year Helpers', () => {
    it('correctly calculates days in month including leap years', () => {
      expect(getDaysInMonth(2024, 2)).toBe(29) // 2024 is leap year
      expect(getDaysInMonth(2023, 2)).toBe(28) // 2023 is non-leap year
      expect(getDaysInMonth(2025, 2)).toBe(28) // 2025 is non-leap year
      expect(getDaysInMonth(2026, 8)).toBe(31) // August has 31 days
      expect(getDaysInMonth(2026, 9)).toBe(30) // September has 30 days
      expect(getDaysInMonth(2000, 2)).toBe(29) // 2000 is century leap year
      expect(getDaysInMonth(2100, 2)).toBe(28) // 2100 is not leap year
    })

    it('calculates days between ISO dates accurately', () => {
      expect(getDaysBetween('2026-08-01', '2026-08-01')).toBe(0)
      expect(getDaysBetween('2026-08-01', '2026-08-02')).toBe(1)
      expect(getDaysBetween('2026-08-07', '2026-08-10')).toBe(3) // Friday to Monday (weekend)
      expect(getDaysBetween('2026-08-01', '2026-08-31')).toBe(30)
    })

    it('computes month and quarter end dates', () => {
      expect(getMonthEndDate(2026, 2)).toBe('2026-02-28')
      expect(getMonthEndDate(2024, 2)).toBe('2024-02-29')
      expect(getMonthEndDate(2026, 8)).toBe('2026-08-31')

      expect(getQuarterEndDate(2026, 1)).toBe('2026-03-31')
      expect(getQuarterEndDate(2026, 2)).toBe('2026-06-30')
      expect(getQuarterEndDate(2026, 3)).toBe('2026-09-30')
      expect(getQuarterEndDate(2026, 4)).toBe('2026-12-31')
    })
  })

  describe('Financial Calculations by Taxonomy', () => {
    it('resamples exchange rates (fx) using arithmetic average', () => {
      const dailyPoints = [
        { fecha: '2026-08-03', valor: 1000 },
        { fecha: '2026-08-04', valor: 1020 },
        { fecha: '2026-08-05', valor: 1040 },
        { fecha: '2026-08-31', valor: 1060 },
      ]

      const refDate = new Date('2026-09-15T00:00:00Z')
      const monthly = resampleSeriesPoints(dailyPoints, 'fx', 'mensual', refDate)

      expect(monthly).toHaveLength(1)
      expect(monthly[0].fecha).toBe('2026-08-31')
      expect(monthly[0].valor).toBe(1030) // (1000+1020+1040+1060)/4 = 1030
      expect(monthly[0].isPartial).toBe(false)
    })

    it('resamples stocks (e.g. reservas, base monetaria) using end-of-period closing value', () => {
      const dailyPoints = [
        { fecha: '2026-08-01', valor: 27000 },
        { fecha: '2026-08-15', valor: 27500 },
        { fecha: '2026-08-28', valor: 28400 }, // Friday
        { fecha: '2026-08-31', valor: 28950 }, // Last business day
      ]

      const refDate = new Date('2026-09-15T00:00:00Z')
      const monthly = resampleSeriesPoints(dailyPoints, 'stock', 'mensual', refDate)

      expect(monthly).toHaveLength(1)
      expect(monthly[0].fecha).toBe('2026-08-31')
      expect(monthly[0].valor).toBe(28950) // EOP closing value
      expect(monthly[0].isPartial).toBe(false)
    })

    it('resamples cumulative flows using sum', () => {
      const dailyPoints = [
        { fecha: '2026-08-01', valor: 100 },
        { fecha: '2026-08-10', valor: -40 },
        { fecha: '2026-08-20', valor: 25 },
        { fecha: '2026-08-31', valor: 15 },
      ]

      const refDate = new Date('2026-09-15T00:00:00Z')
      const monthly = resampleSeriesPoints(dailyPoints, 'flow', 'mensual', refDate)

      expect(monthly).toHaveLength(1)
      expect(monthly[0].valor).toBe(100) // 100 - 40 + 25 + 15 = 100
    })

    it('resamples interest rates (% TNA) into compounded effective monthly rate (TEM) with weekend weighting', () => {
      // 36.5% constant TNA over 30 days:
      // (1 + 36.5 * 1 / 36500)^30 - 1 = (1.001)^30 - 1 = 0.03044 = ~3.04%
      // Testing with explicit Friday-Monday jump:
      // Friday Aug 7 to Monday Aug 10 = 3 days weighting
      const dailyPoints = [
        { fecha: '2026-08-03', valor: 36.5 }, // Mon -> Tue (1 day)
        { fecha: '2026-08-04', valor: 36.5 }, // Tue -> Wed (1 day)
        { fecha: '2026-08-05', valor: 36.5 }, // Wed -> Thu (1 day)
        { fecha: '2026-08-06', valor: 36.5 }, // Thu -> Fri (1 day)
        { fecha: '2026-08-07', valor: 36.5 }, // Fri -> Mon (3 days)
        { fecha: '2026-08-10', valor: 36.5 }, // Mon (last obs in this test)
      ]

      const effRate = calculateEffectiveRate(dailyPoints, 31, true, '2026-08-31')
      // Days elapsed: 1 + 1 + 1 + 1 + 3 + 1 = 8 days
      // Factor: (1 + 36.5 * 1 / 36500)^5 * (1 + 36.5 * 3 / 36500)
      // (1.001)^5 * (1.003) = 1.00501 * 1.003 = 1.008025 -> ~0.80%
      expect(effRate).toBeGreaterThan(0.79)
      expect(effRate).toBeLessThan(0.82)
    })

    it('resamples interest rates for a full month single observation', () => {
      const singlePoint = [{ fecha: '2026-08-01', valor: 36.5 }]
      const effRate = calculateEffectiveRate(singlePoint, 30, false, '2026-08-31')
      // 1 + 36.5 * 30 / 36500 = 1 + 0.03 = 1.03 -> 3.00% TEM
      expect(effRate).toBe(3.0)
    })

    it('preserves official published values for native monthly indices (IPC INDEC, EMAE)', () => {
      const monthlyIpc = [
        { fecha: '2026-06-30', valor: 2.1 },
        { fecha: '2026-07-31', valor: 2.5 },
        { fecha: '2026-08-31', valor: 2.0 },
      ]

      const refDate = new Date('2026-09-15T00:00:00Z')
      const monthly = resampleSeriesPoints(monthlyIpc, 'index', 'mensual', refDate)

      expect(monthly).toHaveLength(3)
      expect(monthly[0].valor).toBe(2.1)
      expect(monthly[1].valor).toBe(2.5)
      expect(monthly[2].valor).toBe(2.0)
      expect(monthly[0].fecha).toBe('2026-06-30')
    })

    it('compounds quarterly variations for index series when trimestral is selected', () => {
      const monthlyIpc = [
        { fecha: '2026-07-31', valor: 2.0 },
        { fecha: '2026-08-31', valor: 3.0 },
        { fecha: '2026-09-30', valor: 1.5 },
      ]

      const refDate = new Date('2026-10-15T00:00:00Z')
      const quarterly = resampleSeriesPoints(monthlyIpc, 'index', 'trimestral', refDate)

      expect(quarterly).toHaveLength(1)
      expect(quarterly[0].fecha).toBe('2026-09-30')
      // Compounded: (1.02 * 1.03 * 1.015 - 1) * 100 = 6.635% -> 6.64%
      expect(quarterly[0].valor).toBe(6.64)
      expect(quarterly[0].isPartial).toBe(false)
    })
  })

  describe('Partial & Incomplete Periods Detection', () => {
    it('evaluates isPeriodPartial helper directly', () => {
      // Historical period not latest
      expect(isPeriodPartial('2026-06-30', '2026-06-30', false, new Date('2026-09-01T00:00:00Z'))).toBe(false)
      // Latest period with reference date inside period
      expect(isPeriodPartial('2026-08-31', '2026-08-15', true, new Date('2026-08-16T00:00:00Z'))).toBe(true)
      // Historical complete period ending within 3 days
      expect(isPeriodPartial('2026-08-31', '2026-08-30', true, new Date('2026-09-15T00:00:00Z'))).toBe(false)
      // Cut off mid-month
      expect(isPeriodPartial('2026-08-31', '2026-08-15', true, new Date('2026-09-15T00:00:00Z'))).toBe(true)
    })

    it('flags incomplete in-progress month when observations end mid-month', () => {
      const dailyPoints = [
        { fecha: '2026-08-01', valor: 1000 },
        { fecha: '2026-08-15', valor: 1050 }, // Cut off on August 15 (16 days before month end)
      ]

      const refDate = new Date('2026-09-15T00:00:00Z')
      const monthly = resampleSeriesPoints(dailyPoints, 'stock', 'mensual', refDate)

      expect(monthly).toHaveLength(1)
      expect(monthly[0].isPartial).toBe(true)
      expect(monthly[0].valor).toBe(1050)
    })

    it('flags current ongoing month as partial when reference date is within the month', () => {
      const dailyPoints = [
        { fecha: '2026-08-01', valor: 1000 },
        { fecha: '2026-08-10', valor: 1020 },
      ]

      const refDate = new Date('2026-08-11T00:00:00Z') // Current month
      const monthly = resampleSeriesPoints(dailyPoints, 'fx', 'mensual', refDate)

      expect(monthly).toHaveLength(1)
      expect(monthly[0].isPartial).toBe(true)
    })

    it('does not flag complete historical months as partial even if month-end fell on a weekend', () => {
      // August 2026: Aug 28 is Friday, Aug 31 is Monday
      const dailyPoints = [
        { fecha: '2026-08-01', valor: 1000 },
        { fecha: '2026-08-31', valor: 1050 },
      ]

      const refDate = new Date('2026-09-15T00:00:00Z')
      const monthly = resampleSeriesPoints(dailyPoints, 'stock', 'mensual', refDate)

      expect(monthly).toHaveLength(1)
      expect(monthly[0].isPartial).toBe(false)
    })
  })

  describe('Edge Cases Handling', () => {
    it('returns empty array when input series is empty', () => {
      expect(resampleSeriesPoints([], 'stock', 'mensual')).toEqual([])
      expect(resampleSeriesPoints([], 'rate', 'trimestral')).toEqual([])
    })

    it('handles single observation series gracefully without errors or NaN', () => {
      const single = [{ fecha: '2026-08-10', valor: 1500 }]
      const resampled = resampleSeriesPoints(single, 'fx', 'mensual')

      expect(resampled).toHaveLength(1)
      expect(resampled[0].valor).toBe(1500)
      expect(isNaN(resampled[0].valor)).toBe(false)
    })

    it('preserves exact points when original periodicity is selected', () => {
      const points = [
        { fecha: '2026-08-01', valor: 100 },
        { fecha: '2026-08-02', valor: 105 },
      ]

      const original = resampleSeriesPoints(points, 'fx', 'original')
      expect(original).toHaveLength(2)
      expect(original[0].valor).toBe(100)
      expect(original[1].valor).toBe(105)
      expect(original[0].isPartial).toBe(false)
    })
  })

  describe('resampleChartSeries Wrapper', () => {
    it('resamples full ChartSeries and attaches metadata and updated unit for rates', () => {
      const series: ChartSeries = {
        id: 7,
        title: 'Tasa BADLAR bancos privados',
        unit: '% TNA',
        data: [
          { fecha: '2026-08-01', valor: 40.0 },
          { fecha: '2026-08-31', valor: 40.0 },
        ],
        axis: 'left',
        color: '#3b82f6',
      }

      const resampled = resampleChartSeries(series, 'mensual', new Date('2026-09-15T00:00:00Z'))

      expect(resampled.taxonomy).toBe('rate')
      expect(resampled.unit).toBe('% TEM')
      expect(resampled.aggregationMethod).toBe('Tasa efectiva mensual capitalizada (TEM)')
      expect(resampled.data).toHaveLength(1)
      expect(resampled.hasPartialPeriod).toBe(false)
    })

    it('updates unit to % TET when rate series is resampled to trimestral', () => {
      const series: ChartSeries = {
        id: 6,
        title: 'Tasa de política monetaria',
        unit: '% TNA',
        data: [{ fecha: '2026-07-15', valor: 40.0 }],
        axis: 'left',
        color: '#3b82f6',
      }

      const resampled = resampleChartSeries(series, 'trimestral', new Date('2026-10-15T00:00:00Z'))

      expect(resampled.taxonomy).toBe('rate')
      expect(resampled.unit).toBe('% TET')
      expect(resampled.aggregationMethod).toBe('Tasa efectiva trimestral capitalizada (TET)')
    })
  })

  describe('resampleSeries Universal Helper', () => {
    it('resamples Workbench series object correctly', () => {
      const workbenchSeries = {
        id: 'bcra_15',
        name: 'Base monetaria',
        unit: 'Millones ARS',
        frequency: 'diaria' as const,
        points: [
          { fecha: '2026-08-01', valor: 10000 },
          { fecha: '2026-08-31', valor: 12000 },
        ],
      }

      const resampled = resampleSeries(workbenchSeries, 'mensual')
      expect(resampled.taxonomy).toBe('stock')
      expect(resampled.frequency).toBe('mensual')
      expect(resampled.points).toHaveLength(1)
      expect(resampled.points[0].valor).toBe(12000)
    })

    it('resamples raw points array overload', () => {
      const points = [
        { fecha: '2026-08-01', valor: 1000 },
        { fecha: '2026-08-31', valor: 1100 },
      ]

      const resampled = resampleSeries(points, 'fx', 'mensual')
      expect(resampled).toHaveLength(1)
      expect(resampled[0].valor).toBe(1050)
    })
  })
})
