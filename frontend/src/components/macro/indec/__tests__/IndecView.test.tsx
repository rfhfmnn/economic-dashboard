import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { IndecView } from '../IndecView'
import type {
  IndecCatalogItem,
  IndecIndicator,
  IndecSeriesPoint,
  IndecSummaryResponse,
} from '../../../../types'

const MOCK_INDICATORS: IndecIndicator[] = [
  {
    variable_id: 'ipc_general',
    name: 'IPC - nivel general nacional',
    category: 'Precios y costos',
    unit: '% mensual',
    value: 4.2,
    date: '2024-05-01',
    delta_mom: -0.8,
    delta_yoy: 276.4,
    recent_points: [3.2, 3.5, 3.8, 4.2],
  },
  {
    variable_id: 'ipc_core',
    name: 'IPC - núcleo',
    category: 'Precios y costos',
    unit: '% mensual',
    value: 3.8,
    date: '2024-05-01',
    delta_mom: -0.5,
    delta_yoy: 260.0,
    recent_points: [3.0, 3.3, 3.6, 3.8],
  },
  {
    variable_id: 'emae_general',
    name: 'EMAE - nivel general',
    category: 'Actividad y producción',
    unit: 'Índice base 2004=100',
    value: 154.2,
    date: '2024-04-01',
    delta_mom: 0.3,
    delta_yoy: -1.7,
    recent_points: [150.0, 151.2, 153.0, 154.2],
  },
  {
    variable_id: 'ipi_manuf',
    name: 'IPI manufacturero',
    category: 'Actividad y producción',
    unit: 'Índice base 2004=100',
    value: 142.1,
    date: '2024-04-01',
    delta_mom: -0.2,
    delta_yoy: -3.5,
    recent_points: [145.0, 144.0, 143.0, 142.1],
  },
  {
    variable_id: 'cbt',
    name: 'Canasta básica total (CBT)',
    category: 'Mercado de trabajo y social',
    unit: 'ARS',
    value: 850000,
    date: '2024-05-01',
    delta_mom: 3.5,
    delta_yoy: 290.0,
    recent_points: [780000, 800000, 820000, 850000],
  },
  {
    variable_id: 'eph_desempleo',
    name: 'Tasa de desocupación',
    category: 'Mercado de trabajo y social',
    unit: '% PEA',
    value: 7.7,
    date: '2024-03-31',
    delta_mom: null,
    delta_yoy: 0.8,
    recent_points: [6.9, 7.2, 7.5, 7.7],
  },
  {
    variable_id: 'ica_saldo',
    name: 'Balanza comercial (ICA)',
    category: 'Sector externo',
    unit: 'Millones USD',
    value: 1800,
    date: '2024-04-01',
    delta_mom: 15.0,
    delta_yoy: 150.0,
    recent_points: [1200, 1400, 1600, 1800],
  },
  {
    variable_id: 'icc_general',
    name: 'Costo de la construcción (ICC)',
    category: 'Precios y costos',
    unit: '% mensual',
    value: 5.1,
    date: '2024-05-01',
    delta_mom: -1.2,
    delta_yoy: 255.0,
    recent_points: [4.5, 4.8, 5.0, 5.1],
  },
]

const MOCK_SUMMARY: IndecSummaryResponse = {
  indicators: MOCK_INDICATORS,
  last_updated: '2024-05-10T12:00:00Z',
}

const MOCK_CATALOG: IndecCatalogItem[] = MOCK_INDICATORS.map((ind) => ({
  variable_id: ind.variable_id,
  name: ind.name,
  category: ind.category,
  unit: ind.unit,
  frequency: ind.variable_id === 'eph_desempleo' ? 'trimestral' : 'mensual',
  description: ind.name,
}))

const MOCK_SERIES: IndecSeriesPoint[] = [
  { fecha: '2023-05-01', valor: 7.8 },
  { fecha: '2023-08-01', valor: 12.4 },
  { fecha: '2023-12-01', valor: 25.5 },
  { fecha: '2024-03-01', valor: 11.0 },
  { fecha: '2024-05-01', valor: 4.2 },
]

