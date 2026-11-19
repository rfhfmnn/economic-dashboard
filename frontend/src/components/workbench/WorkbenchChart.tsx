import React, { useMemo } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts'
import { AlertTriangle } from 'lucide-react'
import type {
  WorkbenchSeriesData,
  RollingCorrelationPoint,
  WorkbenchScaleMode,
  Periodicity,
} from '../../types'
import type { AlignedPoint } from '../../utils/alignment'
import type { ExpressionMode } from '../../utils/transforms'

export type ScaleMode = WorkbenchScaleMode

export interface WorkbenchChartProps {
  viewMode: 'normalized' | 'correlation'
  expressionMode?: ExpressionMode
  normalization?: 'base100' | 'percent' | ExpressionMode
  alignedData: AlignedPoint[]
  activeSeries: WorkbenchSeriesData[]
  // Correlation mode data
  correlationPoints: RollingCorrelationPoint[]
  seriesAName?: string
  seriesBName?: string
  scaleMode?: ScaleMode
  lineStyle?: 'monotone' | 'step'
  periodicity?: Periodicity
}

/**
 * Formats a canonical ISO or period date string based on active periodicity.
 * E.g. '2026-01-31' -> '2026-01' in monthly mode; '2026-03-31' -> '2026-Q1' in quarterly mode.
 */
export function formatPeriodDate(dateStr?: string | null, periodicity?: Periodicity): string {
  if (!dateStr) return ''
  const clean = String(dateStr).slice(0, 10)
  if (periodicity === 'mensual') {
    return clean.slice(0, 7)
  }
  if (periodicity === 'trimestral') {
    if (clean.includes('-Q')) return clean
    const month = parseInt(clean.slice(5, 7), 10)
    if (!isNaN(month) && month >= 1 && month <= 12) {
      const q = Math.ceil(month / 3)
      return `${clean.slice(0, 4)}-Q${q}`
    }
    return clean.slice(0, 7)
  }
  return clean
}

/**
 * Calculates dynamic Y-axis domain based on visible values and scale mode.
 * - 'auto' mode adds 5% padding to [min, max] so slight variations are not flattened.
 * - 'zero' mode forces 0 as baseline.
 */
export function calculateDomain(
  data: AlignedPoint[],
  keys: string[],
  scaleMode: ScaleMode = 'auto'
): [number | string, number | string] {
  let min = Infinity
  let max = -Infinity
  let count = 0

  for (const row of data) {
    for (const key of keys) {
      const val = row[key]
      if (val !== null && val !== undefined && typeof val === 'number' && !isNaN(val)) {
        if (val < min) min = val
        if (val > max) max = val
        count++
      }
    }
  }

  if (count === 0 || !isFinite(min) || !isFinite(max)) {
    return scaleMode === 'zero' ? [0, 'auto'] : ['auto', 'auto']
  }

  if (scaleMode === 'zero') {
    if (min >= 0) {
      return [0, 'auto']
    }
    return [Math.min(0, min), 'auto']
  }

  // scaleMode === 'auto'
  const range = max - min
  const pad = range > 0 ? range * 0.05 : (Math.abs(min) * 0.05 || 1)
  return [min - pad, max + pad]
}

export interface WorkbenchChartTooltipProps {
  active?: boolean
  payload?: any[]
  label?: string
  activeSeries: WorkbenchSeriesData[]
  mode: ExpressionMode
  periodicity?: Periodicity
}

