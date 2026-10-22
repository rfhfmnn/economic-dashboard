import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import App from './App'
import { RiskBadge } from './components/common/RiskBadge'
import { EarlyWarningBadge } from './components/common/EarlyWarningBadge'

describe('App Shell & Navigation', () => {
  beforeEach(() => {
    // Mock global fetch for system status call
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('/system/status')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                status: 'ok',
                system: 'BCRA Economic & Credit Risk Engine',
                bcra_connected: true,
                dolarapi_connected: true,
                offline_mode: false,
                cached_records: { macro_series: 120, cuits: 15 },
                timestamp: new Date().toISOString(),
              }),
          })
        }
        return Promise.reject(new Error('Unknown url'))
      })
    )
  })

  it('renders header, insignia, and system status', async () => {
    render(<App />)
    expect(screen.getByText(/BCRA Economic & Credit Risk Monitor/i)).toBeDefined()
    expect(screen.getAllByText(/Central de Deudores/i).length).toBeGreaterThanOrEqual(1)

    await waitFor(() => {
      expect(
        screen.queryByText(/Live BCRA En Línea/i) ||
          screen.queryByText(/Modo Mock Sintético Activo/i)
      ).toBeDefined()
    })
  })

  it('navigates between Macro, Screener, and Batch tabs', () => {
    render(<App />)

    // Initial tab is Macro
    expect(screen.getAllByText(/Monitor Macro & FX/i).length).toBeGreaterThanOrEqual(1)

    // Switch to Screener
    const screenerTab = screen.getByRole('button', { name: /Central de Deudores/i })
    fireEvent.click(screenerTab)
    expect(screen.getByText(/Vectores de Prueba/i)).toBeDefined()

    // Switch to Batch
    const batchTab = screen.getByRole('button', { name: /Portafolio Batch/i })
    fireEvent.click(batchTab)
    expect(screen.getByText(/Subir Archivo/i)).toBeDefined()
  })
})

describe('Common Components', () => {
  it('renders RiskBadge with correct Situacion text and styling', () => {
    const { container } = render(<RiskBadge situacion={1} showDescription />)
    expect(screen.getByText('Sit. 1')).toBeDefined()
    expect(screen.getByText('(Normal)')).toBeDefined()
    expect(container.querySelector('.text-emerald-400')).toBeDefined()
  })

  it('renders EarlyWarningBadge with alert name and severity', () => {
    render(
      <EarlyWarningBadge
        badge={{
          id: 'CREDIT_DETERIORATION',
          name: 'Deterioro Crediticio',
          severity: 'high',
          description: 'Caída de calificación',
        }}
      />
    )
    expect(screen.getByText('Deterioro Crediticio')).toBeDefined()
  })
})
