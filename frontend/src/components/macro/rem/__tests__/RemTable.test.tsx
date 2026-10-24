import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RemTable } from '../RemTable'

const mockTableData = {
  report_period: '2026-09',
  cohort: 'todos',
  category_filter: 'all',
  total_records: 3,
  categories: ['Precios', 'Tipo de Cambio', 'Tasas', 'Actividad'],
  rows: [
    {
      indicador: 'Precios minoristas (IPC nivel general-Nacional; INDEC)',
      categoria: 'Precios',
      periodo: 'Oct-26',
      periodoTipo: 'mensual',
      unidad: '% mensual',
      mediana: 1.9,
      promedio: 1.92,
      desvio: 0.15,
      p10: 1.71,
      p25: 1.82,
      p75: 1.98,
      p90: 2.09,
      minimo: 1.62,
      maximo: 2.19,
      participantes: 38,
      top10_divergence: 0.04,
      divergence_flag: false,
    },
    {
      indicador: 'Tipo de cambio nominal',
      categoria: 'Tipo de Cambio',
      periodo: 'Oct-26',
      periodoTipo: 'mensual',
      unidad: '$/USD',
      mediana: 1055.0,
      promedio: 1060.0,
      desvio: 20.0,
      p10: 1010.0,
      p25: 1035.0,
      p75: 1075.0,
      p90: 1095.0,
      minimo: 990.0,
      maximo: 1120.0,
      participantes: 38,
      top10_divergence: 21.0,
      divergence_flag: true,
    },
    {
      indicador: 'Tasa de interés (TAMAR)',
      categoria: 'Tasas',
      periodo: 'Oct-26',
      periodoTipo: 'mensual',
      unidad: '% TNA',
      mediana: 35.0,
      promedio: 35.2,
      desvio: 2.1,
      p10: 32.5,
      p25: 33.6,
      p75: 36.4,
      p90: 37.8,
      minimo: 31.0,
      maximo: 39.5,
      participantes: 38,
      top10_divergence: 0.7,
      divergence_flag: true,
    },
  ],
}

describe('RemTable Component', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('/macro/rem/table')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockTableData),
          })
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
      })
    )
  })

  it('renders table headers and rows with tabular metrics', async () => {
    render(<RemTable period="2026-09" cohort="todos" />)

    expect(screen.getByTestId('rem-table-container')).toBeInTheDocument()
    expect(
      screen.getByText('Tabla Integral de Consenso del Relevamiento (REM)')
    ).toBeInTheDocument()

    // Wait for rows to render
    await waitFor(() => {
      expect(screen.getByText('Precios minoristas (IPC nivel general-Nacional; INDEC)')).toBeInTheDocument()
    })

    expect(screen.getByText('Tipo de cambio nominal')).toBeInTheDocument()
    expect(screen.getByText('Tasa de interés (TAMAR)')).toBeInTheDocument()

    // Assert divergence badge exists for flagged row
    expect(screen.getByText('21.00')).toBeInTheDocument()
  })

  it('filters rows when user types in search input', async () => {
    render(<RemTable period="2026-09" cohort="todos" />)

    await waitFor(() => {
      expect(screen.getByText('Precios minoristas (IPC nivel general-Nacional; INDEC)')).toBeInTheDocument()
    })

    const searchInput = screen.getByTestId('rem-table-search-input')
    fireEvent.change(searchInput, { target: { value: 'TAMAR' } })

    // Only TAMAR should be visible
    expect(screen.getByText('Tasa de interés (TAMAR)')).toBeInTheDocument()
    expect(screen.queryByText('Tipo de cambio nominal')).not.toBeInTheDocument()
  })

  it('triggers CSV download when Exportar CSV button is clicked', async () => {
    const createObjectURLMock = vi.fn(() => 'blob:mock-csv-url')
    const revokeObjectURLMock = vi.fn()
    window.URL.createObjectURL = createObjectURLMock
    window.URL.revokeObjectURL = revokeObjectURLMock

    render(<RemTable period="2026-09" cohort="todos" />)

    await waitFor(() => {
      expect(screen.getByText('Precios minoristas (IPC nivel general-Nacional; INDEC)')).toBeInTheDocument()
    })

    const exportBtn = screen.getByTestId('rem-table-export-csv')
    fireEvent.click(exportBtn)

    expect(createObjectURLMock).toHaveBeenCalled()
  })
})
