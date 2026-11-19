import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { WorkbenchView } from '../WorkbenchView'
import { api } from '../../../services/api'
import type { WorkbenchCatalogItem } from '../../../types'


vi.mock('../../../services/api', () => ({
  api: {
    getWorkbenchCatalog: vi.fn(),
    getMacroCpi: vi.fn(),
    getMacroSeries: vi.fn(),
    getFxHistory: vi.fn(),
    getIndecSeries: vi.fn(),
    getRemForecastCone: vi.fn(),
    getRemSeries: vi.fn(),
    downloadWorkbenchExcel: vi.fn(),
  },
}))

const mockCatalog: WorkbenchCatalogItem[] = [
  {
    id: 'bcra_15',
    source: 'BCRA',
    name: 'Base monetaria',
    category: 'Monetario',
    unit: 'Millones ARS',
    frequency: 'diaria',
    isArs: true,
  },
  {
    id: 'fx_blue',
    source: 'FX',
    name: 'Dólar blue',
    category: 'Cambiario',
    unit: 'ARS/USD',
    frequency: 'diaria',
    isArs: false,
  },
  {
    id: 'indec_ipc_general',
    source: 'INDEC',
    name: 'IPC - nivel general nacional',
    category: 'Precios',
    unit: '% mensual',
    frequency: 'mensual',
    isArs: false,
  },
  {
    id: 'indec_comex_exportaciones_primarios',
    source: 'INDEC',
    name: 'Exportaciones de bienes - productos primarios',
    category: 'Sector externo',
    unit: 'Millones USD',
    frequency: 'mensual',
    isArs: false,
  },
  {
    id: 'rem_tipo_cambio',
    source: 'REM',
    name: 'REM - tipo de cambio nominal esperado',
    category: 'Expectativas',
    unit: 'ARS/USD',
    frequency: 'mensual',
    isArs: false,
  },
]

