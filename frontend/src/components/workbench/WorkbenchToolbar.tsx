import React from 'react'
import { Download, ArrowRightLeft } from 'lucide-react'
import type { WorkbenchSeriesData } from '../../types'
import type { ExpressionMode } from '../../utils/transforms'

export type WorkbenchViewMode = 'normalized' | 'correlation'
export type NormalizationType = 'base100' | 'percent' | ExpressionMode
export type TimeframeOption = '1M' | '3M' | '6M' | '1Y' | '5Y' | 'Max'
export type ScaleMode = 'auto' | 'zero'
export type { ExpressionMode }

export interface WorkbenchToolbarProps {
  viewMode: WorkbenchViewMode
  onChangeViewMode: (mode: WorkbenchViewMode) => void
  timeframe: TimeframeOption
  onChangeTimeframe: (tf: TimeframeOption) => void
  customStart: string
  customEnd: string
  onChangeCustomDates: (start: string, end: string) => void
  expressionMode?: ExpressionMode
  onChangeExpressionMode?: (mode: ExpressionMode) => void
  scaleMode?: ScaleMode
  onChangeScaleMode?: (mode: ScaleMode) => void
  normalization?: NormalizationType
  onChangeNormalization?: (norm: NormalizationType) => void
  adjustInflation: boolean
  onToggleAdjustInflation: (adjust: boolean) => void
  hasArsSeries: boolean
  // Correlation controls
  activeSeries: WorkbenchSeriesData[]
  seriesA: string
  seriesB: string
  onChangeSeriesA: (id: string) => void
  onChangeSeriesB: (id: string) => void
  correlationWindow: 30 | 90 | 180
  onChangeCorrelationWindow: (win: 30 | 90 | 180) => void
  isDownsampled: boolean
  // Export handlers
  onExportCsv: () => void
  onExportExcel: () => void
  isExportingExcel: boolean
}

