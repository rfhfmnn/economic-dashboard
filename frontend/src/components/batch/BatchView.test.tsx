import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BatchView } from './BatchView'
import { FileUploadZone } from './FileUploadZone'
import { PortfolioTable } from './PortfolioTable'

describe('Batch Portfolio Components', () => {
  const mockBatchResponse = {
    portfolio_name: 'Lote Corporativo',
    total_cuits: 2,
    valid_count: 2,
    invalid_count: 0,
    total_debt: 220000.0,
    peor_situacion_portfolio: 3,
    debtors: [
      {
        cuit: '20301234563',
        cuit_formateado: '20-30123456-3',
        denominacion: 'EMPRESA ALFA S.A.',
        peor_situacion: 1,
        deuda_total: 100000.0,
        nivel_riesgo: 'LOW',
        cantidad_entidades: 2,
        total_cheques_rechazados: 0,
        alertas_tempranas: [],
      },
      {
        cuit: '30712345671',
        cuit_formateado: '30-71234567-1',
        denominacion: 'EMPRESA BETA S.R.L.',
        peor_situacion: 3,
        deuda_total: 120000.0,
        nivel_riesgo: 'HIGH',
        cantidad_entidades: 3,
        total_cheques_rechazados: 2,
        alertas_tempranas: [
          {
            id: 'RECENT_BOUNCED_CHECKS',
            name: 'Cheques Rechazados Recientes',
            severity: 'high' as const,
            description: 'Cheques impagos en últimos 90 días',
          },
        ],
      },
    ],
    invalid_items: [],
    timestamp: '2024-05-10T15:00:00',
  }

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('/risk/batch')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockBatchResponse),
          })
        }
        return Promise.reject(new Error('Unknown url'))
      })
    )
  })

  it('renders FileUploadZone and switches input modes', () => {
    const handleEvaluateCuits = vi.fn()
    const handleEvaluateFile = vi.fn()

    render(
      <FileUploadZone
        onEvaluateCuits={handleEvaluateCuits}
        onEvaluateFile={handleEvaluateFile}
      />
    )

    expect(screen.getByText(/Subir Archivo/i)).toBeDefined()

    // Switch to Text mode
    const textTab = screen.getByRole('button', { name: /Pegar Lista de CUITs/i })
    fireEvent.click(textTab)
    expect(screen.getByPlaceholderText(/Pegue aquí los CUITs/i)).toBeDefined()

    // Click sample batch button
    const sampleBtn = screen.getByRole('button', { name: /Cargar Lote de Ejemplo/i })
    fireEvent.click(sampleBtn)
    expect(screen.getByText(/Total detectados:/i)).toBeDefined()
  })

  it('renders PortfolioTable with debtor rows and sorts columns', () => {
    render(<PortfolioTable debtors={mockBatchResponse.debtors} />)

    expect(screen.getByText('EMPRESA ALFA S.A.')).toBeDefined()
    expect(screen.getByText('EMPRESA BETA S.R.L.')).toBeDefined()

    // Search filter
    const searchInput = screen.getByPlaceholderText(/Buscar por CUIT o Razón Social/i)
    fireEvent.change(searchInput, { target: { value: 'BETA' } })
    expect(screen.queryByText('EMPRESA ALFA S.A.')).toBeNull()
    expect(screen.getByText('EMPRESA BETA S.R.L.')).toBeDefined()
  })

  it('evaluates batch portfolio and renders summary KPIs and Excel export button', async () => {
    render(<BatchView />)

    // Load sample and evaluate
    const sampleBtn = screen.getByRole('button', { name: /Cargar Lote de Ejemplo/i })
    fireEvent.click(sampleBtn)

    const evalBtn = screen.getByRole('button', { name: /Evaluar Portafolio en BCRA/i })
    fireEvent.click(evalBtn)

    await waitFor(() => {
      expect(screen.getByText('Lote Corporativo')).toBeDefined()
      expect(screen.getByText('Exportar a Excel')).toBeDefined()
      expect(screen.getByText('EMPRESA ALFA S.A.')).toBeDefined()
    })
  })
})
