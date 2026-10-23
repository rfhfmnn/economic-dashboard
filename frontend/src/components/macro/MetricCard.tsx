import React from 'react'
import { formatGrammaticalTitle, isInflationMetric } from '../../utils/formatters'

export interface MetricCardProps {
  title: string
  value: number | string
  date?: string
  category?: string
  unit?: string
  trend?: {
    value: number
    isPositive: boolean
  }
  momDelta?: number
  yoyDelta?: number
  recentPoints?: number[]
  active?: boolean
  onClick?: () => void
}

const Sparkline: React.FC<{ points: number[]; isPositive: boolean; active: boolean }> = ({
  points,
  isPositive,
  active,
}) => {
  if (!points || points.length < 2) return null
  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = max - min || 1
  const width = 64
  const height = 20
  const pad = 2

  const coords = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * width
      const y = height - pad - ((p - min) / range) * (height - 2 * pad)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  const strokeColor = active ? '#60a5fa' : isPositive ? '#10b981' : '#f43f5e'

  return (
    <svg className="w-16 h-5 overflow-visible" viewBox={`0 0 ${width} ${height}`}>
      <polyline
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={coords}
      />
    </svg>
  )
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  date,
  category,
  unit,
  trend,
  momDelta,
  yoyDelta,
  recentPoints,
  active = false,
  onClick,
}) => {
  const displayTitle = formatGrammaticalTitle(title)
  const formattedValue = typeof value === 'number' ? value.toLocaleString('es-AR') : value

  // Inflation metrics are already rates of variation, so omit MoM and YoY
  const isInflation = isInflationMetric(undefined, title)
  const effectiveMomDelta = isInflation ? undefined : momDelta
  const effectiveYoyDelta = isInflation ? undefined : yoyDelta

  const isPositiveTrend =
    effectiveMomDelta !== undefined
      ? effectiveMomDelta >= 0
      : trend?.isPositive ??
        (recentPoints && recentPoints.length >= 2
          ? recentPoints[recentPoints.length - 1] >= recentPoints[0]
          : true)

  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={`rounded-lg border p-4 transition-all text-left flex flex-col justify-between ${
        active
          ? 'bg-blue-950/20 border-blue-500 shadow-sm ring-1 ring-blue-500/30'
          : 'bg-slate-900/50 border-slate-800 hover:border-slate-700 hover:bg-slate-900/80'
      } ${onClick ? 'cursor-pointer' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium text-slate-400 line-clamp-2">{displayTitle}</span>
        {category && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 shrink-0">
            {category}
          </span>
        )}
      </div>

      <div className="mt-3">
        <div className="flex items-baseline justify-between gap-1.5">
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl sm:text-2xl font-bold text-slate-100 font-mono tracking-tight tabular-nums">
              {formattedValue}
            </span>
            {unit && <span className="text-xs font-mono text-slate-400">{unit}</span>}
          </div>
          {recentPoints && recentPoints.length >= 2 && (
            <div className="shrink-0" title="Tendencia últimos 30 días">
              <Sparkline
                points={recentPoints}
                isPositive={isPositiveTrend}
                active={active}
              />
            </div>
          )}
        </div>

        <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-500 font-mono">
          {date && <span>{date}</span>}

          <div className="flex items-center gap-2">
            {effectiveMomDelta !== undefined ? (
              <span
                className={`flex items-center gap-0.5 font-semibold ${
                  effectiveMomDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                <span>{effectiveMomDelta >= 0 ? '↑' : '↓'}</span>
                <span>{Math.abs(effectiveMomDelta).toFixed(1)}% MoM</span>
              </span>
            ) : trend ? (
              <span className={trend.isPositive ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value).toFixed(2)}%
              </span>
            ) : null}

            {effectiveYoyDelta !== undefined && (
              <span className="text-slate-400 text-[10px]" title="Variación interanual (YoY)">
                ({effectiveYoyDelta >= 0 ? '+' : ''}{effectiveYoyDelta.toFixed(1)}% YoY)
              </span>
            )}
          </div>
        </div>

        {active && (
          <div className="mt-2 pt-1.5 border-t border-blue-500/20 flex items-center gap-1.5 text-[10px] text-blue-400 font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            <span>En gráfico principal</span>
          </div>
        )}
      </div>
    </div>
  )
}

