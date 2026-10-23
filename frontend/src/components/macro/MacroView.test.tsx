import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MacroView } from './MacroView'
import { MetricCard } from './MetricCard'
import { MacroChart } from './MacroChart'
import { FxSpreadChart } from './FxSpreadChart'

describe('MacroView Components', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('/macro/summary')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                indicators: [
                  {
                    idVariable: 1,
                    descripcion: 'Reservas internacionales',
                    valor: 27800.5,
                    fecha: '2024-05-10',
                    categoria: 'Monetaria',
                  },
                  {
                    idVariable: 28,
                    descripcion: 'Inflación Interanual',
                    valor: 68.5,
                    fecha: '2024-05-10',
                    categoria: 'Precios',
                    unit: '%',
                  },
                  {
                    idVariable: 27,
                    descripcion: 'Base monetaria total',
                    valor: 14500.0,
                    fecha: '2024-05-10',
                    categoria: 'Monetaria',
                  },
                ],
                fx_summary: {},
                timestamp: '2024-05-10T12:00:00',
              }),
          })
        }
        if (url.includes('/macro/catalog')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve([
                { idVariable: 1, descripcion: 'Reservas internacionales', categoria: 'Monetaria' },
                { idVariable: 28, descripcion: 'Inflación Interanual', categoria: 'Precios', unit: '%' },
                { idVariable: 27, descripcion: 'Base monetaria total', categoria: 'Monetaria' },
              ]),
          })
        }
        if (url.includes('/macro/fx/spreads')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                oficial_base: 885.0,
                rates: {
                  oficial: { moneda: 'USD', nombre: 'Oficial', compra: 865.0, venta: 885.0, fechaActualizacion: '' },
                  mep: { moneda: 'USD', nombre: 'MEP', compra: 1040.0, venta: 1045.0, fechaActualizacion: '' },
                  ccl: { moneda: 'USD', nombre: 'CCL', compra: 1090.0, venta: 1095.0, fechaActualizacion: '' },
                  blue: { moneda: 'USD', nombre: 'Blue', compra: 1020.0, venta: 1040.0, fechaActualizacion: '' },
                },
                spreads: {
                  mep: { tipo: 'mep', oficial_venta: 885.0, paralelo_venta: 1045.0, brecha_porcentaje: 18.08, timestamp: '' },
                  ccl: { tipo: 'ccl', oficial_venta: 885.0, paralelo_venta: 1095.0, brecha_porcentaje: 23.73, timestamp: '' },
                  blue: { tipo: 'blue', oficial_venta: 885.0, paralelo_venta: 1040.0, brecha_porcentaje: 17.51, timestamp: '' },
                },
                timestamp: '2024-05-10T12:00:00',
              }),
          })
        }
        if (url.includes('/macro/fx/history')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                rates: {
                  oficial: [
                    { fecha: '2024-01-01', valor: 800.0, compra: 790.0, venta: 800.0 },
                    { fecha: '2024-05-01', valor: 885.0, compra: 865.0, venta: 885.0 },
                  ],
                  mep: [
                    { fecha: '2024-01-01', valor: 950.0, compra: 945.0, venta: 950.0 },
                    { fecha: '2024-05-01', valor: 1045.0, compra: 1040.0, venta: 1045.0 },
                  ],
                  ccl: [
                    { fecha: '2024-01-01', valor: 980.0, compra: 975.0, venta: 980.0 },
                    { fecha: '2024-05-01', valor: 1095.0, compra: 1090.0, venta: 1095.0 },
                  ],
                  blue: [
                    { fecha: '2024-01-01', valor: 1000.0, compra: 990.0, venta: 1000.0 },
                    { fecha: '2024-05-01', valor: 1040.0, compra: 1020.0, venta: 1040.0 },
                  ],
                },
                last_updated: '2024-05-10T12:00:00',
                source: 'test',
              }),
          })
        }
        if (url.includes('/macro/series/28')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                id_variable: 28,
                variable_name: 'Inflación Interanual',
                count: 2,
                data: [
                  { fecha: '2024-04-01', valor: 65.0 },
                  { fecha: '2024-05-01', valor: 68.5 },
                ],
              }),
          })
        }
        if (url.includes('/macro/series/')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                id_variable: 1,
                variable_name: 'Reservas internacionales',
                count: 3,
                data: [
                  { fecha: '2024-03-01', valor: 27000 },
                  { fecha: '2024-04-01', valor: 27500 },
                  { fecha: '2024-05-01', valor: 27800 },
                ],
              }),
          })
        }
        return Promise.reject(new Error('Unknown url'))
      })
    )
  })

  it('renders MetricCard with formatted tabular value', () => {
    render(
      <MetricCard
        title="Reservas internacionales"
        value={27800}
        date="2024-05-10"
        unit="USD M"
        category="Monetaria"
      />
    )
    expect(screen.getByText('Reservas internacionales')).toBeDefined()
    expect(screen.getByText('USD M')).toBeDefined()
    expect(screen.getByText('Monetaria')).toBeDefined()
  })

  it('renders MacroChart and switches timeframes', () => {
    const handleTf = vi.fn()
    render(
      <MacroChart
        primaryTitle="Reservas internacionales"
        primaryData={[
          { fecha: '2024-01-01', valor: 25000 },
          { fecha: '2024-05-01', valor: 27800 },
        ]}
        timeframe="1Y"
        onTimeframeChange={handleTf}
      />
    )
    expect(screen.getByText('Reservas internacionales')).toBeDefined()
    const btn6M = screen.getByRole('button', { name: '6M' })
    fireEvent.click(btn6M)
    expect(handleTf).toHaveBeenCalledWith('6M')
  })

  it('renders FxSpreadChart with rates and spreads', () => {
    const mockFx = {
      oficial_base: 885.0,
      rates: {
        oficial: { moneda: 'USD', nombre: 'Oficial', compra: 865.0, venta: 885.0, fechaActualizacion: '' },
        mep: { moneda: 'USD', nombre: 'MEP', compra: 1040.0, venta: 1045.0, fechaActualizacion: '' },
        ccl: { moneda: 'USD', nombre: 'CCL', compra: 1090.0, venta: 1095.0, fechaActualizacion: '' },
        blue: { moneda: 'USD', nombre: 'Blue', compra: 1020.0, venta: 1040.0, fechaActualizacion: '' },
      },
      spreads: {
        mep: { tipo: 'mep', oficial_venta: 885.0, paralelo_venta: 1045.0, brecha_porcentaje: 18.08, timestamp: '' },
        ccl: { tipo: 'ccl', oficial_venta: 885.0, paralelo_venta: 1095.0, brecha_porcentaje: 23.73, timestamp: '' },
        blue: { tipo: 'blue', oficial_venta: 885.0, paralelo_venta: 1040.0, brecha_porcentaje: 17.51, timestamp: '' },
      },
      timestamp: '2024-05-10T12:00:00',
    }
    render(<FxSpreadChart fxData={mockFx} />)
    expect(screen.getByText(/Monitor Cambiario/i)).toBeDefined()
    expect(screen.getByText('Oficial mayorista')).toBeDefined()
    expect(screen.getByText('Dólar MEP')).toBeDefined()
    expect(screen.getAllByText(/\+18\.1%/).length).toBeGreaterThanOrEqual(1)
  })

  it('loads and integrates MacroView view asynchronously', async () => {
    render(<MacroView />)
    await waitFor(() => {
      expect(screen.getAllByText('Reservas internacionales').length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('Base monetaria total')).toBeDefined()
      expect(screen.getByText(/Monitor cambiario & brecha financiera/i)).toBeDefined()
    })
  })

  it('renders MacroChart with multiple series across left and right axes', () => {
    const multiSeries = [
      {
        id: 1,
        title: 'Reservas internacionales',
        data: [{ fecha: '2024-01-01', valor: 25000 }],
        axis: 'left' as const,
        color: '#3b82f6',
      },
      {
        id: 15,
        title: 'Base monetaria',
        data: [{ fecha: '2024-01-01', valor: 45000 }],
        axis: 'left' as const,
        color: '#06b6d4',
      },
      {
        id: 7,
        title: 'Tasa BADLAR',
        data: [{ fecha: '2024-01-01', valor: 35.5 }],
        axis: 'right' as const,
        color: '#8b5cf6',
      },
    ]

    render(
      <MacroChart
        series={multiSeries}
        timeframe="1Y"
        onTimeframeChange={vi.fn()}
      />
    )

    expect(screen.getByText('Reservas internacionales')).toBeDefined()
    expect(screen.getByText('Base monetaria')).toBeDefined()
    expect(screen.getByText('Tasa BADLAR')).toBeDefined()
    expect(screen.getByText('Principal')).toBeDefined()
    expect(screen.getByText('Dual')).toBeDefined()
  })

  it('renders PNG and CSV/Excel export buttons and handles download clicks', () => {
    const multiSeries = [
      {
        id: 1,
        title: 'Reservas internacionales',
        unit: 'USD M',
        data: [{ fecha: '2024-01-01', valor: 25000 }],
        axis: 'left' as const,
        color: '#3b82f6',
      },
    ]

    render(
      <MacroChart
        series={multiSeries}
        timeframe="1Y"
        onTimeframeChange={vi.fn()}
      />
    )

    const pngBtn = screen.getByRole('button', { name: /PNG/i })
    const csvBtn = screen.getByRole('button', { name: /CSV \/ Excel/i })

    expect(pngBtn).toBeDefined()
    expect(csvBtn).toBeDefined()
    expect(pngBtn.hasAttribute('disabled')).toBe(false)
    expect(csvBtn.hasAttribute('disabled')).toBe(false)

    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => { })
    fireEvent.click(csvBtn)
    fireEvent.click(pngBtn)
    expect(clickSpy).toHaveBeenCalled()
    clickSpy.mockRestore()
  })

  it('focuses Reservas internacionales when clicking KPI card without showing empty observation error', async () => {
    render(<MacroView />)

    await waitFor(() => {
      expect(screen.getAllByText('Reservas internacionales').length).toBeGreaterThanOrEqual(1)
    })

    const reservasCard = screen.getAllByText('Reservas internacionales')[0].closest('div')
    if (reservasCard) {
      fireEvent.click(reservasCard)
    }

    await waitFor(() => {
      expect(screen.queryByText(/Sin observaciones disponibles/i)).toBeNull()
    })
  })

  it('focuses Inflacion Interanual in principal variables and updates chart', async () => {
    render(<MacroView />)

    await waitFor(() => {
      expect(screen.getAllByText('Inflación Interanual').length).toBeGreaterThanOrEqual(1)
    })

    const inflacionCard = screen.getAllByText('Inflación Interanual')[0].closest('div')
    if (inflacionCard) {
      fireEvent.click(inflacionCard)
    }

    await waitFor(() => {
      expect(screen.queryByText(/Sin observaciones disponibles/i)).toBeNull()
    })
  })

  it('renders FxSpreadChart with four cotizations by default and supports toggles and timeframes', async () => {
    const mockFxData = {
      oficial_base: 885.0,
      rates: {
        oficial: { moneda: 'USD', nombre: 'Oficial', compra: 865.0, venta: 885.0, fechaActualizacion: '' },
        mep: { moneda: 'USD', nombre: 'MEP', compra: 1040.0, venta: 1045.0, fechaActualizacion: '' },
        ccl: { moneda: 'USD', nombre: 'CCL', compra: 1090.0, venta: 1095.0, fechaActualizacion: '' },
        blue: { moneda: 'USD', nombre: 'Blue', compra: 1020.0, venta: 1040.0, fechaActualizacion: '' },
      },
      spreads: {
        mep: { tipo: 'mep', oficial_venta: 885.0, paralelo_venta: 1045.0, brecha_porcentaje: 18.08, timestamp: '' },
        ccl: { tipo: 'ccl', oficial_venta: 885.0, paralelo_venta: 1095.0, brecha_porcentaje: 23.73, timestamp: '' },
        blue: { tipo: 'blue', oficial_venta: 885.0, paralelo_venta: 1040.0, brecha_porcentaje: 17.51, timestamp: '' },
      },
      timestamp: '2024-05-10T12:00:00',
    }

    render(<FxSpreadChart fxData={mockFxData} />)

    // Verify Title and Subtitle
    expect(screen.getByText('Monitor cambiario & brecha financiera')).toBeDefined()

    // Verify 4 Cotizations exist
    await waitFor(() => {
      expect(screen.getAllByText(/Oficial/i).length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText(/MEP/i).length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText(/CCL/i).length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText(/Blue/i).length).toBeGreaterThanOrEqual(1)
    })

    // Verify default timeframes are rendered
    expect(screen.getByRole('button', { name: '1M' })).toBeDefined()
    expect(screen.getByRole('button', { name: '3M' })).toBeDefined()
    expect(screen.getByRole('button', { name: '6M' })).toBeDefined()
    expect(screen.getByRole('button', { name: '1Y' })).toBeDefined()
    expect(screen.getByRole('button', { name: '5Y' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Max' })).toBeDefined()
    expect(screen.getByRole('button', { name: /Personalizado/i })).toBeDefined()

    // Test switching timeframe
    fireEvent.click(screen.getByRole('button', { name: '3M' }))

    // Test toggling 'Personalizado'
    fireEvent.click(screen.getByRole('button', { name: /Personalizado/i }))
    expect(screen.getByLabelText(/Desde:/i)).toBeDefined()
    expect(screen.getByLabelText(/Hasta:/i)).toBeDefined()

    // Test toggling a cotization pill
    const bluePill = screen.getByText('Blue').closest('div')
    if (bluePill) {
      fireEvent.click(bluePill)
    }

    // Export buttons
    const pngBtn = screen.getByRole('button', { name: /PNG/i })
    const csvBtn = screen.getByRole('button', { name: /CSV/i })
    expect(pngBtn).toBeDefined()
    expect(csvBtn).toBeDefined()
  })
})
