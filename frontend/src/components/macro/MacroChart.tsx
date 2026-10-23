import React, { useMemo, useState } from 'react'
import { Calendar } from 'lucide-react'
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

export type Timeframe = '1M' | '3M' | '6M' | '1Y' | '5Y' | 'Max' | 'Custom'

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
  customStartDate?: string
  customEndDate?: string
  onCustomDateChange?: (start: string, end: string) => void
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
  customStartDate: propStartDate,
  customEndDate: propEndDate,
  onCustomDateChange,
}) => {
  const [internalStartDate, setInternalStartDate] = useState<string>('')
  const [internalEndDate, setInternalEndDate] = useState<string>('')
  const [showCustomPicker, setShowCustomPicker] = useState<boolean>(false)

  const startDate = propStartDate !== undefined ? propStartDate : internalStartDate
  const endDate = propEndDate !== undefined ? propEndDate : internalEndDate

  const handleStartDateChange = (val: string) => {
    setInternalStartDate(val)
    if (onCustomDateChange) onCustomDateChange(val, endDate)
  }

  const handleEndDateChange = (val: string) => {
    setInternalEndDate(val)
    if (onCustomDateChange) onCustomDateChange(startDate, val)
  }
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

    // Filter by timeframe or custom range
    if (merged.length === 0) return merged

    if (timeframe === 'Custom') {
      const filtered = merged.filter((item) => {
        if (startDate && item.fecha < startDate) return false
        if (endDate && item.fecha > endDate) return false
        return true
      })
      return filtered.length > 0 ? filtered : merged
    }

    if (timeframe === 'Max') return merged

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
  }, [effectiveSeries, timeframe, startDate, endDate])

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

        {/* Timeframe pill switcher with Personalizado */}
        <div className="inline-flex rounded-lg border border-slate-800 bg-slate-950 p-0.5 self-start sm:self-auto flex-wrap">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              onClick={() => {
                setShowCustomPicker(false)
                onTimeframeChange(tf)
              }}
              className={`px-2.5 py-1 text-xs font-mono rounded transition-colors cursor-pointer ${
                timeframe === tf && !showCustomPicker
                  ? 'bg-blue-600 text-white font-medium shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              {tf}
            </button>
          ))}
          <button
            onClick={() => {
              const next = !showCustomPicker
              setShowCustomPicker(next)
              if (next) onTimeframeChange('Custom')
            }}
            className={`px-2.5 py-1 text-xs font-mono rounded transition-colors inline-flex items-center gap-1.5 cursor-pointer ${
              timeframe === 'Custom' || showCustomPicker
                ? 'bg-blue-600 text-white font-medium shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
            title="Seleccionar rango de fechas específico"
          >
            <Calendar className="w-3 h-3" />
            <span>Personalizado</span>
          </button>
        </div>
      </div>

      {/* Expandable Custom Date Range Selector Toolbar */}
      {(showCustomPicker || timeframe === 'Custom') && (
        <div className="mb-4 p-3 rounded-lg bg-slate-950/80 border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 font-mono">
              <span className="text-slate-400 text-xs">Desde:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  handleStartDateChange(e.target.value)
                  if (timeframe !== 'Custom') onTimeframeChange('Custom')
                }}
                className="bg-slate-900 border border-slate-700 text-slate-100 px-2 py-1 rounded text-xs focus:outline-none focus:border-blue-500 font-mono transition-colors"
              />
            </div>
            <div className="flex items-center gap-2 font-mono">
              <span className="text-slate-400 text-xs">Hasta:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  handleEndDateChange(e.target.value)
                  if (timeframe !== 'Custom') onTimeframeChange('Custom')
                }}
                className="bg-slate-900 border border-slate-700 text-slate-100 px-2 py-1 rounded text-xs focus:outline-none focus:border-blue-500 font-mono transition-colors"
              />
            </div>
            {(startDate || endDate) && (
              <button
                onClick={() => {
                  handleStartDateChange('')
                  handleEndDateChange('')
                }}
                className="text-[11px] text-blue-400 hover:text-blue-300 underline font-mono cursor-pointer"
              >
                Limpiar fechas
              </button>
            )}
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            {chartData.length.toLocaleString('es-AR')} observaciones en período
          </span>
        </div>
      )}

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