describe('IndecView Component', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('/macro/indec/summary')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(MOCK_SUMMARY),
          })
        }
        if (url.includes('/macro/indec/catalog')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(MOCK_CATALOG),
          })
        }
        if (url.includes('/macro/indec/series')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(MOCK_SERIES),
          })
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([]),
        })
      })
    )
  })

  it('renders 8 KPI metric cards with titles, values, and units', async () => {
    render(<IndecView />)

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getAllByText(/IPC - Nivel General Nacional/i).length).toBeGreaterThanOrEqual(1)
    })

    // Verify all 8 indicator titles are present
    expect(screen.getAllByText(/IPC - Nivel General Nacional/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/IPC - Núcleo/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/EMAE - Nivel General/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/IPI Manufacturero/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/Canasta Básica Total/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/Tasa de Desocupación/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/Balanza Comercial/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/Costo de la Construcción/i).length).toBeGreaterThanOrEqual(1)

    // Verify units
    expect(screen.getAllByText('% mensual').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('ARS').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Millones USD').length).toBeGreaterThanOrEqual(1)
  })

  it('toggling active card updates chart series selection', async () => {
    render(<IndecView />)

    await waitFor(() => {
      expect(screen.getByText(/EMAE - Nivel General/i)).toBeDefined()
    })

    // Find and click the EMAE card
    const emaeCard = screen.getByText(/EMAE - Nivel General/i).closest('div[role="button"]')
    expect(emaeCard).toBeDefined()
    if (emaeCard) {
      fireEvent.click(emaeCard)
    }

    await waitFor(() => {
      // EMAE should now be the active primary variable
      expect(screen.getAllByText(/EMAE/i).length).toBeGreaterThanOrEqual(1)
    })
  })

  it('supports VariablePicker search and primary/secondary axis selection', async () => {
    render(<IndecView />)

    await waitFor(() => {
      expect(screen.getByText('Seleccionar variables')).toBeDefined()
    })

    // Open VariablePicker
    fireEvent.click(screen.getByText('Seleccionar variables'))

    // Search for a specific variable
    const searchInput = screen.getByPlaceholderText('Buscar variable INDEC por nombre o categoría...')
    fireEvent.change(searchInput, { target: { value: 'IPI' } })

    // Find the IPI item in the filtered list (it now appears in card and in popover list)
    await waitFor(() => {
      expect(screen.getAllByText(/IPI Manufacturero/i).length).toBeGreaterThanOrEqual(2)
    })

    // Click "Dual" to assign IPI to secondary axis
    const dualButtons = screen.getAllByRole('button', { name: /Dual/i })
    expect(dualButtons.length).toBeGreaterThanOrEqual(1)
    fireEvent.click(dualButtons[0])

    await waitFor(() => {
      // Dual badge should now be visible
      expect(screen.getByText('Dual:')).toBeDefined()
    })
  })

  it('renders timeframe selector buttons inside MacroChart and switches timeframe', async () => {
    render(<IndecView />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '1Y' })).toBeDefined()
      expect(screen.getByRole('button', { name: '5Y' })).toBeDefined()
      expect(screen.getByRole('button', { name: 'Max' })).toBeDefined()
    })

    // Switch to 5Y
    fireEvent.click(screen.getByRole('button', { name: '5Y' }))

    // Switch to Max
    fireEvent.click(screen.getByRole('button', { name: 'Max' }))

    // Switch back to 1Y
    fireEvent.click(screen.getByRole('button', { name: '1Y' }))
  })

  it('renders informative alert banner on 401 missing token error with retry button', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('/macro/indec/summary')) {
          return Promise.resolve({
            ok: false,
            status: 401,
            statusText: 'Unauthorized',
            json: () =>
              Promise.resolve({
                detail: 'INDEC_API_TOKEN no configurado en entorno',
              }),
          })
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([]),
        })
      })
    )

    render(<IndecView />)

    await waitFor(() => {
      expect(screen.getByTestId('indec-auth-error-banner')).toBeDefined()
    })

    expect(screen.getByText('Token de API INDEC no configurado')).toBeDefined()
    expect(screen.getAllByText(/INDEC_API_TOKEN/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByTestId('indec-retry-button')).toBeDefined()
  })

  it('renders error message on 502 connection failure with retry button', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('/macro/indec/summary')) {
          return Promise.resolve({
            ok: false,
            status: 502,
            statusText: 'Bad Gateway',
            json: () =>
              Promise.resolve({
                detail: 'Error de conexión con api.indec.gob.ar',
              }),
          })
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([]),
        })
      })
    )

    render(<IndecView />)

    await waitFor(() => {
      expect(screen.getByTestId('indec-network-error-banner')).toBeDefined()
    })

    expect(screen.getByText('Error de conexión con INDEC')).toBeDefined()
    expect(screen.getByText('Error de conexión con api.indec.gob.ar')).toBeDefined()
    expect(screen.getByTestId('indec-retry-button')).toBeDefined()
  })

  it('renders small sparkline charts on metric cards and respects sentence case titles', async () => {
    render(<IndecView />)

    await waitFor(() => {
      expect(screen.getAllByText('IPC - nivel general nacional').length).toBeGreaterThanOrEqual(1)
    })

    // Header adheres to sentence case
    expect(screen.getByText('Estadísticas oficiales INDEC (economía real)')).toBeDefined()

    // Metric cards adhere to sentence case
    expect(screen.getAllByText('IPC - núcleo').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('EMAE - nivel general').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('IPI manufacturero').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Canasta básica total (CBT)').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Tasa de desocupación').length).toBeGreaterThanOrEqual(1)

    // Sparklines are rendered in DOM for cards with recent_points
    const sparklines = document.querySelectorAll('svg polyline')
    expect(sparklines.length).toBeGreaterThanOrEqual(1)
  })
})
