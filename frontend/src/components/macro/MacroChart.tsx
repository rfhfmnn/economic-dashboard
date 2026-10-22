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

export interface MacroChartProps {
  primaryTitle: string
  primaryData: MacroSeriesPoint[]
  secondaryTitle?: string
  secondaryData?: MacroSeriesPoint[]
  timeframe: Timeframe
  onTimeframeChange: (tf: Timeframe) => void
  loading?: boolean
}

const TIMEFRAMES: Timeframe[] = ['1M', '3M', '6M', '1Y', '5Y', 'Max']

export const MacroChart: React.FC<MacroChartProps> = ({
  primaryTitle,
  primaryData,
  secondaryTitle,
  secondaryData,
  timeframe,
  onTimeframeChange,
  loading = false,
}) => {
  // Merge series by date
  const chartData = useMemo(() => {
    if (!primaryData || primaryData.length === 0) return []

    const map = new Map<string, { fecha: string; primary?: number; secondary?: number }>()

    primaryData.forEach((p) => {
      map.set(p.fecha, { fecha: p.fecha, primary: p.valor })
    })

    if (secondaryData && secondaryData.length > 0) {
      secondaryData.forEach((s) => {
        const existing = map.get(s.fecha)
        if (existing) {
          existing.secondary = s.valor
        } else {
          map.set(s.fecha, { fecha: s.fecha, secondary: s.valor })
        }
      })
    }

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
  }, [primaryData, secondaryData, timeframe])

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 sm:p-5 flex flex-col justify-between">
      {/* Header controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <span>{primaryTitle}</span>
            {secondaryTitle && (
              <>
                <span className="text-slate-500">vs</span>
                <span className="text-indigo-400">{secondaryTitle}</span>
              </>
            )}
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Evolución histórica y comparación temporal de variables macroeconómicas BCRA
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
            Sin observaciones disponibles para el rango seleccionado.
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
              {secondaryTitle && (
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
                formatter={(val: any, name: any) => [
                  typeof val === 'number' ? val.toLocaleString('es-AR') : val,
                  name === 'primary' ? primaryTitle : secondaryTitle || name,
                ]}
                labelFormatter={(label) => `Fecha: ${label}`}
              />
              <Legend
                verticalAlign="top"
                align="right"
                wrapperStyle={{ paddingBottom: '10px', fontSize: '11px' }}
                formatter={(value) => (value === 'primary' ? primaryTitle : secondaryTitle || value)}
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="primary"
                name="primary"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, stroke: '#60a5fa', strokeWidth: 2 }}
              />
              {secondaryTitle && (
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="secondary"
                  name="secondary"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={false}
                  activeDot={{ r: 4, stroke: '#c084fc', strokeWidth: 2 }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
