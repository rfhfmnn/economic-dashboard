import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { UniversalSearchBar } from '../UniversalSearchBar'
import { api } from '../../../services/api'
import type { WorkbenchCatalogItem } from '../../../types'

vi.mock('../../../services/api', () => ({
  api: {
    getWorkbenchCatalog: vi.fn(),
  },
}))

const mockItems: WorkbenchCatalogItem[] = [
  {
    id: 'bcra_1',
    source: 'BCRA',
    name: 'Reservas internacionales',
    category: 'Monetario',
    unit: 'Millones USD',
    frequency: 'diaria',
    isArs: false,
    description: 'Reservas brutas del BCRA',
  },
  {
    id: 'fx_blue',
    source: 'FX',
    name: 'Dólar blue',
    category: 'Cambiario',
    unit: 'ARS/USD',
    frequency: 'diaria',
    isArs: false,
    description: 'Cotización del mercado informal',
  },
  {
    id: 'indec_ipc_general',
    source: 'INDEC',
    name: 'IPC - nivel general nacional',
    category: 'Precios',
    unit: '% mensual',
    frequency: 'mensual',
    isArs: false,
    description: 'Índice de precios al consumidor',
  },
  {
    id: 'rem_tipo_cambio',
    source: 'REM',
    name: 'REM - tipo de cambio nominal esperado (mediana)',
    category: 'Expectativas',
    unit: 'ARS/USD',
    frequency: 'mensual',
    isArs: false,
    description: 'Mediana esperada del tipo de cambio',
  },
]

describe('UniversalSearchBar Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.getWorkbenchCatalog).mockResolvedValue(mockItems)
  })

  it('renders search input and source pill filters in strict sentence case', () => {
    render(
      <UniversalSearchBar
        activeSeriesIds={[]}
        onSelectSeries={vi.fn()}
        maxSeriesReached={false}
      />
    )

    expect(screen.getByText('Filtrar por origen:')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Todas' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'BCRA' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'INDEC' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'FX' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'REM' })).toBeInTheDocument()
    expect(
      screen.getByPlaceholderText('Buscar serie en BCRA, INDEC, FX y REM...')
    ).toBeInTheDocument()
  })

  it('triggers debounced async search after 300ms when typing', async () => {
    vi.useFakeTimers()
    render(
      <UniversalSearchBar
        activeSeriesIds={[]}
        onSelectSeries={vi.fn()}
        maxSeriesReached={false}
      />
    )

    const input = screen.getByPlaceholderText('Buscar serie en BCRA, INDEC, FX y REM...')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'reservas' } })

    // Immediately after typing, debounce hasn't elapsed
    expect(api.getWorkbenchCatalog).not.toHaveBeenCalled()

    // Fast forward 300ms
    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    expect(api.getWorkbenchCatalog).toHaveBeenCalledWith('reservas', undefined, 50)
    vi.useRealTimers()
  })

  it('renders source badges, canonical names, categories, units, and frequencies in results', async () => {
    render(
      <UniversalSearchBar
        catalog={mockItems}
        activeSeriesIds={[]}
        onSelectSeries={vi.fn()}
        maxSeriesReached={false}
      />
    )

    const input = screen.getByPlaceholderText('Buscar serie en BCRA, INDEC, FX y REM...')
    fireEvent.focus(input)

    await waitFor(() => {
      expect(screen.getByText('Reservas internacionales')).toBeInTheDocument()
      expect(screen.getByText('Dólar blue')).toBeInTheDocument()
      expect(screen.getByText('IPC - nivel general nacional')).toBeInTheDocument()
      expect(screen.getByText('REM - tipo de cambio nominal esperado (mediana)')).toBeInTheDocument()
    })

    // Check badges
    expect(screen.getAllByText('BCRA').length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('FX').length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('INDEC').length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('REM').length).toBeGreaterThanOrEqual(2)

    // Check meta info
    expect(screen.getByText('Monetario • Millones USD • diaria')).toBeInTheDocument()
    expect(screen.getByText('Precios • % mensual • mensual')).toBeInTheDocument()
  })

  it('disables already active series and shows "En bandeja"', async () => {
    render(
      <UniversalSearchBar
        catalog={mockItems}
        activeSeriesIds={['bcra_1']}
        onSelectSeries={vi.fn()}
        maxSeriesReached={false}
      />
    )

    const input = screen.getByPlaceholderText('Buscar serie en BCRA, INDEC, FX y REM...')
    fireEvent.focus(input)

    await waitFor(() => {
      expect(screen.getByText('En bandeja')).toBeInTheDocument()
    })

    const button = screen.getByText('Reservas internacionales').closest('button')
    expect(button).toBeDisabled()
  })

  it('disables all items and displays warning banner when maxSeriesReached is true', async () => {
    render(
      <UniversalSearchBar
        catalog={mockItems}
        activeSeriesIds={['bcra_1', 'fx_blue', 'indec_ipc_general', 'rem_tipo_cambio', 'other_1']}
        onSelectSeries={vi.fn()}
        maxSeriesReached={true}
      />
    )

    expect(
      screen.getByText(
        'Se ha alcanzado el límite máximo de 5 series simultáneas. Remueva una serie para agregar otra.'
      )
    ).toBeInTheDocument()

    const input = screen.getByPlaceholderText('Buscar serie en BCRA, INDEC, FX y REM...')
    fireEvent.focus(input)

    await waitFor(() => {
      const button = screen.getByText('Dólar blue').closest('button')
      expect(button).toBeDisabled()
    })
  })

  it('filters by source when source pill is clicked', async () => {
    vi.useFakeTimers()
    render(
      <UniversalSearchBar
        activeSeriesIds={[]}
        onSelectSeries={vi.fn()}
        maxSeriesReached={false}
      />
    )

    const indecButton = screen.getByRole('button', { name: 'INDEC' })
    fireEvent.click(indecButton)

    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    expect(api.getWorkbenchCatalog).toHaveBeenCalledWith(undefined, 'INDEC', 50)
    vi.useRealTimers()
  })

  it('prevents race conditions by ignoring outdated responses from slow earlier requests', async () => {
    let resolveFirst: (data: WorkbenchCatalogItem[]) => void
    const firstPromise = new Promise<WorkbenchCatalogItem[]>((resolve) => {
      resolveFirst = resolve
    })

    vi.mocked(api.getWorkbenchCatalog)
      .mockReturnValueOnce(firstPromise)
      .mockResolvedValueOnce([mockItems[1]]) // second query resolves with 'Dólar blue'

    render(
      <UniversalSearchBar
        activeSeriesIds={[]}
        onSelectSeries={vi.fn()}
        maxSeriesReached={false}
      />
    )

    const input = screen.getByPlaceholderText('Buscar serie en BCRA, INDEC, FX y REM...')
    fireEvent.focus(input)

    // First query
    fireEvent.change(input, { target: { value: 'res' } })

    // Fast-forward or trigger second query before first resolves
    fireEvent.change(input, { target: { value: 'blue' } })

    // Resolve first (outdated) response after second request is initiated
    await act(async () => {
      resolveFirst!([mockItems[0]]) // Reservas
    })

    // Dropdown should not show the stale Reservas item if second query was blue
    await waitFor(() => {
      expect(screen.queryByText('Reservas internacionales')).not.toBeInTheDocument()
    })
  })
})
