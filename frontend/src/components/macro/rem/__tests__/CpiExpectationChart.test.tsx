import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CpiExpectationChart } from '../CpiExpectationChart'

const mockComparisonData = {
  cohort: 'todos',
  lookback_months: 6,
  summary: {
    mean_absolute_error: 0.28,
    average_bias: -0.05,
    latest_month: 'Sep-26',
    latest_surprise: -0.2,
    latest_direction: 'undershoot',
  },
  series: [
    {
      period: '2026-04',
      period_label: 'Abr-26',
      real_cpi: 2.1,
      expected_cpi: 2.3,
      surprise_delta: -0.2,
      p25: 2.1,
      p75: 2.5,
      dispersion: 0.4,
      direction: 'undershoot',
    },
    {
      period: '2026-05',
      period_label: 'May-26',
      real_cpi: 2.0,
      expected_cpi: 2.2,
      surprise_delta: -0.2,
      p25: 2.0,
      p75: 2.4,
      dispersion: 0.4,
      direction: 'undershoot',
    },
    {
      period: '2026-06',
      period_label: 'Jun-26',
      real_cpi: 1.8,
      expected_cpi: 2.0,
      surprise_delta: -0.2,
      p25: 1.8,
      p75: 2.2,
      dispersion: 0.4,
      direction: 'undershoot',
    },
    {
      period: '2026-07',
      period_label: 'Jul-26',
      real_cpi: 2.1,
      expected_cpi: 1.9,
      surprise_delta: 0.2,
      p25: 1.7,
      p75: 2.1,
      dispersion: 0.4,
      direction: 'overshoot',
    },
    {
      period: '2026-08',
      period_label: 'Ago-26',
      real_cpi: 1.7,
      expected_cpi: 1.8,
      surprise_delta: -0.1,
      p25: 1.6,
      p75: 2.0,
      dispersion: 0.4,
      direction: 'undershoot',
    },
    {
      period: '2026-09',
      period_label: 'Sep-26',
      real_cpi: 1.9,
      expected_cpi: 2.1,
      surprise_delta: -0.2,
      p25: 1.9,
      p75: 2.3,
      dispersion: 0.4,
      direction: 'undershoot',
    },
  ],
}

const mockConeData = {
  variable: 'ipc_nivel_general',
  indicator_name: 'Precios minoristas (IPC nivel general-Nacional; INDEC)',
  unit: '% mensual',
  report_period: '2026-09',
  cohort: 'todos',
  points: [
    {
      period: 'Oct-26',
      mediana: 1.9,
      promedio: 1.92,
      p10: 1.71,
      p25: 1.82,
      p75: 1.98,
      p90: 2.09,
      minimo: 1.62,
      maximo: 2.19,
      iqr_lower: 1.82,
      iqr_upper: 1.98,
      band_iqr: 0.16,
      p10_p90_lower: 1.71,
      p10_p90_upper: 2.09,
      participantes: 38,
    },
    {
      period: 'Nov-26',
      mediana: 1.85,
      promedio: 1.87,
      p10: 1.67,
      p25: 1.78,
      p75: 1.92,
      p90: 2.04,
      minimo: 1.57,
      maximo: 2.13,
      iqr_lower: 1.78,
      iqr_upper: 1.92,
      band_iqr: 0.14,
      p10_p90_lower: 1.67,
      p10_p90_upper: 2.04,
      participantes: 38,
    },
  ],
}

describe('CpiExpectationChart Component', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('/macro/rem/cpi-comparison')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockComparisonData),
          })
        }
        if (url.includes('/macro/rem/forecast-cone')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockConeData),
          })
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
      })
    )
  })

  it('renders in comparison mode by default with accuracy summary metrics', async () => {
    render(<CpiExpectationChart period="2026-09" cohort="todos" />)

    expect(screen.getByTestId('cpi-expectation-chart')).toBeInTheDocument()

    // Assert title
    expect(
      screen.getByText('Expectativa vs. Realidad: Inflación Mensual (INDEC vs. REM)')
    ).toBeInTheDocument()

    // Wait for accuracy summary to render
    await waitFor(() => {
      expect(screen.getByTestId('cpi-accuracy-summary')).toBeInTheDocument()
    })

    expect(screen.getByText(/Error Absoluto Medio \(MAE\):/)).toBeInTheDocument()
    expect(screen.getByText('0.28 pp')).toBeInTheDocument()
    expect(screen.getByText('-0.05 pp')).toBeInTheDocument()
    expect(screen.getByText('-0.20 pp')).toBeInTheDocument()
  })

  it('toggles lookback periods and triggers API request', async () => {
    render(<CpiExpectationChart period="2026-09" cohort="todos" />)

    const btn6M = await screen.findByTestId('lookback-btn-6')
    expect(btn6M).toBeInTheDocument()

    const btn18M = screen.getByTestId('lookback-btn-18')
    fireEvent.click(btn18M)

    // Button should become active
    await waitFor(() => {
      expect(btn18M).toHaveClass('text-blue-400')
    })
  })

  it('switches between comparison mode and forecast cone fan chart mode', async () => {
    render(<CpiExpectationChart period="2026-09" cohort="todos" />)

    const coneToggle = screen.getByTestId('mode-toggle-cone')
    fireEvent.click(coneToggle)

    // Check title update
    await waitFor(() => {
      expect(
        screen.getByText('Cono de Proyección de Inflación (Fan Chart REM)')
      ).toBeInTheDocument()
    })

    // Variable select appears in cone mode
    expect(screen.getByTestId('cone-variable-select')).toBeInTheDocument()

    // Accuracy summary should be hidden in cone mode
    expect(screen.queryByTestId('cpi-accuracy-summary')).not.toBeInTheDocument()

    // Switch back to comparison
    const compToggle = screen.getByTestId('mode-toggle-comparison')
    fireEvent.click(compToggle)

    await waitFor(() => {
      expect(
        screen.getByText('Expectativa vs. Realidad: Inflación Mensual (INDEC vs. REM)')
      ).toBeInTheDocument()
    })
  })
})
