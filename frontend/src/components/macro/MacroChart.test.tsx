import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MacroChart, type ChartSeries } from './MacroChart'
import type { CpiPoint } from '../../types'

const mockCpiData: CpiPoint[] = [
  { fecha: '2026-06-30', valor: 2.0, indice: 100.0 },
  { fecha: '2026-07-31', valor: 2.5, indice: 102.5 },
  { fecha: '2026-08-31', valor: 2.0, indice: 104.55 },
]

describe('MacroChart Component - Nominal / Real Inflation Deflation', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('/macro/cpi')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockCpiData),
          })
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([]),
        })
      })
    )
  })

  it('renders Nominal and Real (IPC) segmented toggle with Nominal active by default', () => {
    const series: ChartSeries[] = [
      {
        id: 15,
        title: 'Base monetaria total',
        unit: 'ARS M',
        data: [
          { fecha: '2026-06-15', valor: 1000 },
          { fecha: '2026-08-15', valor: 1200 },
        ],
        axis: 'left',
        color: '#3b82f6',
      },
    ]

    render(
      <MacroChart
        series={series}
        timeframe="1Y"
        onTimeframeChange={vi.fn()}
        cpiData={mockCpiData}
      />
    )

    const nominalBtn = screen.getByTestId('toggle-nominal')
    const realBtn = screen.getByTestId('toggle-real')

    expect(nominalBtn).toBeDefined()
    expect(realBtn).toBeDefined()
    expect(nominalBtn.textContent).toContain('Nominal')
    expect(realBtn.textContent).toContain('Real (IPC)')
    expect(realBtn.hasAttribute('disabled')).toBe(false)
  })

  it('switches to Real mode when clicked and displays constant prices badge with base period', async () => {
    const series: ChartSeries[] = [
      {
        id: 15,
        title: 'Base monetaria total',
        unit: 'ARS M',
        data: [
          { fecha: '2026-06-15', valor: 1000 },
          { fecha: '2026-07-15', valor: 1000 },
          { fecha: '2026-08-15', valor: 1000 },
        ],
        axis: 'left',
        color: '#3b82f6',
      },
    ]

    render(
      <MacroChart
        series={series}
        timeframe="1Y"
        onTimeframeChange={vi.fn()}
        cpiData={mockCpiData}
      />
    )

    const realBtn = screen.getByTestId('toggle-real')
    fireEvent.click(realBtn)

    await waitFor(() => {
      const badge = screen.getByTestId('real-mode-badge')
      expect(badge).toBeDefined()
      expect(badge.textContent).toContain('Precios constantes de Ago-2026 (INDEC IPC)')
    })
  })

  it('disables the Real toggle with explanatory tooltip when only ineligible series (USD or rates) are selected', () => {
    const ineligibleSeries: ChartSeries[] = [
      {
        id: 1,
        title: 'Reservas internacionales',
        unit: 'USD M',
        data: [{ fecha: '2026-08-01', valor: 28000 }],
        axis: 'left',
        color: '#10b981',
      },
      {
        id: 7,
        title: 'Tasa BADLAR bancos privados',
        unit: '% TNA',
        data: [{ fecha: '2026-08-01', valor: 38.5 }],
        axis: 'right',
        color: '#8b5cf6',
      },
    ]

    render(
      <MacroChart
        series={ineligibleSeries}
        timeframe="1Y"
        onTimeframeChange={vi.fn()}
        cpiData={mockCpiData}
      />
    )

    const realBtn = screen.getByTestId('toggle-real')
    expect(realBtn.hasAttribute('disabled')).toBe(true)

    // Check tooltip message
    const expectedTooltip = 'Ajuste no aplicable: las series seleccionadas ya están expresadas en moneda extranjera o porcentaje.'
    const parentContainer = realBtn.parentElement
    expect(parentContainer?.getAttribute('title')).toContain(expectedTooltip)
  })

  it('deflates only ARS series in mixed charts while preserving percentage series unadjusted', async () => {
    const mixedSeries: ChartSeries[] = [
      {
        id: 15,
        title: 'Base monetaria total',
        unit: 'ARS M',
        data: [
          { fecha: '2026-06-15', valor: 1000 },
          { fecha: '2026-08-15', valor: 1000 },
        ],
        axis: 'left',
        color: '#3b82f6',
      },
      {
        id: 7,
        title: 'Tasa BADLAR',
        unit: '% TNA',
        data: [
          { fecha: '2026-06-15', valor: 35.0 },
          { fecha: '2026-08-15', valor: 38.5 },
        ],
        axis: 'right',
        color: '#8b5cf6',
      },
    ]

    render(
      <MacroChart
        series={mixedSeries}
        timeframe="1Y"
        onTimeframeChange={vi.fn()}
        cpiData={mockCpiData}
      />
    )

    const realBtn = screen.getByTestId('toggle-real')
    expect(realBtn.hasAttribute('disabled')).toBe(false)
    fireEvent.click(realBtn)

    await waitFor(() => {
      // In Real mode, Base monetaria unit reflects (pesos constantes)
      const baseMonetariaUnits = screen.getAllByText(/pesos constantes/i)
      expect(baseMonetariaUnits.length).toBeGreaterThanOrEqual(1)

      // BADLAR rate unit remains '% TNA' unadjusted
      const badlarUnits = screen.getAllByText('% TNA')
      expect(badlarUnits.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('displays pending notice when observations extend beyond latest available CPI month', async () => {
    const seriesWithFutureObs: ChartSeries[] = [
      {
        id: 15,
        title: 'Base monetaria total',
        unit: 'ARS M',
        data: [
          { fecha: '2026-08-15', valor: 1000 },
          { fecha: '2026-09-10', valor: 1050 }, // After latest published CPI (2026-08)
        ],
        axis: 'left',
        color: '#3b82f6',
      },
    ]

    render(
      <MacroChart
        series={seriesWithFutureObs}
        timeframe="1Y"
        onTimeframeChange={vi.fn()}
        cpiData={mockCpiData}
      />
    )

    const realBtn = screen.getByTestId('toggle-real')
    fireEvent.click(realBtn)

    await waitFor(() => {
      const pendingNotice = screen.getByTestId('pending-cpi-notice')
      expect(pendingNotice).toBeDefined()
      expect(pendingNotice.textContent).toContain('pendientes de publicación IPC INDEC')
    })
  })

  it('reflects Real mode in CSV export headers', () => {
    const series: ChartSeries[] = [
      {
        id: 15,
        title: 'Base monetaria total',
        unit: 'ARS M',
        data: [
          { fecha: '2026-08-15', valor: 1000 },
        ],
        axis: 'left',
        color: '#3b82f6',
      },
    ]

    render(
      <MacroChart
        series={series}
        timeframe="1Y"
        onTimeframeChange={vi.fn()}
        cpiData={mockCpiData}
        isRealMode={true}
      />
    )

    const csvBtn = screen.getByRole('button', { name: /CSV\/Excel/i })
    expect(csvBtn).toBeDefined()

    let generatedBlob: Blob | null = null
    const createUrlSpy = vi.spyOn(window.URL, 'createObjectURL').mockImplementation((blob: any) => {
      generatedBlob = blob
      return 'blob:fake-url'
    })
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => { })

    fireEvent.click(csvBtn)

    expect(createUrlSpy).toHaveBeenCalled()
    expect(clickSpy).toHaveBeenCalled()
    expect(generatedBlob).not.toBeNull()

    createUrlSpy.mockRestore()
    clickSpy.mockRestore()
  })
})
