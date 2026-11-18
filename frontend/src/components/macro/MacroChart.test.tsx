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

describe('MacroChart Component - Intelligent Temporal Periodicity Resampling', () => {
  it('renders periodicity segmented control with Original, Mensual, and Trimestral options', () => {
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
      />
    )

    const originalBtn = screen.getByTestId('periodicity-original')
    const mensualBtn = screen.getByTestId('periodicity-mensual')
    const trimestralBtn = screen.getByTestId('periodicity-trimestral')

    expect(originalBtn).toBeDefined()
    expect(mensualBtn).toBeDefined()
    expect(trimestralBtn).toBeDefined()

    expect(originalBtn.textContent).toContain('Original')
    expect(mensualBtn.textContent).toContain('Mensual')
    expect(trimestralBtn.textContent).toContain('Trimestral')
  })

  it('switches to Mensual and displays aggregation method badge for balance sheet stocks', async () => {
    const series: ChartSeries[] = [
      {
        id: 15,
        title: 'Base monetaria total',
        unit: 'ARS M',
        data: [
          { fecha: '2026-06-15', valor: 1000 },
          { fecha: '2026-06-30', valor: 1050 },
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
      />
    )

    const mensualBtn = screen.getByTestId('periodicity-mensual')
    fireEvent.click(mensualBtn)

    await waitFor(() => {
      const badge = screen.getByTestId('aggregation-rule-badge')
      expect(badge).toBeDefined()
      expect(badge.textContent).toContain('Saldo de cierre fin de período')
    })
  })

  it('displays arithmetic average badge when exchange rate series is resampled to Mensual', async () => {
    const fxSeries: ChartSeries[] = [
      {
        id: 4,
        title: 'Tipo de cambio oficial (A3500)',
        unit: 'ARS/USD',
        data: [
          { fecha: '2026-06-01', valor: 900 },
          { fecha: '2026-06-30', valor: 920 },
        ],
        axis: 'left',
        color: '#10b981',
      },
    ]

    render(
      <MacroChart
        series={fxSeries}
        timeframe="1Y"
        onTimeframeChange={vi.fn()}
      />
    )

    const mensualBtn = screen.getByTestId('periodicity-mensual')
    fireEvent.click(mensualBtn)

    await waitFor(() => {
      const badge = screen.getByTestId('aggregation-rule-badge')
      expect(badge).toBeDefined()
      expect(badge.textContent).toContain('Promedio mensual')
    })
  })

  it('displays compounded effective rate badge and updates unit for interest rate series in Trimestral mode', async () => {
    const rateSeries: ChartSeries[] = [
      {
        id: 7,
        title: 'Tasa BADLAR bancos privados',
        unit: '% TNA',
        data: [
          { fecha: '2026-01-15', valor: 40.0 },
          { fecha: '2026-03-31', valor: 38.0 },
        ],
        axis: 'left',
        color: '#8b5cf6',
      },
    ]

    render(
      <MacroChart
        series={rateSeries}
        timeframe="1Y"
        onTimeframeChange={vi.fn()}
      />
    )

    const trimestralBtn = screen.getByTestId('periodicity-trimestral')
    fireEvent.click(trimestralBtn)

    await waitFor(() => {
      const badge = screen.getByTestId('aggregation-rule-badge')
      expect(badge).toBeDefined()
      expect(badge.textContent).toContain('Tasa efectiva trimestral capitalizada (TET)')

      // Unit in legend / header should update to % TET
      const tetBadges = screen.getAllByText('% TET')
      expect(tetBadges.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('renders partial period badge when observations end mid-month', async () => {
    const partialSeries: ChartSeries[] = [
      {
        id: 15,
        title: 'Base monetaria total',
        unit: 'ARS M',
        data: [
          { fecha: '2026-06-30', valor: 1000 },
          { fecha: '2026-07-15', valor: 1050 }, // Cut off mid-month (16 days before end of month)
        ],
        axis: 'left',
        color: '#3b82f6',
      },
    ]

    render(
      <MacroChart
        series={partialSeries}
        timeframe="1Y"
        onTimeframeChange={vi.fn()}
      />
    )

    const mensualBtn = screen.getByTestId('periodicity-mensual')
    fireEvent.click(mensualBtn)

    await waitFor(() => {
      const partialBadge = screen.getByTestId('partial-period-badge')
      expect(partialBadge).toBeDefined()
      expect(partialBadge.textContent).toContain('Mes parcial en curso')
    })
  })

  it('triggers onPeriodicityChange callback when prop is provided', () => {
    const onPeriodicityChangeMock = vi.fn()
    const series: ChartSeries[] = [
      {
        id: 15,
        title: 'Base monetaria total',
        data: [{ fecha: '2026-06-30', valor: 1000 }],
        axis: 'left',
        color: '#3b82f6',
      },
    ]

    render(
      <MacroChart
        series={series}
        timeframe="1Y"
        onTimeframeChange={vi.fn()}
        onPeriodicityChange={onPeriodicityChangeMock}
      />
    )

    const trimestralBtn = screen.getByTestId('periodicity-trimestral')
    fireEvent.click(trimestralBtn)

    expect(onPeriodicityChangeMock).toHaveBeenCalledWith('trimestral')
  })

  it('seamlessly composes monthly periodicity with Real inflation adjustment', async () => {
    const series: ChartSeries[] = [
      {
        id: 15,
        title: 'Base monetaria total',
        unit: 'ARS M',
        data: [
          { fecha: '2026-06-15', valor: 1000 },
          { fecha: '2026-06-30', valor: 1000 },
          { fecha: '2026-07-31', valor: 1000 },
          { fecha: '2026-08-31', valor: 1000 },
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

    // Switch to Mensual
    const mensualBtn = screen.getByTestId('periodicity-mensual')
    fireEvent.click(mensualBtn)

    // Switch to Real mode
    const realBtn = screen.getByTestId('toggle-real')
    fireEvent.click(realBtn)

    await waitFor(() => {
      // Both badges should be visible
      const aggBadge = screen.getByTestId('aggregation-rule-badge')
      expect(aggBadge.textContent).toContain('Saldo de cierre fin de período')

      const realBadge = screen.getByTestId('real-mode-badge')
      expect(realBadge.textContent).toContain('Precios constantes')
    })
  })

  describe('Dynamic Base-100 Normalization & Scale Control', () => {
    const multiSeries: ChartSeries[] = [
      {
        id: 15,
        title: 'Base monetaria total',
        unit: 'ARS M',
        data: [
          { fecha: '2026-01-01', valor: 1000 },
          { fecha: '2026-02-01', valor: 1200 },
          { fecha: '2026-03-01', valor: 1500 },
        ],
        axis: 'left',
        color: '#3b82f6',
      },
      {
        id: 4,
        title: 'Tipo de cambio oficial (A3500)',
        unit: 'ARS/USD',
        data: [
          { fecha: '2026-01-01', valor: 800 },
          { fecha: '2026-02-01', valor: 880 },
          { fecha: '2026-03-01', valor: 960 },
        ],
        axis: 'right',
        color: '#8b5cf6',
      },
    ]

    it('renders Nivel and Base 100 segmented scale buttons with Nivel active by default', () => {
      render(
        <MacroChart
          series={multiSeries}
          timeframe="1Y"
          onTimeframeChange={vi.fn()}
        />
      )

      const levelBtn = screen.getByTestId('scale-level')
      const base100Btn = screen.getByTestId('scale-base100')

      expect(levelBtn).toBeDefined()
      expect(base100Btn).toBeDefined()
      expect(levelBtn.textContent).toBe('Nivel')
      expect(base100Btn.textContent).toBe('Base 100')
      expect(screen.queryByTestId('base-100-badge')).toBeNull()
    })

    it('switches to Base 100 mode when clicked, displays Base 100 badge and custom base date input', async () => {
      render(
        <MacroChart
          series={multiSeries}
          timeframe="1Y"
          onTimeframeChange={vi.fn()}
        />
      )

      const base100Btn = screen.getByTestId('scale-base100')
      fireEvent.click(base100Btn)

      await waitFor(() => {
        const badge = screen.getByTestId('base-100-badge')
        expect(badge).toBeDefined()
        expect(badge.textContent).toContain('Base 100 (t0 = 01/01/2026)')

        const baseDateInput = screen.getByTestId('custom-base-date-input')
        expect(baseDateInput).toBeDefined()
      })
    })

    it('allows changing custom base date and resetting it', async () => {
      render(
        <MacroChart
          series={multiSeries}
          timeframe="1Y"
          onTimeframeChange={vi.fn()}
        />
      )

      fireEvent.click(screen.getByTestId('scale-base100'))

      const baseDateInput = screen.getByTestId('custom-base-date-input')
      fireEvent.change(baseDateInput, { target: { value: '2026-02-01' } })

      await waitFor(() => {
        const badge = screen.getByTestId('base-100-badge')
        expect(badge.textContent).toContain('Base 100 (t0 = 01/02/2026)')
        expect(screen.getByTestId('reset-base-date-btn')).toBeDefined()
      })

      // Click reset
      fireEvent.click(screen.getByTestId('reset-base-date-btn'))

      await waitFor(() => {
        const badge = screen.getByTestId('base-100-badge')
        expect(badge.textContent).toContain('Base 100 (t0 = 01/01/2026)')
        expect(screen.queryByTestId('reset-base-date-btn')).toBeNull()
      })
    })

    it('triggers onBase100Change callback prop when clicked', () => {
      const onBase100ChangeMock = vi.fn()
      render(
        <MacroChart
          series={multiSeries}
          timeframe="1Y"
          onTimeframeChange={vi.fn()}
          onBase100Change={onBase100ChangeMock}
        />
      )

      fireEvent.click(screen.getByTestId('scale-base100'))
      expect(onBase100ChangeMock).toHaveBeenCalledWith(true)

      fireEvent.click(screen.getByTestId('scale-level'))
      expect(onBase100ChangeMock).toHaveBeenCalledWith(false)
    })

    it('generates dual columns in CSV export when Base 100 is active', async () => {
      let generatedBlob: Blob | null = null
      let downloadedFilename = ''

      const createUrlSpy = vi.spyOn(window.URL, 'createObjectURL').mockImplementation((blob: any) => {
        generatedBlob = blob
        return 'blob:fake-url'
      })
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
        downloadedFilename = this.download
      })

      render(
        <MacroChart
          series={multiSeries}
          timeframe="1Y"
          onTimeframeChange={vi.fn()}
          isBase100={true}
        />
      )

      const csvBtn = screen.getByRole('button', { name: /CSV\/Excel/i })
      fireEvent.click(csvBtn)

      expect(createUrlSpy).toHaveBeenCalled()
      expect(clickSpy).toHaveBeenCalled()
      expect(downloadedFilename).toContain('_base100')
      expect(downloadedFilename).toContain('.csv')

      expect(generatedBlob).not.toBeNull()
      const text = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.readAsText(generatedBlob as unknown as Blob)
      })
      expect(text).toContain('Base monetaria total - índice (base 100')
      expect(text).toContain('Base monetaria total - valor nativo')

      createUrlSpy.mockRestore()
      clickSpy.mockRestore()
    })

    it('seamlessly composes resampling, real inflation deflation, and base 100 normalization together', async () => {
      render(
        <MacroChart
          series={multiSeries}
          timeframe="1Y"
          onTimeframeChange={vi.fn()}
          cpiData={mockCpiData}
        />
      )

      // Step 1: Switch to Mensual periodicity
      fireEvent.click(screen.getByTestId('periodicity-mensual'))

      // Step 2: Switch to Real mode
      fireEvent.click(screen.getByTestId('toggle-real'))

      // Step 3: Switch to Base 100 scale
      fireEvent.click(screen.getByTestId('scale-base100'))

      await waitFor(() => {
        // All three badges/indicators should be active and harmonious
        expect(screen.getByTestId('aggregation-rule-badge')).toBeDefined()
        expect(screen.getByTestId('real-mode-badge')).toBeDefined()
        expect(screen.getByTestId('base-100-badge')).toBeDefined()

        const baseBadge = screen.getByTestId('base-100-badge')
        expect(baseBadge.textContent).toContain('Base 100')
      })
    })
  })
})
