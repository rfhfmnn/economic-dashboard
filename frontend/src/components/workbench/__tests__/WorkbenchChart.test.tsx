import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WorkbenchChart, calculateDomain } from '../WorkbenchChart'
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
})