export const WorkbenchChartTooltip: React.FC<WorkbenchChartTooltipProps> = ({
  active,
  payload,
  label,
  activeSeries,
  mode,
  periodicity,
}) => {
  if (!active || !payload || payload.length === 0) return null

  const seenSeries = new Set<string>()
  const items: any[] = []
  for (const item of payload) {
    const sId = String(item.dataKey || item.name || '').replace('_hist', '').replace('_forecast', '')
    if (!seenSeries.has(sId)) {
      seenSeries.add(sId)
      items.push({ ...item, cleanSeriesId: sId })
    }
  }

  return (
    <div
      data-testid="workbench-chart-tooltip"
      className="bg-slate-900/95 border border-slate-700 rounded-md p-2.5 text-xs text-slate-100 shadow-lg min-w-[200px]"
    >
      <div className="font-medium text-slate-400 mb-1.5 pb-1 border-b border-slate-800">
        Fecha: {formatPeriodDate(String(label), periodicity)}
      </div>
      <div className="space-y-1.5">
        {items.map((item) => {
          const s = activeSeries.find((x) => x.id === item.cleanSeriesId)
          const isForecastPoint =
            s?.source === 'REM' &&
            s?.points?.some((p) => p.fecha === label && p.is_forecast)
          const num = Number(item.value)
          let formattedVal = ''
          if (item.value === null || item.value === undefined || isNaN(num)) {
            formattedVal = 'N/A'
          } else if (mode === 'mom' || mode === 'yoy') {
            formattedVal = `${num > 0 ? '+' : ''}${num.toFixed(2)}%`
          } else if (mode === 'base100') {
            formattedVal = num.toFixed(2)
          } else {
            const unitStr = s?.unit ? ` ${s.unit}` : ''
            formattedVal = `${num.toLocaleString('es-AR', { maximumFractionDigits: 2 })}${unitStr}`
          }

          return (
            <div key={item.cleanSeriesId} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: s?.color || item.color }}
                />
                <span className="font-medium">
                  [{s?.source || 'Serie'}] {s?.name || item.cleanSeriesId}
                </span>
                {isForecastPoint && (
                  <span
                    data-testid="forecast-badge"
                    className="px-1.5 py-0.5 text-[10px] font-medium bg-amber-500/20 text-amber-300 rounded border border-amber-500/30 shrink-0"
                  >
                    Proyección REM
                  </span>
                )}
              </div>
              <span className="font-mono font-semibold tabular-nums text-slate-200">
                {formattedVal}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}


export const WorkbenchChart: React.FC<WorkbenchChartProps> = ({
  viewMode,
  expressionMode,
  normalization,
  alignedData,
  activeSeries,
  correlationPoints,
  seriesAName,
  seriesBName,
  scaleMode = 'auto',
  lineStyle = 'monotone',
  periodicity = 'original',
}) => {
  const mode: ExpressionMode =
    expressionMode ??
    (normalization === 'percent'
      ? 'mom'
      : normalization === 'original' ||
        normalization === 'base100' ||
        normalization === 'mom' ||
        normalization === 'yoy'
      ? normalization
      : 'base100')

  // Check unique units across active series
  const uniqueUnits = useMemo(() => {
    return Array.from(new Set(activeSeries.map((s) => (s.unit || '').trim().toLowerCase())))
  }, [activeSeries])

  // Dual-axis condition: exactly 2 series in original unit mode with distinct units
  const isDualAxis =
    viewMode === 'normalized' &&
    mode === 'original' &&
    activeSeries.length === 2 &&
    (activeSeries[0].unit || '').trim().toLowerCase() !==
      (activeSeries[1].unit || '').trim().toLowerCase()

  // Heterogeneous units warning: 3+ series in original unit mode with disparate units
  const hasHeterogeneousUnits =
    viewMode === 'normalized' &&
    mode === 'original' &&
    activeSeries.length >= 3 &&
    uniqueUnits.length > 1

  const series1 = activeSeries[0]
  const series2 = activeSeries[1]

  const leftDomain = useMemo(() => {
    if (!isDualAxis || !series1) return undefined
    return calculateDomain(alignedData, [series1.id], scaleMode)
  }, [isDualAxis, alignedData, series1, scaleMode])

  const rightDomain = useMemo(() => {
    if (!isDualAxis || !series2) return undefined
    return calculateDomain(alignedData, [series2.id], scaleMode)
  }, [isDualAxis, alignedData, series2, scaleMode])

  const singleDomain = useMemo(() => {
    if (isDualAxis) return undefined
    return calculateDomain(alignedData, activeSeries.map((s) => s.id), scaleMode)
  }, [isDualAxis, alignedData, activeSeries, scaleMode])

  // Split REM series with forecast points into historical and forecast keys for dashed projection styling
  const chartData = useMemo(() => {
    const hasRemForecast = activeSeries.some(
      (s) => s.source === 'REM' && s.points.some((p) => p.is_forecast)
    )
    if (!hasRemForecast) return alignedData

    return alignedData.map((row) => {
      const newRow: AlignedPoint = { ...row }
      for (const s of activeSeries) {
        if (s.source === 'REM') {
          const forecastDates = new Set(
            s.points.filter((p) => p.is_forecast).map((p) => p.fecha)
          )
          const lastHistorical = [...s.points]
            .reverse()
            .find((p) => !p.is_forecast)?.fecha

          const date = row.fecha
          const val = row[s.id]

          if (val !== null && val !== undefined) {
            // Historical segment: include all historical dates plus bridge at last historical date
            if (!forecastDates.has(date)) {
              newRow[`${s.id}_hist`] = val
            }
            // Forecast segment: include all forecast dates plus bridge at last historical date
            if (forecastDates.has(date) || (lastHistorical && date === lastHistorical)) {
              newRow[`${s.id}_forecast`] = val
            }
          }
        }
      }
      return newRow
    })
  }, [alignedData, activeSeries])

  if (activeSeries.length === 0) {
    return (
      <div className="flex items-center justify-center h-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-400 text-sm">
        No hay series activas seleccionadas en la mesa de trabajo.
      </div>
    )
  }

  if (viewMode === 'correlation') {
    // Rolling correlation chart
    const validPoints = correlationPoints.filter((p) => p.r !== null)
    if (correlationPoints.length === 0 || validPoints.length === 0) {
      return (
        <div className="flex items-center justify-center h-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-400 text-sm">
          No hay suficientes observaciones coincidentes para calcular la correlación móvil en la ventana seleccionada.
        </div>
      )
    }

    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
        <div className="mb-3 flex items-center justify-between text-xs text-slate-500">
          <span>
            Correlación móvil de Pearson ({seriesAName || 'Serie A'} vs. {seriesBName || 'Serie B'})
          </span>
          <span className="font-mono text-[11px]">Rango: [-1.00, +1.00]</span>
        </div>

        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={correlationPoints} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.2} />
              <XAxis
                dataKey="fecha"
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickLine={false}
                axisLine={{ stroke: '#cbd5e1' }}
                tickFormatter={(val) => formatPeriodDate(String(val), periodicity)}
              />
              <YAxis
                domain={[-1.0, 1.0]}
                ticks={[-1.0, -0.5, 0, 0.5, 1.0]}
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickFormatter={(val) => val.toFixed(2)}
                tickLine={false}
                axisLine={{ stroke: '#cbd5e1' }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(15, 23, 42, 0.95)',
                  borderColor: '#334155',
                  borderRadius: '0.375rem',
                  fontSize: '12px',
                  color: '#f8fafc',
                }}
                formatter={(value: any) => [
                  value !== null && value !== undefined ? Number(value).toFixed(4) : 'N/A',
                  'Coeficiente r',
                ]}
                labelFormatter={(label) => `Fecha: ${formatPeriodDate(String(label), periodicity)}`}
              />
              <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3" />
              <ReferenceLine y={0.5} stroke="#10b981" strokeDasharray="2 2" opacity={0.5} />
              <ReferenceLine y={-0.5} stroke="#f43f5e" strokeDasharray="2 2" opacity={0.5} />
              <Line
                type="monotone"
                dataKey="r"
                stroke="#2563eb"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    )
  }

  // Normalized / analytical expression time-series mode
  const getModeTitle = () => {
    switch (mode) {
      case 'original':
        return 'Valores en unidad original'
      case 'base100':
        return 'Índice de base 100 dinámico (t₀ = 100)'
      case 'mom':
        return 'Variación intermensual (MoM %)'
      case 'yoy':
        return 'Variación interanual (YoY %)'
    }
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
      {/* Informative warning banner when 3+ series have heterogeneous units in original unit mode */}
      {hasHeterogeneousUnits && (
        <div
          role="alert"
          className="mb-3 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-300"
        >
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Unidades heterogéneas en escala original</p>
            <p className="text-amber-700 dark:text-amber-400 mt-0.5">
              Se detectaron 3 o más series con unidades distintas. Se recomienda utilizar el modo base 100 o variación porcentual para evitar ambigüedad de escala.
            </p>
          </div>
        </div>
      )}

      {/* Header row: mode title and observations */}
      <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
        <span>{getModeTitle()}</span>
        <span className="font-mono text-[11px]">
          {alignedData.length} observaciones cronológicas
        </span>
      </div>

      {/* Dual Y-axis visual legend when 2 series have different units */}
      {isDualAxis && (
        <div className="mb-3 flex flex-wrap items-center gap-4 text-xs font-medium">
          <div className="flex items-center gap-1.5" style={{ color: series1.color }}>
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: series1.color }} />
            <span>
              Eje izquierdo (Y₁): [{series1.source}] {series1.name}{' '}
              {series1.unit ? `(${series1.unit})` : ''}
            </span>
          </div>
          <div className="flex items-center gap-1.5" style={{ color: series2.color }}>
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: series2.color }} />
            <span>
              Eje derecho (Y₂): [{series2.source}] {series2.name}{' '}
              {series2.unit ? `(${series2.unit})` : ''}
            </span>
          </div>
        </div>
      )}

      <div className="h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 10, right: isDualAxis ? 30 : 20, left: 10, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.2} />
            <XAxis
              dataKey="fecha"
              tick={{ fontSize: 11, fill: '#64748b' }}
              tickLine={false}
              axisLine={{ stroke: '#cbd5e1' }}
              tickFormatter={(val) => formatPeriodDate(String(val), periodicity)}
            />

            {/* Left Y-axis (or single Y-axis) */}
            <YAxis
              yAxisId="left"
              orientation="left"
              domain={isDualAxis ? leftDomain : singleDomain}
              stroke={isDualAxis ? series1.color : '#cbd5e1'}
              tick={{ fontSize: 11, fill: isDualAxis ? series1.color : '#64748b' }}
              tickLine={isDualAxis ? { stroke: series1.color } : false}
              axisLine={{ stroke: isDualAxis ? series1.color : '#cbd5e1' }}
              tickFormatter={(val) => {
                if (typeof val !== 'number') return val
                if (mode === 'mom' || mode === 'yoy') {
                  return `${val > 0 ? '+' : ''}${Number(val).toFixed(1)}%`
                }
                if (mode === 'base100') {
                  return Number(val).toFixed(1)
                }
                if (Math.abs(val) >= 1_000_000) {
                  return `${(val / 1_000_000).toLocaleString('es-AR', { maximumFractionDigits: 1 })}M`
                }
                if (Math.abs(val) >= 10_000) {
                  return `${(val / 1_000).toLocaleString('es-AR', { maximumFractionDigits: 0 })}k`
                }
                return Number(val).toLocaleString('es-AR', { maximumFractionDigits: 1 })
              }}
              label={
                isDualAxis && series1?.unit
                  ? {
                      value: series1.unit,
                      angle: -90,
                      position: 'insideLeft',
                      offset: 10,
                      style: { textAnchor: 'middle', fill: series1.color, fontSize: 10 },
                    }
                  : undefined
              }
            />

            {/* Right Y-axis (only active in dual-axis mode) */}
            {isDualAxis && (
              <YAxis
                yAxisId="right"
                orientation="right"
                domain={rightDomain}
                stroke={series2.color}
                tick={{ fontSize: 11, fill: series2.color }}
                tickLine={{ stroke: series2.color }}
                axisLine={{ stroke: series2.color }}
                tickFormatter={(val) => {
                  if (typeof val !== 'number') return val
                  if (Math.abs(val) >= 1_000_000) {
                    return `${(val / 1_000_000).toLocaleString('es-AR', { maximumFractionDigits: 1 })}M`
                  }
                  if (Math.abs(val) >= 10_000) {
                    return `${(val / 1_000).toLocaleString('es-AR', { maximumFractionDigits: 0 })}k`
                  }
                  return Number(val).toLocaleString('es-AR', { maximumFractionDigits: 1 })
                }}
                label={
                  series2?.unit
                    ? {
                        value: series2.unit,
                        angle: 90,
                        position: 'insideRight',
                        offset: 10,
                        style: { textAnchor: 'middle', fill: series2.color, fontSize: 10 },
                      }
                    : undefined
                }
              />
            )}

            <Tooltip
              content={
                <WorkbenchChartTooltip
                  activeSeries={activeSeries}
                  mode={mode}
                  periodicity={periodicity}
                />
              }
              formatter={(value: any, name: any, entry: any) => {
                const sId = String(name || '').replace('_hist', '').replace('_forecast', '')
                const s = activeSeries.find((x) => x.id === sId)
                const pointDate = entry?.payload?.fecha
                const isRemForecast =
                  s?.source === 'REM' &&
                  s?.points?.some((p) => p.fecha === pointDate && p.is_forecast)
                const badge = isRemForecast ? ' (Proyección REM)' : ''
                const label = s ? `[${s.source}] ${s.name}${badge}` : name
                if (value === null || value === undefined || isNaN(value)) {
                  return ['N/A', label]
                }
                const num = Number(value)
                let formatted = ''
                if (mode === 'mom' || mode === 'yoy') {
                  formatted = `${num > 0 ? '+' : ''}${num.toFixed(2)}%`
                } else if (mode === 'base100') {
                  formatted = num.toFixed(2)
                } else {
                  const unitStr = s?.unit ? ` ${s.unit}` : ''
                  formatted = `${num.toLocaleString('es-AR', { maximumFractionDigits: 2 })}${unitStr}`
                }
                return [formatted, label]
              }}
              labelFormatter={(label) => `Fecha: ${formatPeriodDate(String(label), periodicity)}`}
            />
            {(mode === 'mom' || mode === 'yoy') && (
              <ReferenceLine yAxisId="left" y={0} stroke="#94a3b8" strokeDasharray="3 3" />
            )}
            {mode === 'base100' && (
              <ReferenceLine yAxisId="left" y={100} stroke="#94a3b8" strokeDasharray="3 3" />
            )}
            {activeSeries.map((s, idx) => {
              const yAxisId = isDualAxis ? (idx === 0 ? 'left' : 'right') : 'left'
              const isRem = s.source === 'REM'
              const hasForecast = isRem && s.points.some((p) => p.is_forecast)

              if (isRem && hasForecast) {
                return (
                  <React.Fragment key={s.id}>
                    {/* Historical observed segment (solid line) */}
                    <Line
                      yAxisId={yAxisId}
                      type={lineStyle === 'step' ? 'stepAfter' : 'monotone'}
                      dataKey={`${s.id}_hist`}
                      name={`${s.id}_hist`}
                      stroke={s.color}
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                      connectNulls={false}
                    />
                    {/* Forecast projection trajectory (dashed stroke) */}
                    <Line
                      yAxisId={yAxisId}
                      type={lineStyle === 'step' ? 'stepAfter' : 'monotone'}
                      dataKey={`${s.id}_forecast`}
                      name={`${s.id}_forecast`}
                      stroke={s.color}
                      strokeWidth={2}
                      strokeDasharray="4 4"
                      dot={false}
                      isAnimationActive={false}
                      connectNulls={false}
                    />
                  </React.Fragment>
                )
              }

              return (
                <Line
                  key={s.id}
                  yAxisId={yAxisId}
                  type={lineStyle === 'step' ? 'stepAfter' : 'monotone'}
                  dataKey={s.id}
                  name={s.id}
                  stroke={s.color}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                  connectNulls={true}
                />
              )
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