export const WorkbenchToolbar: React.FC<WorkbenchToolbarProps> = ({
  viewMode,
  onChangeViewMode,
  timeframe,
  onChangeTimeframe,
  customStart,
  customEnd,
  onChangeCustomDates,
  expressionMode,
  onChangeExpressionMode,
  scaleMode = 'auto',
  onChangeScaleMode,
  normalization,
  onChangeNormalization,
  adjustInflation,
  onToggleAdjustInflation,
  hasArsSeries,
  activeSeries,
  seriesA,
  seriesB,
  onChangeSeriesA,
  onChangeSeriesB,
  correlationWindow,
  onChangeCorrelationWindow,
  isDownsampled,
  onExportCsv,
  onExportExcel,
  isExportingExcel,
}) => {
  const activeMode: ExpressionMode =
    expressionMode ??
    (normalization === 'percent'
      ? 'mom'
      : normalization === 'original' ||
        normalization === 'base100' ||
        normalization === 'mom' ||
        normalization === 'yoy'
      ? normalization
      : 'base100')

  const handleModeChange = (newMode: ExpressionMode) => {
    if (onChangeExpressionMode) {
      onChangeExpressionMode(newMode)
    }
    if (onChangeNormalization) {
      onChangeNormalization(newMode === 'mom' ? 'percent' : newMode === 'base100' ? 'base100' : (newMode as any))
    }
  }
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-4">
      {/* Top row: Mode selector + Exports */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
        {/* Visual mode toggle */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg w-fit">
          <button
            type="button"
            onClick={() => onChangeViewMode('normalized')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              viewMode === 'normalized'
                ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Serie temporal normalizada
          </button>
          <button
            type="button"
            onClick={() => onChangeViewMode('correlation')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              viewMode === 'correlation'
                ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Correlación móvil
          </button>
        </div>

        {/* Export buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onExportCsv}
            disabled={activeSeries.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-md hover:bg-slate-50 dark:hover:bg-slate-700/60 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Exportar CSV</span>
          </button>
          <button
            type="button"
            onClick={onExportExcel}
            disabled={activeSeries.length === 0 || isExportingExcel}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{isExportingExcel ? 'Generando...' : 'Exportar Excel'}</span>
          </button>
        </div>
      </div>

      {/* Second row: Mode-specific controls & Timeframe */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Left side: Timeframe & Dates */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-md">
            {(['1M', '3M', '6M', '1Y', '5Y', 'Max'] as TimeframeOption[]).map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => onChangeTimeframe(tf)}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                  timeframe === tf
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
            <span className="text-[11px]">Desde:</span>
            <input
              type="date"
              value={customStart}
              onChange={(e) => onChangeCustomDates(e.target.value, customEnd)}
              className="px-2 py-1 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-slate-800 dark:text-slate-200"
            />
            <span className="text-[11px]">Hasta:</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => onChangeCustomDates(customStart, e.target.value)}
              className="px-2 py-1 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-slate-800 dark:text-slate-200"
            />
          </div>
        </div>

        {/* Right side: Expression mode or Correlation params */}
        {viewMode === 'normalized' ? (
          <div className="flex flex-wrap items-center gap-3">
            {/* Expression mode segmented selector */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-md text-xs">
              <button
                type="button"
                onClick={() => handleModeChange('original')}
                className={`px-2.5 py-1 rounded transition-colors ${
                  activeMode === 'original'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 font-medium shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Unidad original
              </button>
              <button
                type="button"
                onClick={() => handleModeChange('base100')}
                className={`px-2.5 py-1 rounded transition-colors ${
                  activeMode === 'base100'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 font-medium shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Base 100 (t₀ = 100)
              </button>
              <button
                type="button"
                onClick={() => handleModeChange('mom')}
                className={`px-2.5 py-1 rounded transition-colors ${
                  activeMode === 'mom'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 font-medium shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Variación intermensual (MoM %)
              </button>
              <button
                type="button"
                onClick={() => handleModeChange('yoy')}
                className={`px-2.5 py-1 rounded transition-colors ${
                  activeMode === 'yoy'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 font-medium shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Variación interanual (YoY %)
              </button>
            </div>

            {/* Scale mode toggle */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-md text-xs">
              <button
                type="button"
                onClick={() => onChangeScaleMode?.('auto')}
                className={`px-2.5 py-1 rounded transition-colors ${
                  scaleMode === 'auto'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 font-medium shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
                title="Ajuste automático (zoom a variación)"
              >
                Ajuste automático (zoom a variación)
              </button>
              <button
                type="button"
                onClick={() => onChangeScaleMode?.('zero')}
                className={`px-2.5 py-1 rounded transition-colors ${
                  scaleMode === 'zero'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 font-medium shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
                title="Origen en cero (0)"
              >
                Origen en cero (0)
              </button>
            </div>

            {/* Real terms inflation switch */}
            <label
              className={`flex items-center gap-2 cursor-pointer text-xs select-none ${
                !hasArsSeries ? 'opacity-60 cursor-not-allowed' : ''
              }`}
              title={
                hasArsSeries
                  ? 'Deflactar series monetarias en pesos usando el IPC oficial'
                  : 'Esta serie no requiere deflactación'
              }
            >
              <input
                type="checkbox"
                checked={adjustInflation}
                disabled={!hasArsSeries}
                onChange={(e) => onToggleAdjustInflation(e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
              />
              <span className="text-slate-700 dark:text-slate-300 font-medium">
                Ajustar por inflación (términos reales)
              </span>
            </label>
          </div>
        ) : (
          /* Correlation controls */
          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            {/* Series A */}
            <div className="flex items-center gap-1">
              <span className="text-slate-500 font-medium">Serie A:</span>
              <select
                value={seriesA}
                onChange={(e) => onChangeSeriesA(e.target.value)}
                className="px-2 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-slate-800 dark:text-slate-200 text-xs font-medium max-w-[140px] truncate"
              >
                {activeSeries.map((s) => (
                  <option key={s.id} value={s.id}>
                    [{s.source}] {s.name}
                  </option>
                ))}
              </select>
            </div>

            <ArrowRightLeft className="w-3.5 h-3.5 text-slate-400" />

            {/* Series B */}
            <div className="flex items-center gap-1">
              <span className="text-slate-500 font-medium">Serie B:</span>
              <select
                value={seriesB}
                onChange={(e) => onChangeSeriesB(e.target.value)}
                className="px-2 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-slate-800 dark:text-slate-200 text-xs font-medium max-w-[140px] truncate"
              >
                {activeSeries.map((s) => (
                  <option key={s.id} value={s.id}>
                    [{s.source}] {s.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Window selector */}
            <div className="flex items-center gap-1 ml-1">
              <span className="text-slate-500 font-medium">Ventana:</span>
              <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-md">
                {([30, 90, 180] as const).map((win) => (
                  <button
                    key={win}
                    type="button"
                    onClick={() => onChangeCorrelationWindow(win)}
                    className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
                      correlationWindow === win
                        ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 font-medium shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    {win} días
                  </button>
                ))}
              </div>
            </div>

            {/* Downsample indicator if mixed frequencies */}
            {isDownsampled && (
              <span
                className="text-[10px] bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 px-1.5 py-0.5 rounded whitespace-nowrap"
                title="Consolidación mensual automática aplicada debido a frecuencias heterogéneas"
              >
                Armonización mensual automática
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
