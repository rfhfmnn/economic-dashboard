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
        cantidad_entidades: 1,
        total_cheques_rechazados: 0,
        alertas_tempranas: [],
        entidades: [
          { entidad: 'BANCO DE GALICIA Y BS AS', situacion: 1, monto: 100000.0, diasAtraso: 0 },
        ],
      },
      {
        cuit: '30712345671',
        cuit_formateado: '30-71234567-1',
        denominacion: 'EMPRESA BETA S.R.L.',
        peor_situacion: 3,
        deuda_total: 120000.0,
        nivel_riesgo: 'HIGH',
        cantidad_entidades: 1,
        total_cheques_rechazados: 2,
        alertas_tempranas: [
          {
            id: 'RECENT_BOUNCED_CHECKS',
            name: 'Cheques Rechazados Recientes',
            severity: 'high' as const,
            description: 'Cheques impagos en últimos 90 días',
          },
        ],
        entidades: [
          { entidad: 'BBVA BANCO FRANCES', situacion: 3, monto: 120000.0, diasAtraso: 60 },
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

    // Input CUITs in text area
    const textarea = screen.getByPlaceholderText(/Pegue aquí los CUITs/i)
    fireEvent.change(textarea, { target: { value: '20-30123456-3\n30-71234567-1' } })
    expect(screen.getByText(/Total detectados:/i)).toBeDefined()
  })

  it('renders PortfolioTable with debtor rows and sorts columns', () => {
    render(<PortfolioTable debtors={mockBatchResponse.debtors} />)

    expect(screen.getByText('EMPRESA ALFA S.A.')).toBeDefined()
    expect(screen.getByText('EMPRESA BETA S.R.L.')).toBeDefined()
    expect(screen.getByText('Entidad Financiera')).toBeDefined()
    expect(screen.getByText('BANCO DE GALICIA Y BS AS')).toBeDefined()
    expect(screen.getByText('BBVA BANCO FRANCES')).toBeDefined()

    // Search filter
    const searchInput = screen.getByPlaceholderText(/Buscar por CUIT, Entidad o Razón Social/i)
    fireEvent.change(searchInput, { target: { value: 'BETA' } })
    expect(screen.queryByText('EMPRESA ALFA S.A.')).toBeNull()
    expect(screen.getByText('EMPRESA BETA S.R.L.')).toBeDefined()
  })

  it('evaluates batch portfolio and renders summary KPIs and Excel export button', async () => {
    render(<BatchView />)

    // Switch to text mode and input CUITs
    const textTab = screen.getByRole('button', { name: /Pegar Lista de CUITs/i })
    fireEvent.click(textTab)

    const textarea = screen.getByPlaceholderText(/Pegue aquí los CUITs/i)
    fireEvent.change(textarea, { target: { value: '20-30123456-3\n30-71234567-1' } })

    const evalBtn = screen.getByRole('button', { name: /Evaluar Portafolio en BCRA/i })
    fireEvent.click(evalBtn)

    await waitFor(() => {
      expect(screen.getByText('Lote Corporativo')).toBeDefined()
      expect(screen.getByText('Exportar a Excel')).toBeDefined()
      expect(screen.getByText('EMPRESA ALFA S.A.')).toBeDefined()
    })
  })

  it('renders a distinct row for each Entidad Financiera when a debtor has multiple bank debts', () => {
    const multiEntityDebtor = [
      {
        cuit: '30546689979',
        cuit_formateado: '30-54668997-9',
        denominacion: 'YPF S.A.',
        peor_situacion: 2,
        deuda_total: 500000.0,
        nivel_riesgo: 'MEDIUM',
        cantidad_entidades: 2,
        total_cheques_rechazados: 0,
        alertas_tempranas: [],
        entidades: [
          { entidad: 'BANCO NACION', situacion: 1, monto: 300000.0, diasAtraso: 0 },
          { entidad: 'BANCO SANTANDER', situacion: 2, monto: 200000.0, diasAtraso: 30 },
        ],
      },
    ]

    render(<PortfolioTable debtors={multiEntityDebtor} />)

    // Two distinct rows should be rendered for YPF S.A., one for BANCO NACION and one for BANCO SANTANDER
    expect(screen.getAllByText('YPF S.A.').length).toBe(2)
    expect(screen.getByText('BANCO NACION')).toBeDefined()
    expect(screen.getByText('BANCO SANTANDER')).toBeDefined()
    expect(screen.getByText('$300.000,0')).toBeDefined()
    expect(screen.getByText('$200.000,0')).toBeDefined()
  })

  it('switches to consolidated debtor view and toggles entity breakdown', () => {
    render(<PortfolioTable debtors={mockBatchResponse.debtors} />)

    // Switch to Consolidado por Deudor mode
    const groupTab = screen.getByRole('button', { name: /Consolidado por Deudor/i })
    fireEvent.click(groupTab)

    expect(screen.getByText('Peor Situación')).toBeDefined()
    expect(screen.getByText('Deuda Total (ARS)')).toBeDefined()
    expect(screen.getByText('EMPRESA ALFA S.A.')).toBeDefined()
    expect(screen.getByText('EMPRESA BETA S.R.L.')).toBeDefined()

    // Expand debtor details
    const expandBtn = screen.getAllByTitle('Ver entidades')[0]
    fireEvent.click(expandBtn)
    expect(screen.getByText(/Desglose de Entidades Financieras/i)).toBeDefined()
  })
})

