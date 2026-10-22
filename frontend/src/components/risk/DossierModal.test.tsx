import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DossierModal } from './DossierModal'
import type { DebtorReport } from '../../types'

describe('DossierModal Component', () => {
  const mockReport: DebtorReport = {
    cuit: '20301234563',
    cuit_formateado: '20-30123456-3',
    denominacion: 'EMPRESA EJECUTIVA S.A.',
    peor_situacion: 2,
    deuda_total: 850000.0,
    nivel_riesgo: 'MEDIUM',
    periodo: '2024-05',
    entidades: [
      { entidad: 'BANCO NACION', situacion: 1, monto: 500000.0, diasAtraso: 0 },
      { entidad: 'BANCO PROVINCIA', situacion: 2, monto: 350000.0, diasAtraso: 30 },
    ],
    historia_24m: [
      { periodo: '2024-04', situacion: 1 },
      { periodo: '2024-05', situacion: 2 },
    ],
    cheques_rechazados: {
      cantidad: 1,
      total_monto: 25000.0,
      detalles: [],
    },
    alertas_tempranas: [
      {
        id: 'CREDIT_DETERIORATION',
        name: 'Deterioro Crediticio',
        severity: 'high',
        description: 'Caída de situación en últimos meses',
      },
    ],
  }

  it('does not render when isOpen is false', () => {
    const { container } = render(
      <DossierModal isOpen={false} onClose={() => {}} report={mockReport} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders complete executive dossier elements when open', () => {
    render(<DossierModal isOpen={true} onClose={() => {}} report={mockReport} />)

    expect(screen.getByText('BANCO CENTRAL DE LA REPÚBLICA ARGENTINA')).toBeDefined()
    expect(screen.getByText('EMPRESA EJECUTIVA S.A.')).toBeDefined()
    expect(screen.getByText('20-30123456-3')).toBeDefined()
    expect(screen.getByText('$850.000 ARS')).toBeDefined()
    expect(screen.getByText('Deterioro Crediticio')).toBeDefined()
    expect(screen.getByText('BANCO NACION')).toBeDefined()
    expect(screen.getByText('BANCO PROVINCIA')).toBeDefined()
    expect(screen.getByText('Imprimir Dossier')).toBeDefined()
  })

  it('triggers window.print when Imprimir Dossier button is clicked', () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {})
    render(<DossierModal isOpen={true} onClose={() => {}} report={mockReport} />)

    const printBtn = screen.getByRole('button', { name: /Imprimir Dossier/i })
    fireEvent.click(printBtn)
    expect(printSpy).toHaveBeenCalled()
    printSpy.mockRestore()
  })

  it('calls onClose when close button is clicked', () => {
    const handleClose = vi.fn()
    render(<DossierModal isOpen={true} onClose={handleClose} report={mockReport} />)

    const closeBtn = screen.getByRole('button', { name: /Cerrar modal/i })
    fireEvent.click(closeBtn)
    expect(handleClose).toHaveBeenCalled()
  })
})
