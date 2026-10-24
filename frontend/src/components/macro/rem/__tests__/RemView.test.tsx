import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RemMetricCard } from '../RemMetricCard'
import { RemView } from '../RemView'
import { MacroView } from '../../MacroView'

const mockSummaryTodos = {
  report_period: '2026-09',
  report_date: '2026-09-04',
  cohort: 'todos',
  kpis: {
    cpi_next_month: {
      value: 1.9,
      period: 'Oct-26',
      unit: '% mensual',
      p25: 1.82,
      p75: 1.98,
      top10_divergence: 0.04,
      divergence_flag: false,
    },
    cpi_12m: {
      value: 21.1,
      period: 'próx. 12 meses',
      unit: '% i.a.',
      p25: 20.05,
      p75: 22.16,
      top10_divergence: 0.42,
      divergence_flag: true,
    },
    fx_year_end: {
      value: 1250.0,
      period: '2026',
      unit: '$/USD',
      p25: 1187.5,
      p75: 1312.5,
      top10_divergence: 25.0,
      divergence_flag: true,
    },
    policy_rate: {
      value: 35.0,
      period: 'Oct-26',
      unit: '% TNA',
      p25: 33.6,
      p75: 36.4,
      top10_divergence: 0.7,
      divergence_flag: true,
    },
  },
  divergence_alerts: [
    {
      indicador: 'Precios minoristas (IPC nivel general-Nacional; INDEC)',
      periodo: 'próx. 12 meses',
      todos_mediana: 21.1,
      top10_mediana: 20.68,
      divergence: 0.42,
      unidad: '% i.a.',
    },
  ],
  total_participants: 38,
}

const mockSummaryTop10 = {
  ...mockSummaryTodos,
  cohort: 'top_10',
  total_participants: 10,
}

describe('RemMetricCard Component', () => {
  it('renders title, period, value, and interquartile confidence band', () => {
    render(
      <RemMetricCard
        title="IPC Próximo Mes"
        period="Oct-26"
        value={1.9}
        unit="% mensual"
        p25={1.82}
        p75={1.98}
        top10Divergence={0.04}
        divergenceFlag={false}
        cohort="todos"
      />
    )

    expect(screen.getByText('IPC Próximo Mes')).toBeInTheDocument()
    expect(screen.getByText('Oct-26')).toBeInTheDocument()
    expect(screen.getByText('1,9%')).toBeInTheDocument()
    expect(screen.getByText(/1.8% — 2.0%/)).toBeInTheDocument()
    expect(screen.getByText(/Div. Top 10: 0.04/)).toBeInTheDocument()
    expect(screen.queryByTestId('top10-divergence-badge')).not.toBeInTheDocument()
  })

  it('renders divergence alert badge when divergenceFlag is true', () => {
    render(
      <RemMetricCard
        title="IPC Próximos 12M"
        period="próx. 12 meses"
        value={21.1}
        unit="% i.a."
        p25={20.05}
        p75={22.16}
        top10Divergence={0.42}
        divergenceFlag={true}
        cohort="todos"
      />
    )

    const badge = screen.getByTestId('top10-divergence-badge')
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveTextContent('+0.42 pp')
  })
})

describe('RemView Component', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('/macro/rem/reports')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(['2026-09', '2026-08', '2026-07']),
          })
        }
        if (url.includes('/macro/rem/summary')) {
          if (url.includes('cohort=top_10')) {
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve(mockSummaryTop10),
            })
          }
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockSummaryTodos),
          })
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
        })
      })
    )
  })

  it('loads report periods into select and renders executive KPI grid', async () => {
    render(<RemView />)

    // Check loading indicator or wait for load
    await waitFor(() => {
      expect(screen.getByTestId('rem-view-container')).toBeInTheDocument()
    })

    const select = await screen.findByTestId('rem-period-select')
    expect(select).toBeInTheDocument()
    expect(screen.getByText('Relevamiento 2026-09')).toBeInTheDocument()

    // Assert cards
    expect(await screen.findByText('IPC Próximo Mes')).toBeInTheDocument()
    expect(screen.getByText('IPC Próximos 12M')).toBeInTheDocument()
    expect(screen.getByText('Tipo de Cambio Fin de Año')).toBeInTheDocument()
    expect(screen.getByText('Tasa Política Monetaria')).toBeInTheDocument()

    // Assert info banner
    expect(screen.getByText('2026-09-04')).toBeInTheDocument()
    expect(screen.getByText(/38 entidades/)).toBeInTheDocument()
    expect(screen.getByText(/1 alertas de divergencia Top 10/)).toBeInTheDocument()
  })

  it('switches cohort to Top 10 and updates participant count', async () => {
    render(<RemView />)

    await waitFor(() => {
      expect(screen.getByText(/38 entidades/)).toBeInTheDocument()
    })

    const top10Btn = screen.getByTestId('cohort-toggle-top10')
    fireEvent.click(top10Btn)

    await waitFor(() => {
      expect(screen.getByText(/10 entidades/)).toBeInTheDocument()
    })
  })
})

describe('MacroView Sub-Tab Navigation', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('/macro/summary')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                indicators: [
                  { idVariable: 1, descripcion: 'Reservas internacionales', valor: 27800.5, fecha: '2026-03-20', categoria: 'Monetaria' },
                ],
                fx_summary: {},
                timestamp: '2026-03-20T12:00:00',
              }),
          })
        }
        if (url.includes('/macro/catalog')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([{ idVariable: 1, descripcion: 'Reservas internacionales', categoria: 'Monetaria' }]),
          })
        }
        if (url.includes('/macro/fx/spreads')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ mayorista: { valor: 1000 }, blue: { valor: 1200, spread_pct: 20 } }),
          })
        }
        if (url.includes('/macro/rem/reports')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(['2026-09']),
          })
        }
        if (url.includes('/macro/rem/summary')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockSummaryTodos),
          })
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
      })
    )
  })

  it('renders subtabs and switches between BCRA/FX and REM views', async () => {
    render(<MacroView />)

    // Initial default subtab is BCRA & FX
    expect(await screen.findByTestId('macro-subtab-bcra')).toBeInTheDocument()
    const remSubtab = screen.getByTestId('macro-subtab-rem')
    expect(remSubtab).toBeInTheDocument()

    // Switch to REM
    fireEvent.click(remSubtab)

    // Verify RemView is rendered
    expect(await screen.findByTestId('rem-view-container')).toBeInTheDocument()
    expect(screen.getByText('IPC Próximo Mes')).toBeInTheDocument()

    // Switch back to BCRA & FX
    const bcraSubtab = screen.getByTestId('macro-subtab-bcra')
    fireEvent.click(bcraSubtab)

    // Verify BCRA view is restored
    await waitFor(() => {
      expect(screen.queryByTestId('rem-view-container')).not.toBeInTheDocument()
    })
  })
})
