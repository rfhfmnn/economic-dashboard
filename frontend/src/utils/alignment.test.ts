import { describe, it, expect } from 'vitest'
import {
  alignTimeSeries,
  downsampleToMonthly,
  forwardFillDaily,
  rebaseToBase100,
  rebaseToPercentChange,
} from './alignment'
import type { MacroSeriesPoint } from '../types'

describe('rebaseToBase100', () => {
  it('rebases series so first valid element is 100', () => {
    const points: MacroSeriesPoint[] = [
      { fecha: '2026-01-01', valor: 50 },
      { fecha: '2026-01-02', valor: 75 },
      { fecha: '2026-01-03', valor: 100 },
    ]
    const rebased = rebaseToBase100(points)
    expect(rebased[0].valor).toBe(100)
    expect(rebased[1].valor).toBe(150)
    expect(rebased[2].valor).toBe(200)
  })

  it('handles empty or zero starting values safely', () => {
    expect(rebaseToBase100([])).toEqual([])
  })
})

describe('rebaseToPercentChange', () => {
  it('rebases series to percentage change relative to t0', () => {
    const points: MacroSeriesPoint[] = [
      { fecha: '2026-01-01', valor: 50 },
      { fecha: '2026-01-02', valor: 75 },
      { fecha: '2026-01-03', valor: 50 },
    ]
    const rebased = rebaseToPercentChange(points)
    expect(rebased[0].valor).toBe(0)
    expect(rebased[1].valor).toBe(50)
    expect(rebased[2].valor).toBe(0)
  })
})

describe('forwardFillDaily', () => {
  it('forward fills monthly observations across all target daily dates', () => {
    const monthlyPoints: MacroSeriesPoint[] = [
      { fecha: '2026-01-01', valor: 10 },
      { fecha: '2026-02-01', valor: 20 },
    ]
    const targetDates = [
      '2026-01-01',
      '2026-01-15',
      '2026-01-31',
      '2026-02-01',
      '2026-02-10',
    ]
    const filled = forwardFillDaily(monthlyPoints, targetDates)

    expect(filled.find((p) => p.fecha === '2026-01-01')?.valor).toBe(10)
    expect(filled.find((p) => p.fecha === '2026-01-15')?.valor).toBe(10)
    expect(filled.find((p) => p.fecha === '2026-01-31')?.valor).toBe(10)
    expect(filled.find((p) => p.fecha === '2026-02-01')?.valor).toBe(20)
    expect(filled.find((p) => p.fecha === '2026-02-10')?.valor).toBe(20)
  })
})

describe('downsampleToMonthly', () => {
  it('downsamples daily points to monthly taking the last observation', () => {
    const dailyPoints: MacroSeriesPoint[] = [
      { fecha: '2026-01-05', valor: 100 },
      { fecha: '2026-01-20', valor: 105 },
      { fecha: '2026-02-02', valor: 110 },
    ]
    const downsampled = downsampleToMonthly(dailyPoints, 'last')
    expect(downsampled).toHaveLength(2)
    expect(downsampled[0].fecha).toBe('2026-01-01')
    expect(downsampled[0].valor).toBe(105)
    expect(downsampled[1].fecha).toBe('2026-02-01')
    expect(downsampled[1].valor).toBe(110)
  })
})

describe('alignTimeSeries', () => {
  it('harmonizes daily and monthly series onto a unified date grid', () => {
    const series1 = {
      key: 'daily_fx',
      frequency: 'diaria' as const,
      points: [
        { fecha: '2026-01-01', valor: 1000 },
        { fecha: '2026-01-02', valor: 1020 },
        { fecha: '2026-01-03', valor: 1010 },
      ],
    }
    const series2 = {
      key: 'monthly_cpi',
      frequency: 'mensual' as const,
      points: [{ fecha: '2026-01-01', valor: 25.0 }],
    }

    const aligned = alignTimeSeries([series1, series2])
    expect(aligned).toHaveLength(3)
    expect(aligned[0]).toEqual({
      fecha: '2026-01-01',
      daily_fx: 1000,
      monthly_cpi: 25.0,
    })
    expect(aligned[1]).toEqual({
      fecha: '2026-01-02',
      daily_fx: 1020,
      monthly_cpi: 25.0,
    })
    expect(aligned[2]).toEqual({
      fecha: '2026-01-03',
      daily_fx: 1010,
      monthly_cpi: 25.0,
    })
  })
})
