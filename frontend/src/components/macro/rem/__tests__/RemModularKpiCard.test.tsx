import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RemModularKpiCard } from '../RemModularKpiCard'
import { RemModularVariableData } from '../../../../types'

const mockCpiVariable: RemModularVariableData = {
  id: 'cpi_general',
  name: 'Inflación General (IPC)',
  category: 'Precios',
  is_monthly: true,
  is_quarterly: false,
  default_horizon: 'next_month',
  available_horizons: [
    { id: 'next_month', name: 'Próximo Mes' },
    { id: '12m', name: 'Próximos 12 Meses' },
    { id: 'year_end_current', name: 'Fin de Año 2026' },
  ],
  horizons: {
    next_month: {
      value: 1.9,
      unit: '% mensual',
      period: 'Oct-26',
      p25: 1.82,
      p75: 1.98,
      top10_divergence: 0.04,
      divergence_flag: false,
      future_sparkline: [
        { period: 'Oct-26', value: 1.9 },
        { period: 'Nov-26', value: 1.85 },
        { period: 'Dic-26', value: 1.8 },
      ],
      historical_sparkline: [
        { period: '2026-07', value: 2.3 },
        { period: '2026-08', value: 2.1 },
        { period: '2026-09', value: 1.9 },
      ],
    },
    '12m': {
      value: 21.1,
      unit: '% i.a.',
      period: 'próx. 12 meses',
      p25: 20.05,
      p75: 22.16,
      top10_divergence: 0.42,
      divergence_flag: true,
      future_sparkline: [{ period: 'próx. 12 meses', value: 21.1 }],
      historical_sparkline: [{ period: '2026-09', value: 21.1 }],
    },
  },
  expectation_vs_reality: {
    variable_id: 'cpi_general',
    latest_period: 'Sep-26',
    real_value: 2.1,
    previous_forecast: 2.3,
    surprise_delta: -0.2,
    status: 'favorable',
    unit: '% mensual',
    history: [
      { period: 'Jun-26', real: 2.8, forecast: 3.0, delta: -0.2 },
      { period: 'Jul-26', real: 2.5, forecast: 2.6, delta: -0.1 },
      { period: 'Ago-26', real: 2.3, forecast: 2.3, delta: 0.0 },
      { period: 'Sep-26', real: 2.1, forecast: 2.3, delta: -0.2 },
    ],
  },
}

describe('RemModularKpiCard Component', () => {
  it('renders dedicated variable title, horizon selector, value, period, and P25-P75 band', () => {
    const handleHChange = vi.fn()

    render(
      <RemModularKpiCard
        variableData={mockCpiVariable}
        selectedHorizonId="next_month"
        cohort="todos"
        onHorizonChange={handleHChange}
      />
    )

    // Dedicated title
    expect(screen.getByText('Inflación General (IPC)')).toBeInTheDocument()

    // Horizon selector
    const hSelect = screen.getByTestId('horizon-select-cpi_general') as HTMLSelectElement
    expect(hSelect).toBeInTheDocument()
    expect(hSelect.value).toBe('next_month')

    // Value and period
    expect(screen.getByTestId('kpi-value-cpi_general')).toHaveTextContent('1,9%')
    expect(screen.getByTestId('kpi-period-tag-cpi_general')).toHaveTextContent('Oct-26')

    // Interquartile confidence band
    expect(screen.getByText(/1.8% — 2.0%/)).toBeInTheDocument()

    // Cohort and divergence
    expect(screen.getByText(/Consenso Total/)).toBeInTheDocument()
    expect(screen.getByText(/Div. Top 10: 0.04/)).toBeInTheDocument()
  })

  it('triggers onHorizonChange when user selects a different horizon', () => {
    const handleHChange = vi.fn()

    render(
      <RemModularKpiCard
        variableData={mockCpiVariable}
        selectedHorizonId="next_month"
        cohort="todos"
        onHorizonChange={handleHChange}
      />
    )

    const hSelect = screen.getByTestId('horizon-select-cpi_general')
    fireEvent.change(hSelect, { target: { value: '12m' } })
    expect(handleHChange).toHaveBeenCalledWith('12m')
  })

  it('toggles between future trajectory and expectation vs reality modes', () => {
    render(
      <RemModularKpiCard
        variableData={mockCpiVariable}
        selectedHorizonId="next_month"
        cohort="todos"
        onHorizonChange={vi.fn()}
      />
    )

    // Initially in future projection mode
    expect(screen.getByText('Curva Proyectada')).toBeInTheDocument()

    // Click Real vs Previsto toggle
    const realityBtn = screen.getByTestId('view-toggle-reality-cpi_general')
    fireEvent.click(realityBtn)

    // Verify Real vs Previsto mode elements
    expect(screen.getByText('Real vs Pronóstico')).toBeInTheDocument()
    expect(screen.getByText(/Último cerrado \(Sep-26\):/)).toBeInTheDocument()
    expect(screen.getByText(/Sorpresa: -0.2 pp/)).toBeInTheDocument()
    expect(screen.getByText('2,1%')).toBeInTheDocument()
    expect(screen.getByText('2,3%')).toBeInTheDocument()

    // Switch back to Future mode
    const futureBtn = screen.getByTestId('view-toggle-future-cpi_general')
    fireEvent.click(futureBtn)
    expect(screen.getByText('Curva Proyectada')).toBeInTheDocument()
  })

  it('renders divergence alert badge when divergence_flag is true', () => {
    render(
      <RemModularKpiCard
        variableData={mockCpiVariable}
        selectedHorizonId="12m"
        cohort="top_10"
        onHorizonChange={vi.fn()}
      />
    )

    const badge = screen.getByTestId('top10-divergence-badge-cpi_general')
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveTextContent('+0.42')
  })
})
