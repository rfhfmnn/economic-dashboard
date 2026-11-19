import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WorkbenchChart } from '../WorkbenchChart'
import type { WorkbenchSeriesData } from '../../../types'

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

  const sampleAlignedData = [
    { fecha: '2026-01-01', bcra_15: 100 },
    { fecha: '2026-01-02', bcra_15: 105 },
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
})
