import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WorkbenchChart, calculateDomain, formatPeriodDate, WorkbenchChartTooltip } from '../WorkbenchChart'
import type { WorkbenchSeriesData } from '../../../types'

describe('calculateDomain helper', () => {
  it('calculates auto domain with 5% padding around min and max', () => {
    const data = [
      { fecha: '2026-01-01', s1: 100 },
      { fecha: '2026-01-02', s1: 105 },
    ]
    const domain = calculateDomain(data, ['s1'], 'auto')
    // min = 100, max = 105, range = 5, pad = 0.25 -> [99.75, 105.25]
    expect(domain[0]).toBeCloseTo(99.75)
    expect(domain[1]).toBeCloseTo(105.25)
  })

  it('includes zero as baseline in zero scale mode for positive values', () => {
    const data = [
      { fecha: '2026-01-01', s1: 100 },
      { fecha: '2026-01-02', s1: 105 },
    ]
    const domain = calculateDomain(data, ['s1'], 'zero')
    expect(domain).toEqual([0, 'auto'])
  })

  it('includes minimum negative value as baseline in zero scale mode', () => {
    const data = [
      { fecha: '2026-01-01', s1: -12.5 },
      { fecha: '2026-01-02', s1: 5.0 },
    ]
    const domain = calculateDomain(data, ['s1'], 'zero')
    expect(domain).toEqual([-12.5, 'auto'])
  })

  it('returns fallback domain when data is empty or non-numeric', () => {
    expect(calculateDomain([], ['s1'], 'auto')).toEqual(['auto', 'auto'])
    expect(calculateDomain([], ['s1'], 'zero')).toEqual([0, 'auto'])
  })
})

