import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WorkbenchToolbar, type ScaleMode } from '../WorkbenchToolbar'
import type { ExpressionMode } from '../../../utils/transforms'

describe('WorkbenchToolbar Component', () => {
  const defaultProps = {
    viewMode: 'normalized' as const,
    onChangeViewMode: vi.fn(),
    timeframe: '1Y' as const,
    onChangeTimeframe: vi.fn(),
    customStart: '2025-01-01',
    customEnd: '2026-01-01',
    onChangeCustomDates: vi.fn(),
    expressionMode: 'base100' as ExpressionMode,
    onChangeExpressionMode: vi.fn(),
    scaleMode: 'auto' as ScaleMode,
    onChangeScaleMode: vi.fn(),
    adjustInflation: false,
    onToggleAdjustInflation: vi.fn(),
    hasArsSeries: true,
    activeSeries: [],
    seriesA: '',
    seriesB: '',
    onChangeSeriesA: vi.fn(),
    onChangeSeriesB: vi.fn(),
    correlationWindow: 90 as const,
    onChangeCorrelationWindow: vi.fn(),
    isDownsampled: false,
    onExportCsv: vi.fn(),
    onExportExcel: vi.fn(),
    isExportingExcel: false,
  }

  it('renders all four expression mode segmented buttons in strict sentence case', () => {
    render(<WorkbenchToolbar {...defaultProps} />)

    expect(screen.getByText('Unidad original')).toBeInTheDocument()
    expect(screen.getByText('Base 100 (t₀ = 100)')).toBeInTheDocument()
    expect(screen.getByText('Variación intermensual (MoM %)')).toBeInTheDocument()
    expect(screen.getByText('Variación interanual (YoY %)')).toBeInTheDocument()
  })

  it('triggers onChangeExpressionMode with correct mode when segmented buttons are clicked', () => {
    const onChangeExpressionMode = vi.fn()
    render(<WorkbenchToolbar {...defaultProps} onChangeExpressionMode={onChangeExpressionMode} />)

    fireEvent.click(screen.getByText('Unidad original'))
    expect(onChangeExpressionMode).toHaveBeenCalledWith('original')

    fireEvent.click(screen.getByText('Variación intermensual (MoM %)'))
    expect(onChangeExpressionMode).toHaveBeenCalledWith('mom')

    fireEvent.click(screen.getByText('Variación interanual (YoY %)'))
    expect(onChangeExpressionMode).toHaveBeenCalledWith('yoy')

    fireEvent.click(screen.getByText('Base 100 (t₀ = 100)'))
    expect(onChangeExpressionMode).toHaveBeenCalledWith('base100')
  })

  it('renders scale mode toggle in strict sentence case and triggers onChangeScaleMode', () => {
    const onChangeScaleMode = vi.fn()
    const { rerender } = render(
      <WorkbenchToolbar
        {...defaultProps}
        scaleMode="auto"
        onChangeScaleMode={onChangeScaleMode}
      />
    )

    const autoBtn = screen.getByText('Ajuste automático (zoom a variación)')
    const zeroBtn = screen.getByText('Origen en cero (0)')

    expect(autoBtn).toBeInTheDocument()
    expect(zeroBtn).toBeInTheDocument()

    // Click zero origin
    fireEvent.click(zeroBtn)
    expect(onChangeScaleMode).toHaveBeenCalledWith('zero')

    // Rerender with zero mode active
    rerender(
      <WorkbenchToolbar
        {...defaultProps}
        scaleMode="zero"
        onChangeScaleMode={onChangeScaleMode}
      />
    )

    // Click auto zoom
    fireEvent.click(autoBtn)
    expect(onChangeScaleMode).toHaveBeenCalledWith('auto')
  })

  it('renders inflation switch and handles toggle', () => {
    const onToggleAdjustInflation = vi.fn()
    render(
      <WorkbenchToolbar
        {...defaultProps}
        onToggleAdjustInflation={onToggleAdjustInflation}
        adjustInflation={false}
        hasArsSeries={true}
      />
    )

    const checkbox = screen.getByRole('checkbox', {
      name: /Ajustar por inflación \(términos reales\)/i,
    })
    expect(checkbox).toBeInTheDocument()
    expect(checkbox).not.toBeDisabled()

    fireEvent.click(checkbox)
    expect(onToggleAdjustInflation).toHaveBeenCalledWith(true)
  })

  it('disables inflation switch when no eligible ARS series is present', () => {
    render(<WorkbenchToolbar {...defaultProps} hasArsSeries={false} />)

    const checkbox = screen.getByRole('checkbox', {
      name: /Ajustar por inflación \(términos reales\)/i,
    })
    expect(checkbox).toBeDisabled()
  })
})
