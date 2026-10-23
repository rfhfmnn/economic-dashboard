import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ScreenerView } from './ScreenerView'
import { CuitSearchInput } from './CuitSearchInput'
import { DebtEntityTable } from './DebtEntityTable'
import { HistoryHeatmap } from './HistoryHeatmap'
import { BouncedChecks } from './BouncedChecks'

describe('Credit Screener Components', () => {
  const mockDebtorReport = {
    cuit: '20301234563',
    cuit_formateado: '20-30123456-3',
    denominacion: 'ACME ARGENTINA S.A.',
    peor_situacion: 2,
    deuda_total: 125000.0,
    nivel_riesgo: 'MEDIUM',
    periodo: '2024-05',
    entidades: [
      { entidad: 'BANCO DE GALICIA Y BUENOS AIRES', situacion: 1, monto: 75000.0, diasAtraso: 0 },
      { entidad: 'BANCO SANTANDER ARGENTINA', situacion: 2, monto: 50000.0, diasAtraso: 45 },
    ],
    historia_24m: [
      { periodo: '2024-04', situacion: 1 },
      { periodo: '2024-05', situacion: 2 },
    ],
    cheques_rechazados: {
      cantidad: 1,
      total_monto: 15000.0,
      detalles: [{ numeroCheque: 'CHQ-8821', fechaRechazo: '2024-04-12', monto: 15000.0, causal: 'Sin fondos' }],
    },
    alertas_tempranas: [
      {
        id: 'CREDIT_DETERIORATION',
        name: 'Deterioro crediticio',
        severity: 'high' as const,
        description: 'Empeoramiento de calificación en los últimos meses',
      },
    ],
  }

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('/risk/deudores/')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockDebtorReport),
          })
        }
        return Promise.reject(new Error('Unknown url'))
      })
    )
  })

  it('validates CUIT input and triggers search on submit', () => {
    const handleSearch = vi.fn()
    render(<CuitSearchInput onSearch={handleSearch} />)

    const input = screen.getByPlaceholderText(/Ej: 20-30123456-3/i)
    fireEvent.change(input, { target: { value: '20-30123456-3' } })

    const searchBtn = screen.getByRole('button', { name: /Consultar BCRA/i })
    fireEvent.click(searchBtn)
    expect(handleSearch).toHaveBeenCalledWith('20-30123456-3', false)
  })

  it('renders DebtEntityTable with entity list and amounts', () => {
    render(
      <DebtEntityTable
        entidades={mockDebtorReport.entidades}
        totalDebt={mockDebtorReport.deuda_total}
      />
    )
    expect(screen.getByText('BANCO DE GALICIA Y BUENOS AIRES')).toBeDefined()
    expect(screen.getByText('BANCO SANTANDER ARGENTINA')).toBeDefined()
  })

  it('renders HistoryHeatmap cells with situation labels', () => {
    render(<HistoryHeatmap history={mockDebtorReport.historia_24m} />)
    expect(screen.getByText(/Matriz de calificación histórica/i)).toBeDefined()
    expect(screen.getByText('05/24')).toBeDefined()
  })

  it('renders BouncedChecks details and accumulated amounts', () => {
    render(<BouncedChecks cheques={mockDebtorReport.cheques_rechazados} />)
    expect(screen.getByText(/Registro de cheques rechazados/i)).toBeDefined()
    expect(screen.getByText('CHQ-8821')).toBeDefined()
  })

  it('loads and integrates full ScreenerView dossier', async () => {
    render(<ScreenerView initialCuit="20-30123456-3" />)
    await waitFor(() => {
      expect(screen.getByText('ACME ARGENTINA S.A.')).toBeDefined()
      expect(screen.getByText('Exportar PDF')).toBeDefined()
      expect(screen.getByText('BANCO DE GALICIA Y BUENOS AIRES')).toBeDefined()
    })
  })

  it('calculates and displays DTI ratio when income is entered', async () => {
    render(<ScreenerView initialCuit="20-30123456-3" />)
    await waitFor(() => {
      expect(screen.getByText('ACME ARGENTINA S.A.')).toBeDefined()
    })

    const incomeInput = screen.getByPlaceholderText(/Ingreso estimado/i)
    fireEvent.change(incomeInput, { target: { value: '50000' } })

    expect(screen.getByText(/Carga \/ Cobertura/i)).toBeDefined()
  })
})