describe('WorkbenchChart Component', () => {
  const sampleSeries: WorkbenchSeriesData[] = [
    {
      id: 'bcra_15',
      source: 'BCRA',
      name: 'Base monetaria',
      color: '#2563eb',
      unit: 'Millones ARS',
      frequency: 'diaria',
      isArs: true,
      status: 'success',
      points: [
        { fecha: '2026-01-01', valor: 100 },
        { fecha: '2026-01-02', valor: 105 },
      ],
    },
  ]

  const fxSeries: WorkbenchSeriesData = {
    id: 'fx_blue',
    source: 'FX',
    name: 'Dólar blue',
    color: '#10b981',
    unit: 'ARS/USD',
    frequency: 'diaria',
    isArs: false,
    status: 'success',
    points: [
      { fecha: '2026-01-01', valor: 1200 },
      { fecha: '2026-01-02', valor: 1250 },
    ],
  }

  const sampleAlignedData = [
    { fecha: '2026-01-01', bcra_15: 100, fx_blue: 1200 },
    { fecha: '2026-01-02', bcra_15: 105, fx_blue: 1250 },
  ]

  it('renders empty placeholder when no active series is selected', () => {
    render(
      <WorkbenchChart
        viewMode="normalized"
        expressionMode="base100"
        alignedData={[]}
        activeSeries={[]}
        correlationPoints={[]}
      />
    )

    expect(
      screen.getByText('No hay series activas seleccionadas en la mesa de trabajo.')
    ).toBeInTheDocument()
  })

  it('displays correct subtitle for each expression mode', () => {
    const { rerender } = render(
      <WorkbenchChart
        viewMode="normalized"
        expressionMode="base100"
        alignedData={sampleAlignedData}
        activeSeries={sampleSeries}
        correlationPoints={[]}
      />
    )
    expect(screen.getByText('Índice de base 100 dinámico (t₀ = 100)')).toBeInTheDocument()

    rerender(
      <WorkbenchChart
        viewMode="normalized"
        expressionMode="original"
        alignedData={sampleAlignedData}
        activeSeries={sampleSeries}
        correlationPoints={[]}
      />
    )
    expect(screen.getByText('Valores en unidad original')).toBeInTheDocument()

    rerender(
      <WorkbenchChart
        viewMode="normalized"
        expressionMode="mom"
        alignedData={sampleAlignedData}
        activeSeries={sampleSeries}
        correlationPoints={[]}
      />
    )
    expect(screen.getByText('Variación intermensual (MoM %)')).toBeInTheDocument()

    rerender(
      <WorkbenchChart
        viewMode="normalized"
        expressionMode="yoy"
        alignedData={sampleAlignedData}
        activeSeries={sampleSeries}
        correlationPoints={[]}
      />
    )
    expect(screen.getByText('Variación interanual (YoY %)')).toBeInTheDocument()
  })

  it('renders dual Y-axes indicators when exactly 2 series have different units in original mode', () => {
    render(
      <WorkbenchChart
        viewMode="normalized"
        expressionMode="original"
        alignedData={sampleAlignedData}
        activeSeries={[sampleSeries[0], fxSeries]}
        correlationPoints={[]}
      />
    )

    expect(screen.getByText(/Eje izquierdo \(Y₁\):/)).toBeInTheDocument()
    expect(screen.getByText(/\[BCRA\] Base monetaria \(Millones ARS\)/)).toBeInTheDocument()

    expect(screen.getByText(/Eje derecho \(Y₂\):/)).toBeInTheDocument()
    expect(screen.getByText(/\[FX\] Dólar blue \(ARS\/USD\)/)).toBeInTheDocument()
  })

  it('does not render dual Y-axes indicators when 2 series have the same unit', () => {
    const sameUnitSeries: WorkbenchSeriesData = {
      ...fxSeries,
      id: 'bcra_16',
      unit: 'Millones ARS',
      name: 'Circulación monetaria',
    }

    render(
      <WorkbenchChart
        viewMode="normalized"
        expressionMode="original"
        alignedData={sampleAlignedData}
        activeSeries={[sampleSeries[0], sameUnitSeries]}
        correlationPoints={[]}
      />
    )

    expect(screen.queryByText(/Eje izquierdo \(Y₁\):/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Eje derecho \(Y₂\):/)).not.toBeInTheDocument()
  })

  it('displays warning banner when 3 or more series have heterogeneous units in original mode', () => {
    const thirdSeries: WorkbenchSeriesData = {
      id: 'indec_ipc',
      source: 'INDEC',
      name: 'IPC nacional',
      color: '#f59e0b',
      unit: '% mensual',
      frequency: 'mensual',
      isArs: false,
      status: 'success',
      points: [],
    }

    const { rerender } = render(
      <WorkbenchChart
        viewMode="normalized"
        expressionMode="original"
        alignedData={sampleAlignedData}
        activeSeries={[sampleSeries[0], fxSeries, thirdSeries]}
        correlationPoints={[]}
      />
    )

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('Unidades heterogéneas en escala original')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Se detectaron 3 o más series con unidades distintas. Se recomienda utilizar el modo base 100 o variación porcentual para evitar ambigüedad de escala.'
      )
    ).toBeInTheDocument()

    // Switching to base 100 hides the warning banner
    rerender(
      <WorkbenchChart
        viewMode="normalized"
        expressionMode="base100"
        alignedData={sampleAlignedData}
        activeSeries={[sampleSeries[0], fxSeries, thirdSeries]}
        correlationPoints={[]}
      />
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('renders dual Y-axes for 3 series when one is explicitly assigned to right axis', () => {
    const rightAssignedSeries: WorkbenchSeriesData = {
      ...fxSeries,
      axis: 'right',
    }
    const thirdSeries: WorkbenchSeriesData = {
      id: 'indec_ipi',
      source: 'INDEC',
      name: 'IPI manufacturero',
      color: '#f59e0b',
      unit: 'Índice base 2004=100',
      frequency: 'mensual',
      isArs: false,
      status: 'success',
      points: [],
      axis: 'left',
    }

    render(
      <WorkbenchChart
        viewMode="normalized"
        expressionMode="original"
        alignedData={sampleAlignedData}
        activeSeries={[sampleSeries[0], thirdSeries, rightAssignedSeries]}
        correlationPoints={[]}
      />
    )

    expect(screen.getByText(/Eje izquierdo \(Y₁\):/)).toBeInTheDocument()
    expect(screen.getByText(/Eje derecho \(Y₂\):/)).toBeInTheDocument()
  })

  describe('formatPeriodDate helper', () => {
    it('formats dates as YYYY-MM in monthly periodicity', () => {
      expect(formatPeriodDate('2026-01-31', 'mensual')).toBe('2026-01')
      expect(formatPeriodDate('2026-12-31', 'mensual')).toBe('2026-12')
      expect(formatPeriodDate('2026-05-15', 'mensual')).toBe('2026-05')
    })

    it('formats dates as YYYY-Q[1-4] in quarterly periodicity', () => {
      expect(formatPeriodDate('2026-03-31', 'trimestral')).toBe('2026-Q1')
      expect(formatPeriodDate('2026-06-30', 'trimestral')).toBe('2026-Q2')
      expect(formatPeriodDate('2026-09-30', 'trimestral')).toBe('2026-Q3')
      expect(formatPeriodDate('2026-12-31', 'trimestral')).toBe('2026-Q4')
      expect(formatPeriodDate('2026-Q1', 'trimestral')).toBe('2026-Q1')
    })

    it('preserves full ISO date in original periodicity or when missing', () => {
      expect(formatPeriodDate('2026-01-31', 'original')).toBe('2026-01-31')
      expect(formatPeriodDate('2026-01-31')).toBe('2026-01-31')
      expect(formatPeriodDate('')).toBe('')
      expect(formatPeriodDate(null)).toBe('')
    })
  })

  describe('Line curve style and periodicity rendering', () => {
    const monthlySeries: WorkbenchSeriesData = {
      id: 'indec_ipc',
      source: 'INDEC',
      name: 'IPC nacional',
      color: '#f59e0b',
      unit: '% mensual',
      frequency: 'mensual',
      isArs: false,
      status: 'success',
      points: [
        { fecha: '2026-01-31', valor: 2.5 },
        { fecha: '2026-02-28', valor: 2.2 },
      ],
    }

    it('renders chart with continuous curve (monotone) by default even for monthly series', () => {
      const { container } = render(
        <WorkbenchChart
          viewMode="normalized"
          expressionMode="original"
          periodicity="mensual"
          lineStyle="monotone"
          alignedData={[{ fecha: '2026-01-31', indec_ipc: 2.5 }]}
          activeSeries={[monthlySeries]}
          correlationPoints={[]}
        />
      )

      expect(container.querySelector('.recharts-responsive-container')).toBeInTheDocument()
    })

    it('renders stepped chart when lineStyle is set to step', () => {
      const { container } = render(
        <WorkbenchChart
          viewMode="normalized"
          expressionMode="original"
          periodicity="mensual"
          lineStyle="step"
          alignedData={[{ fecha: '2026-01-31', indec_ipc: 2.5 }]}
          activeSeries={[monthlySeries]}
          correlationPoints={[]}
        />
      )

      expect(container.querySelector('.recharts-responsive-container')).toBeInTheDocument()
    })
  })

  describe('REM series projection rendering and tooltip badges', () => {
    const remSeries: WorkbenchSeriesData = {
      id: 'rem_tipo_cambio',
      source: 'REM',
      name: 'Tipo de cambio esperado',
      color: '#f59e0b',
      unit: 'ARS/USD',
      frequency: 'mensual',
      isArs: false,
      status: 'success',
      points: [
        { fecha: '2026-08-01', valor: 1040, is_forecast: false, mediana: 1040 },
        { fecha: '2026-09-01', valor: 1060, is_forecast: true, mediana: 1060, p25: 1040, p75: 1080 },
        { fecha: '2026-10-01', valor: 1080, is_forecast: true, mediana: 1080, p25: 1060, p75: 1100 },
      ],
    }

    const alignedRemData = [
      { fecha: '2026-08-01', rem_tipo_cambio: 1040 },
      { fecha: '2026-09-01', rem_tipo_cambio: 1060 },
      { fecha: '2026-10-01', rem_tipo_cambio: 1080 },
    ]

    it('renders REM series across past history and future projection dates', () => {
      const { container } = render(
        <WorkbenchChart
          viewMode="normalized"
          expressionMode="original"
          alignedData={alignedRemData}
          activeSeries={[remSeries]}
          correlationPoints={[]}
        />
      )

      expect(container.querySelector('.recharts-responsive-container')).toBeInTheDocument()
      expect(screen.getByText('Valores en unidad original')).toBeInTheDocument()
      expect(screen.getByText('3 observaciones cronológicas')).toBeInTheDocument()
    })

    it('renders WorkbenchChartTooltip with Proyección REM badge for forecast points in strict sentence case', () => {
      render(
        <WorkbenchChartTooltip
          active={true}
          label="2026-09-01"
          payload={[{ dataKey: 'rem_tipo_cambio_forecast', value: 1060 }]}
          activeSeries={[remSeries]}
          mode="original"
          periodicity="mensual"
        />
      )

      expect(screen.getByText('Fecha: 2026-09')).toBeInTheDocument()
      expect(screen.getByText('[REM] Tipo de cambio esperado')).toBeInTheDocument()
      expect(screen.getByTestId('forecast-badge')).toHaveTextContent('Proyección REM')
    })

    it('does not render Proyección REM badge for historical points', () => {
      render(
        <WorkbenchChartTooltip
          active={true}
          label="2026-08-01"
          payload={[{ dataKey: 'rem_tipo_cambio_hist', value: 1040 }]}
          activeSeries={[remSeries]}
          mode="original"
          periodicity="mensual"
        />
      )

      expect(screen.getByText('Fecha: 2026-08')).toBeInTheDocument()
      expect(screen.getByText('[REM] Tipo de cambio esperado')).toBeInTheDocument()
      expect(screen.queryByTestId('forecast-badge')).not.toBeInTheDocument()
    })
  })
})
