import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RemModularKpiCard } from '../RemModularKpiCard'
import { RemModularVariableData } from '../../../../types'

const mockVariablesData: Record<string, RemModularVariableData> = {
  cpi_general: {
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
  },
  pib: {
    id: 'pib',
    name: 'Actividad Económica (PIB)',
    category: 'Actividad',
    is_monthly: false,
    is_quarterly: true,
    default_horizon: 'next_quarter',
    available_horizons: [
      { id: 'next_quarter', name: 'Próximo Trimestre' },
      { id: 'year_end_current', name: 'Fin de Año 2026' },
    ],
    horizons: {
      next_quarter: {
        value: 3.2,
        unit: 'Var. % i.a.',
        period: 'III Trim 26',
        p25: 3.07,
        p75: 3.33,
        top10_divergence: 0.06,
        divergence_flag: false,
        future_sparkline: [
          { period: 'III Trim 26', value: 3.2 },
          { period: 'IV Trim 26', value: 3.5 },
        ],
        historical_sparkline: [
          { period: '2026-08', value: 3.0 },
          { period: '2026-09', value: 3.2 },
        ],
      },
    },
  },
}

describe('RemModularKpiCard Component', () => {
  it('renders variable and horizon selectors, value, period, and P25-P75 band', () => {
    const handleVarChange = vi.fn()
    const handleHChange = vi.fn()

    render(
      <RemModularKpiCard
        cardIndex={0}
        selectedVariableId="cpi_general"
        selectedHorizonId="next_month"
        variablesData={mockVariablesData}
        cohort="todos"
        onVariableChange={handleVarChange}
        onHorizonChange={handleHChange}
      />
    )

    // Check selectors
    const varSelect = screen.getByTestId('variable-select-0') as HTMLSelectElement
    expect(varSelect).toBeInTheDocument()
    expect(varSelect.value).toBe('cpi_general')

    const hSelect = screen.getByTestId('horizon-select-0') as HTMLSelectElement
    expect(hSelect).toBeInTheDocument()
    expect(hSelect.value).toBe('next_month')

    // Value and period
    expect(screen.getByTestId('kpi-value-0')).toHaveTextContent('1,9%')
    expect(screen.getByTestId('kpi-period-tag-0')).toHaveTextContent('Oct-26')

    // Interquartile confidence band
    expect(screen.getByText(/1.8% — 2.0%/)).toBeInTheDocument()

    // Cohort and divergence
    expect(screen.getByText(/Consenso Total/)).toBeInTheDocument()
    expect(screen.getByText(/Div. Top 10: 0.04/)).toBeInTheDocument()
  })

  it('triggers onVariableChange and onHorizonChange when user selects different options', () => {
    const handleVarChange = vi.fn()
    const handleHChange = vi.fn()

    render(
      <RemModularKpiCard
        cardIndex={1}
        selectedVariableId="cpi_general"
        selectedHorizonId="next_month"
        variablesData={mockVariablesData}
        cohort="todos"
        onVariableChange={handleVarChange}
        onHorizonChange={handleHChange}
      />
    )

    // Change variable
    const varSelect = screen.getByTestId('variable-select-1')
    fireEvent.change(varSelect, { target: { value: 'pib' } })
    expect(handleVarChange).toHaveBeenCalledWith('pib')

    // Change horizon
    const hSelect = screen.getByTestId('horizon-select-1')
    fireEvent.change(hSelect, { target: { value: '12m' } })
    expect(handleHChange).toHaveBeenCalledWith('12m')
  })

  it('toggles between future trajectory and historical revision sparkline modes', () => {
    render(
      <RemModularKpiCard
        cardIndex={2}
        selectedVariableId="cpi_general"
        selectedHorizonId="next_month"
        variablesData={mockVariablesData}
        cohort="todos"
        onVariableChange={vi.fn()}
        onHorizonChange={vi.fn()}
      />
    )

    // Initially future trajectory
    expect(screen.getByText('Trayectoria Proyectada')).toBeInTheDocument()

    // Click historical toggle
    const histBtn = screen.getByTestId('sparkline-toggle-hist-2')
    fireEvent.click(histBtn)

    expect(screen.getByText('Revisión Últimos 6 Informes')).toBeInTheDocument()

    // Switch back
    const futBtn = screen.getByTestId('sparkline-toggle-future-2')
    fireEvent.click(futBtn)
    expect(screen.getByText('Trayectoria Proyectada')).toBeInTheDocument()
  })

  it('renders divergence alert badge when divergence_flag is true', () => {
    render(
      <RemModularKpiCard
        cardIndex={3}
        selectedVariableId="cpi_general"
        selectedHorizonId="12m"
        variablesData={mockVariablesData}
        cohort="top_10"
        onVariableChange={vi.fn()}
        onHorizonChange={vi.fn()}
      />
    )

    const badge = screen.getByTestId('top10-divergence-badge-3')
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveTextContent('+0.42')
  })
})