describe('WorkbenchView Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.getWorkbenchCatalog).mockResolvedValue(mockCatalog)
    vi.mocked(api.getMacroCpi).mockResolvedValue([
      { fecha: '2026-01-01', valor: 4.0, indice: 104.0 },
      { fecha: '2026-02-01', valor: 3.5, indice: 107.64 },
    ])
    vi.mocked(api.getMacroSeries).mockResolvedValue({
      id_variable: 15,
      variable_name: 'Base monetaria',
      count: 2,
      data: [
        { fecha: '2026-01-01', valor: 10000 },
        { fecha: '2026-02-01', valor: 11000 },
      ],
    })
    vi.mocked(api.getFxHistory).mockResolvedValue({
      rates: {
        oficial: [],
        mep: [],
        ccl: [],
        blue: [
          { fecha: '2026-01-01', valor: 1200 },
          { fecha: '2026-02-01', valor: 1250 },
        ],
      },
      last_updated: '2026-02-01T00:00:00Z',
      source: 'api',
    })
    vi.mocked(api.getIndecSeries).mockImplementation(async (_varId: string, tf: string = '1Y') => {
      if (tf === 'Max') {
        return [
          { fecha: '2021-05-01', valor: 1200 },
          { fecha: '2022-05-01', valor: 1300 },
          { fecha: '2023-05-01', valor: 1400 },
          { fecha: '2024-05-01', valor: 1500 },
          { fecha: '2025-05-01', valor: 1600 },
          { fecha: '2026-05-01', valor: 1700 },
        ]
      }
      return [
        { fecha: '2025-05-01', valor: 1600 },
        { fecha: '2026-05-01', valor: 1700 },
      ]
    })
    vi.mocked(api.getRemSeries).mockResolvedValue([
      { fecha: '2025-06-01', valor: 1000, is_forecast: false, mediana: 1000, p25: 1000, p75: 1000 },
      { fecha: '2025-07-01', valor: 1020, is_forecast: false, mediana: 1020, p25: 1020, p75: 1020 },
      { fecha: '2025-08-01', valor: 1040, is_forecast: false, mediana: 1040, p25: 1040, p75: 1040 },
      { fecha: '2025-09-01', valor: 1060, is_forecast: true, mediana: 1060, p25: 1040, p75: 1080 },
      { fecha: '2025-10-01', valor: 1080, is_forecast: true, mediana: 1080, p25: 1060, p75: 1100 },
      { fecha: '2025-11-01', valor: 1100, is_forecast: true, mediana: 1100, p25: 1080, p75: 1120 },
    ])
  })

  it('renders workbench title, search bar, and empty tray state', async () => {
    render(<WorkbenchView />)

    expect(screen.getByText('Banco de trabajo')).toBeInTheDocument()
    expect(
      screen.getByText('Pool universal de datos, normalización multivariable y motor de correlación cruzada')
    ).toBeInTheDocument()
    expect(
      screen.getByPlaceholderText('Buscar serie en BCRA, INDEC, FX y REM...')
    ).toBeInTheDocument()
    expect(
      screen.getByText('Seleccione hasta 5 series del buscador universal para comenzar a analizar.')
    ).toBeInTheDocument()
  })

  it('filters catalog and adds a series to the active series tray on click', async () => {
    render(<WorkbenchView />)

    const searchInput = screen.getByPlaceholderText('Buscar serie en BCRA, INDEC, FX y REM...')
    fireEvent.focus(searchInput)
    fireEvent.change(searchInput, { target: { value: 'base' } })

    await waitFor(() => {
      expect(screen.getByText('Base monetaria')).toBeInTheDocument()
    })

    const selectBtn = screen.getByText('Base monetaria').closest('button')!
    fireEvent.click(selectBtn)

    await waitFor(() => {
      expect(api.getMacroSeries).toHaveBeenCalledWith(15)
      expect(screen.getByText('Series activas (1/5)')).toBeInTheDocument()
    })
  })

  it('removes series when X button is clicked', async () => {
    render(<WorkbenchView />)

    const searchInput = screen.getByPlaceholderText('Buscar serie en BCRA, INDEC, FX y REM...')
    fireEvent.focus(searchInput)
    fireEvent.change(searchInput, { target: { value: 'blue' } })

    await waitFor(() => {
      expect(screen.getByText('Dólar blue')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Dólar blue').closest('button')!)

    await waitFor(() => {
      expect(screen.getByText('Series activas (1/5)')).toBeInTheDocument()
    })

    const removeBtn = screen.getByTitle('Quitar serie')
    fireEvent.click(removeBtn)

    await waitFor(() => {
      expect(
        screen.getByText('Seleccione hasta 5 series del buscador universal para comenzar a analizar.')
      ).toBeInTheDocument()
    })
  })

  it('switches between normalized time series and rolling correlation modes', async () => {
    render(<WorkbenchView />)

    const correlationTab = screen.getByText('Correlación móvil')
    fireEvent.click(correlationTab)

    expect(screen.getByText('Ventana:')).toBeInTheDocument()
    expect(screen.getByText('30 días')).toBeInTheDocument()
    expect(screen.getByText('90 días')).toBeInTheDocument()
    expect(screen.getByText('180 días')).toBeInTheDocument()

    const normalizedTab = screen.getByText('Serie temporal normalizada')
    fireEvent.click(normalizedTab)

    expect(screen.getByText('Unidad original')).toBeInTheDocument()
    expect(screen.getByText('Base 100 (t₀ = 100)')).toBeInTheDocument()
    expect(screen.getByText('Variación intermensual (MoM %)')).toBeInTheDocument()
    expect(screen.getByText('Variación interanual (YoY %)')).toBeInTheDocument()
  })

  it('switches between expression modes and updates chart and table metrics', async () => {
    render(<WorkbenchView />)

    // Add a series first
    const searchInput = screen.getByPlaceholderText('Buscar serie en BCRA, INDEC, FX y REM...')
    fireEvent.focus(searchInput)
    fireEvent.change(searchInput, { target: { value: 'base' } })

    await waitFor(() => {
      expect(screen.getByText('Base monetaria')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Base monetaria').closest('button')!)

    await waitFor(() => {
      expect(screen.getByText('Series activas (1/5)')).toBeInTheDocument()
    })

    // By default, original unit / native index mode is active
    expect(screen.getByText('Valores en unidad original')).toBeInTheDocument()
    expect(screen.getByText('Último valor')).toBeInTheDocument()

    // Switch to Base 100
    fireEvent.click(screen.getByText('Base 100 (t₀ = 100)'))
    expect(screen.getByText('Índice de base 100 dinámico (t₀ = 100)')).toBeInTheDocument()
    expect(screen.getByText('Último valor (base 100)')).toBeInTheDocument()

    // Switch to MoM %
    fireEvent.click(screen.getByText('Variación intermensual (MoM %)'))
    expect(screen.getAllByText('Variación intermensual (MoM %)')).toHaveLength(2) // in toolbar button and chart subtitle
    expect(screen.getByText('Última var. MoM')).toBeInTheDocument()
    expect(screen.getByText('Promedio MoM')).toBeInTheDocument()

    // Switch to YoY %
    fireEvent.click(screen.getByText('Variación interanual (YoY %)'))
    expect(screen.getAllByText('Variación interanual (YoY %)')).toHaveLength(2)
    expect(screen.getByText('Última var. YoY')).toBeInTheDocument()
    expect(screen.getByText('Promedio YoY')).toBeInTheDocument()
  })

  it('coordinates inflation adjustment toggle with active ARS series', async () => {
    render(<WorkbenchView />)

    // Add ARS series
    const searchInput = screen.getByPlaceholderText('Buscar serie en BCRA, INDEC, FX y REM...')
    fireEvent.focus(searchInput)
    fireEvent.change(searchInput, { target: { value: 'base' } })

    await waitFor(() => {
      expect(screen.getByText('Base monetaria')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Base monetaria').closest('button')!)

    await waitFor(() => {
      expect(screen.getByText('Series activas (1/5)')).toBeInTheDocument()
    })

    const inflationCheckbox = screen.getByRole('checkbox', {
      name: /Ajustar por inflación \(términos reales\)/i,
    })
    expect(inflationCheckbox).not.toBeDisabled()
    expect(inflationCheckbox).not.toBeChecked()

    fireEvent.click(inflationCheckbox)
    expect(inflationCheckbox).toBeChecked()
  })

  it('renders scale mode selector and allows toggling to zero origin mode', async () => {
    render(<WorkbenchView />)

    const autoBtn = screen.getByText('Ajuste automático (zoom a variación)')
    const zeroBtn = screen.getByText('Origen en cero (0)')

    expect(autoBtn).toBeInTheDocument()
    expect(zeroBtn).toBeInTheDocument()

    // Toggle to zero mode
    fireEvent.click(zeroBtn)
    expect(zeroBtn).toHaveClass('font-medium')

    // Toggle back to auto zoom
    fireEvent.click(autoBtn)
    expect(autoBtn).toHaveClass('font-medium')
  })

  it('allows switching periodicity between Original, Mensual, and Trimestral and updates stats', async () => {
    render(<WorkbenchView />)

    // Add Base monetaria series
    const searchInput = screen.getByPlaceholderText('Buscar serie en BCRA, INDEC, FX y REM...')
    fireEvent.focus(searchInput)
    fireEvent.change(searchInput, { target: { value: 'base' } })

    await waitFor(() => {
      expect(screen.getByText('Base monetaria')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Base monetaria').closest('button')!)

    await waitFor(() => {
      expect(screen.getByText('Series activas (1/5)')).toBeInTheDocument()
    })

    const originalBtn = screen.getByText('Original')
    const mensualBtn = screen.getByText('Mensual')
    const trimestralBtn = screen.getByText('Trimestral')

    expect(originalBtn).toBeInTheDocument()
    expect(mensualBtn).toBeInTheDocument()
    expect(trimestralBtn).toBeInTheDocument()

    // Switch to Mensual
    fireEvent.click(mensualBtn)
    expect(mensualBtn).toHaveClass('font-medium')

    // Switch to Trimestral
    fireEvent.click(trimestralBtn)
    expect(trimestralBtn).toHaveClass('font-medium')

    // Switch back to Original
    fireEvent.click(originalBtn)
    expect(originalBtn).toHaveClass('font-medium')
  })

  it('allows switching line style between Curva continua and Escalonada', async () => {
    render(<WorkbenchView />)

    const continuousBtn = screen.getByText('Curva continua')
    const stepBtn = screen.getByText('Escalonada (forward-fill)')

    expect(continuousBtn).toBeInTheDocument()
    expect(stepBtn).toBeInTheDocument()

    // Switch to step
    fireEvent.click(stepBtn)
    expect(stepBtn).toHaveClass('font-medium')

    // Switch back to continuous
    fireEvent.click(continuousBtn)
    expect(continuousBtn).toHaveClass('font-medium')
  })

  it('passes active timeframe dynamically to getIndecSeries and reloads full history when switching to Max', async () => {
    render(<WorkbenchView />)

    // Add INDEC comex series
    const searchInput = screen.getByPlaceholderText('Buscar serie en BCRA, INDEC, FX y REM...')
    fireEvent.focus(searchInput)
    fireEvent.change(searchInput, { target: { value: 'Exportaciones' } })

    await waitFor(() => {
      expect(screen.getByText('Exportaciones de bienes - productos primarios')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Exportaciones de bienes - productos primarios').closest('button')!)

    await waitFor(() => {
      // Default timeframe in toolbar is 1Y
      expect(api.getIndecSeries).toHaveBeenCalledWith('comex_exportaciones_primarios', '1Y')
      expect(screen.getByText('Series activas (1/5)')).toBeInTheDocument()
    })

    // Switch timeframe to Max
    const maxBtn = screen.getByRole('button', { name: 'Max' })
    fireEvent.click(maxBtn)

    await waitFor(() => {
      // Must be called with 'Max' to retrieve full historical points
      expect(api.getIndecSeries).toHaveBeenCalledWith('comex_exportaciones_primarios', 'Max')
    })
  })

  it('fetches complete historical and forecast series via getRemSeries without date parsing errors', async () => {
    render(<WorkbenchView />)

    const searchInput = screen.getByPlaceholderText('Buscar serie en BCRA, INDEC, FX y REM...')
    fireEvent.focus(searchInput)
    fireEvent.change(searchInput, { target: { value: 'tipo de cambio nominal esperado' } })

    await waitFor(() => {
      expect(screen.getByText('REM - tipo de cambio nominal esperado')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('REM - tipo de cambio nominal esperado').closest('button')!)

    await waitFor(() => {
      expect(api.getRemSeries).toHaveBeenCalledWith('tipo_cambio', 'todos')
      expect(screen.getByText('Series activas (1/5)')).toBeInTheDocument()
    })
  })

  it('allows toggling series axis between left and right in active series tray', async () => {
    render(<WorkbenchView />)

    const searchInput = screen.getByPlaceholderText('Buscar serie en BCRA, INDEC, FX y REM...')
    fireEvent.focus(searchInput)
    fireEvent.change(searchInput, { target: { value: 'base' } })

    await waitFor(() => {
      expect(screen.getByText('Base monetaria')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Base monetaria').closest('button')!)

    await waitFor(() => {
      expect(screen.getByText('Series activas (1/5)')).toBeInTheDocument()
    })

    // First series defaults to left axis (Eje izq.)
    const axisToggleBtn = screen.getByText('Eje izq. (Y₁)')
    expect(axisToggleBtn).toBeInTheDocument()

    // Toggle to right axis
    fireEvent.click(axisToggleBtn)
    expect(screen.getByText('Eje der. (Y₂)')).toBeInTheDocument()

    // Toggle back to left axis
    fireEvent.click(screen.getByText('Eje der. (Y₂)'))
    expect(screen.getByText('Eje izq. (Y₁)')).toBeInTheDocument()
  })
})
