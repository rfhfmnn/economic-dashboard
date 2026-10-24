import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { FxProjectionChart } from '../FxProjectionChart'

const mockFxData = {
  variable: 'tipo_de_cambio',
  indicator_name: 'Tipo de cambio nominal ($/USD)',
  unit: '$/USD',
  report_period: '2026-09',
  cohort: 'todos',
  points: [
    {
      period: 'Oct-26',
      mediana: 1055.0,
      promedio: 1060.0,
      p10: 1010.0,
      p25: 1035.0,
      p75: 1075.0,
      p90: 1095.0,
      minimo: 990.0,
      maximo: 1120.0,
      iqr_lower: 1035.0,
      iqr_upper: 1075.0,
      band_iqr: 40.0,
      p10_p90_lower: 1010.0,
      p10_p90_upper: 1095.0,
      participantes: 38,
    },
    {
      period: 'Nov-26',
      mediana: 1076.0,
      promedio: 1081.0,
      p10: 1030.0,
      p25: 1055.0,
      p75: 1098.0,
      p90: 1120.0,
      minimo: 1010.0,
      maximo: 1150.0,
      iqr_lower: 1055.0,
      iqr_upper: 1098.0,
      band_iqr: 43.0,
      p10_p90_lower: 1030.0,
      p10_p90_upper: 1120.0,
      participantes: 38,
    },
  ],
}

describe('FxProjectionChart Component', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('/macro/rem/forecast-cone')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockFxData),
          })
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
      })
    )
  })

  it('renders title, stats banner, and chart container', async () => {
    render(<FxProjectionChart period="2026-09" cohort="todos" />)

    expect(screen.getByTestId('fx-projection-chart')).toBeInTheDocument()
    expect(
      screen.getByText('Trayectoria del Tipo de Cambio Nominal Oficial ($/USD)')
    ).toBeInTheDocument()

    // Wait for end period and crawling peg calculations
    await waitFor(() => {
      expect(screen.getByText('$1.076,0')).toBeInTheDocument()
    })

    expect(screen.getByText('Crawling peg prom.:')).toBeInTheDocument()
    expect(screen.getByText('+2.0% m/m')).toBeInTheDocument()
  })
})
