import React, { useMemo } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts'
import type { MacroSeriesPoint } from '../../types'

export type Timeframe = '1M' | '3M' | '6M' | '1Y' | '5Y' | 'Max'

export interface ChartSeries {
  id: number | string
  title: string
  unit?: string
  data: MacroSeriesPoint[]
  axis: 'left' | 'right'
  color: string
  strokeDasharray?: string
}

export interface MacroChartProps {
  series?: ChartSeries[]
  primaryTitle?: string
  primaryData?: MacroSeriesPoint[]
  secondaryTitle?: string
  secondaryData?: MacroSeriesPoint[]
  timeframe: Timeframe
  onTimeframeChange: (tf: Timeframe) => void
  loading?: boolean
}

const TIMEFRAMES: Timeframe[] = ['1M', '3M', '6M', '1Y', '5Y', 'Max']

export const MacroChart: React.FC<MacroChartProps> = ({
  series,
  primaryTitle,
  primaryData,
  secondaryTitle,
  secondaryData,
  timeframe,
  onTimeframeChange,
  loading = false,
}) => {
  // Normalize series: either use passed multi-series or fall back to primaryData/secondaryData
  const effectiveSeries = useMemo<ChartSeries[]>(() => {
    if (series && series.length > 0) {
      return series
    }
    const result: ChartSeries[] = []
    if (primaryData && primaryData.length > 0) {
      result.push({
        id: 'primary',
        title: primaryTitle || 'Variable Principal',
        data: primaryData,
        axis: 'left',
        color: '#3b82f6',
      })
    }
    if (secondaryData && secondaryData.length > 0) {
      result.push({
        id: 'secondary',
        title: secondaryTitle || 'Variable Dual',
        data: secondaryData,
        axis: 'right',
        color: '#8b5cf6',
        strokeDasharray: '4 4',
      })
    }
    return result
  }, [series, primaryTitle, primaryData, secondaryTitle, secondaryData])

  // Merge series by date
  const chartData = useMemo(() => {
    if (effectiveSeries.length === 0) return []

    const map = new Map<string, { fecha: string; [key: string]: any }>()

    effectiveSeries.forEach((s) => {
      const key = `var_${s.id}`
      s.data.forEach((p) => {
        const existing = map.get(p.fecha)
        if (existing) {
          existing[key] = p.valor
        } else {
          map.set(p.fecha, { fecha: p.fecha, [key]: p.valor })
        }
      })
    })

    const merged = Array.from(map.values())
    merged.sort((a, b) => a.fecha.localeCompare(b.fecha))

    // Filter by timeframe
    if (timeframe === 'Max' || merged.length === 0) return merged

    const latest = new Date(merged[merged.length - 1].fecha)
    let cutoff = new Date(latest)

    if (timeframe === '1M') cutoff.setMonth(latest.getMonth() - 1)
    else if (timeframe === '3M') cutoff.setMonth(latest.getMonth() - 3)
    else if (timeframe === '6M') cutoff.setMonth(latest.getMonth() - 6)
    else if (timeframe === '1Y') cutoff.setFullYear(latest.getFullYear() - 1)
    else if (timeframe === '5Y') cutoff.setFullYear(latest.getFullYear() - 5)

    const cutoffStr = cutoff.toISOString().split('T')[0]
    const filtered = merged.filter((item) => item.fecha >= cutoffStr)
    return filtered.length > 0 ? filtered : merged
  }, [effectiveSeries, timeframe])

  const leftSeries = effectiveSeries.filter((s) => s.axis === 'left')
  const rightSeries = effectiveSeries.filter((s) => s.axis === 'right')
  const hasRightAxis = rightSeries.length > 0

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 sm:p-5 flex flex-col justify-between">
      {/* Header controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap text-sm font-semibold text-slate-100">
            {leftSeries.length > 0 ? (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-mono uppercase tracking-wider text-blue-400 bg-blue-950/60 px-1.5 py-0.5 rounded border border-blue-800/60">
                  Principal
                </span>
                {leftSeries.map((s, idx) => (
                  <span key={s.id} className="inline-flex items-center gap-1.5 text-slate-200 text-xs sm:text-sm font-medium">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                    <span>{s.title}</span>
                    {s.unit && (
                      <span className="text-[10px] font-mono text-slate-400 bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-700/60">
                        {s.unit}
                      </span>
                    )}
                    {idx < leftSeries.length - 1 && <span className="text-slate-600 font-mono">/</span>}
                  </span>
                ))}
              </div>
            ) : (
              <span>{primaryTitle || 'Monitor Macroeconómico'}</span>
            )}

            {rightSeries.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-slate-500 font-normal text-xs">vs</span>
                <span className="text-[10px] font-mono uppercase tracking-wider text-indigo-400 bg-indigo-950/60 px-1.5 py-0.5 rounded border border-indigo-800/60">
                  Dual
                </span>
                {rightSeries.map((s, idx) => (
                  <span key={s.id} className="inline-flex items-center gap-1.5 text-indigo-300 text-xs sm:text-sm font-medium">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                    <span>{s.title}</span>
                    {s.unit && (
                      <span className="text-[10px] font-mono text-indigo-400/80 bg-indigo-950/60 px-1.5 py-0.5 rounded border border-indigo-800/60">
                        {s.unit}
                      </span>
                    )}
                    {idx < rightSeries.length - 1 && <span className="text-slate-600 font-mono">/</span>}
                  </span>
                ))}
              </div>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Evolución histórica y comparación temporal multi-variable de series BCRA
          </p>
        </div>

        {/* Timeframe pill switcher */}
        <div className="inline-flex rounded-lg border border-slate-800 bg-slate-950 p-0.5 self-start sm:self-auto">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              onClick={() => onTimeframeChange(tf)}
              className={`px-2.5 py-1 text-xs font-mono rounded transition-colors ${
                timeframe === tf
                  ? 'bg-blue-600 text-white font-medium shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="h-72 sm:h-80 w-full relative">
        {loading && (
          <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm z-10 flex items-center justify-center">
            <span className="text-xs text-blue-400 font-mono animate-pulse">Cargando serie temporal...</span>
          </div>
        )}

        {chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-slate-500 font-mono">
            Sin observaciones disponibles para las variables seleccionadas.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis
                dataKey="fecha"
                stroke="#64748b"
                fontSize={11}
                tickLine={false}
                tickFormatter={(val) => {
                  if (timeframe === '1M' || timeframe === '3M') return val.slice(5)
                  return val.slice(0, 7)
                }}
              />
              <YAxis
                yAxisId="left"
                stroke="#64748b"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                domain={['auto', 'auto']}
                tickFormatter={(val) => {
                  if (Math.abs(val) >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`
                  if (Math.abs(val) >= 1_000) return `${(val / 1_000).toFixed(0)}k`
                  return val
                }}
              />
              {hasRightAxis && (
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  stroke="#818cf8"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  domain={['auto', 'auto']}
                  tickFormatter={(val) => {
                    if (Math.abs(val) >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`
                    if (Math.abs(val) >= 1_000) return `${(val / 1_000).toFixed(0)}k`
                    return val
                  }}
                />
              )}
              <Tooltip
                contentStyle={{
                  backgroundColor: '#090d16',
                  borderColor: '#334155',
                  borderRadius: '0.5rem',
                  fontSize: '12px',
                  color: '#f8fafc',
                }}
                formatter={(val: any, name: any) => {
                  const s = effectiveSeries.find(
                    (item) => item.title === name || `var_${item.id}` === name || String(item.id) === String(name)
                  )
                  const displayName = s
                    ? `${s.title} (${s.axis === 'left' ? 'Principal' : 'Dual'})`
                    : (name === 'primary' ? (primaryTitle || 'Principal') : (secondaryTitle || 'Dual'))
                  const unitSuffix = s?.unit ? ` ${s.unit}` : ''
                  return [
                    typeof val === 'number' ? `${val.toLocaleString('es-AR')}${unitSuffix}` : val,
                    displayName,
                  ]
                }}
                labelFormatter={(label) => `Fecha: ${label}`}
              />
              <Legend
                verticalAlign="top"
                align="right"
                wrapperStyle={{ paddingBottom: '12px', fontSize: '12px' }}
                formatter={(value: any) => {
                  const s = effectiveSeries.find(
                    (item) => item.title === value || `var_${item.id}` === value || String(item.id) === String(value)
                  )
                  const title = s ? s.title : (value === 'primary' ? (primaryTitle || 'Principal') : (secondaryTitle || 'Dual'))
                  const axisLabel = s?.axis === 'right' ? 'Dual' : 'Principal'
                  return (
                    <span className="inline-flex items-center gap-1.5 text-slate-200 font-medium mr-2">
                      <span>{title}</span>
                      {s?.unit && (
                        <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/40 px-1 py-0.2 rounded border border-emerald-800/30">
                          {s.unit}
                        </span>
                      )}
                      <span className="text-[10px] font-mono text-slate-400">
                        ({axisLabel})
                      </span>
                    </span>
                  )
                }}
              />
              {effectiveSeries.map((s) => (
                <Line
                  key={s.id}
                  yAxisId={s.axis}
                  type="monotone"
                  dataKey={`var_${s.id}`}
                  name={s.title}
                  stroke={s.color}
                  strokeWidth={2}
                  strokeDasharray={s.strokeDasharray || (s.axis === 'right' ? '4 4' : undefined)}
                  dot={false}
                  activeDot={{ r: 4, stroke: s.color, strokeWidth: 2 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
