import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WorkbenchStatsTable } from '../WorkbenchStatsTable'
import type { WorkbenchSeriesStats } from '../../../types'

describe('WorkbenchStatsTable Component', () => {
  const sampleStats: WorkbenchSeriesStats[] = [
    {
      id: 'bcra_15',
      name: 'Base monetaria',
      source: 'BCRA',
      ultimoValor: 15.5,
      fechaUltimo: '2026-02-01',
      variacionPeriodo: 4.2,
      minimo: 10.0,
      maximo: 20.0,
      desvioEstandar: 2.3456,
      promedio: 14.8,
      unit: 'Millones ARS',
    },
  ]

  it('renders nothing when stats array is empty', () => {
    const { container } = render(<WorkbenchStatsTable stats={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders table headers and values in base100 mode', () => {
    render(<WorkbenchStatsTable stats={sampleStats} expressionMode="base100" />)

    expect(screen.getByText('Resumen estadístico de series activas')).toBeInTheDocument()
    expect(screen.getByText('Último valor (base 100)')).toBeInTheDocument()
    expect(screen.getByText('Variación período')).toBeInTheDocument()
    expect(screen.getByText('15.50')).toBeInTheDocument()
    expect(screen.getByText('+4.20%')).toBeInTheDocument()
  })

  it('renders table headers and values in original units mode', () => {
    render(<WorkbenchStatsTable stats={sampleStats} expressionMode="original" />)

    expect(screen.getByText('Último valor')).toBeInTheDocument()
    expect(screen.getByText('Variación período')).toBeInTheDocument()
    expect(screen.getByText('Mínimo')).toBeInTheDocument()
    expect(screen.getByText('Máximo')).toBeInTheDocument()
    expect(screen.getByText('+4.20%')).toBeInTheDocument()
  })

  it('renders table headers and signed percentage values in MoM mode', () => {
    render(<WorkbenchStatsTable stats={sampleStats} expressionMode="mom" />)

    expect(screen.getByText('Última var. MoM')).toBeInTheDocument()
    expect(screen.getByText('Promedio MoM')).toBeInTheDocument()
    expect(screen.getByText('Mínimo MoM')).toBeInTheDocument()
    expect(screen.getByText('Máximo MoM')).toBeInTheDocument()
    expect(screen.getByText('+15.50%')).toBeInTheDocument()
    expect(screen.getByText('+14.80%')).toBeInTheDocument()
    expect(screen.getByText('+10.00%')).toBeInTheDocument()
    expect(screen.getByText('+20.00%')).toBeInTheDocument()
  })

  it('renders table headers and signed percentage values in YoY mode', () => {
    render(<WorkbenchStatsTable stats={sampleStats} expressionMode="yoy" />)

    expect(screen.getByText('Última var. YoY')).toBeInTheDocument()
    expect(screen.getByText('Promedio YoY')).toBeInTheDocument()
    expect(screen.getByText('Mínimo YoY')).toBeInTheDocument()
    expect(screen.getByText('Máximo YoY')).toBeInTheDocument()
  })
})
