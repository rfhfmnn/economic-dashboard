import React from 'react'

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
  active?: boolean
  onClick?: () => void
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  date,
  category,
  unit,
  trend,
  active = false,
  onClick,
}) => {
  const formattedValue = typeof value === 'number' ? value.toLocaleString('es-AR') : value

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
        <span className="text-xs font-medium text-slate-400 line-clamp-2">{title}</span>
        {category && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 shrink-0">
            {category}
          </span>
        )}
      </div>

      <div className="mt-3">
        <div className="flex items-baseline gap-1.5">
          <span className="text-xl sm:text-2xl font-bold text-slate-100 font-mono tracking-tight tabular-nums">
            {formattedValue}
          </span>
          {unit && <span className="text-xs font-mono text-slate-400">{unit}</span>}
        </div>

        <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 font-mono">
          {date && <span>{date}</span>}
          {trend && (
            <span className={trend.isPositive ? 'text-emerald-400' : 'text-rose-400'}>
              {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value).toFixed(2)}%
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
