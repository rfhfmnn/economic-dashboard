import React from 'react'
import { AlertTriangle } from 'lucide-react'
import { RemCohort } from '../../../types'

export interface RemMetricCardProps {
  title: string
  period: string
  value: number
  unit: string
  p25?: number
  p75?: number
  top10Divergence?: number
  divergenceFlag?: boolean
  cohort?: RemCohort
  icon?: React.ReactNode
}

export const RemMetricCard: React.FC<RemMetricCardProps> = ({
  title,
  period,
  value,
  unit,
  p25,
  p75,
  top10Divergence = 0,
  divergenceFlag = false,
  cohort = 'todos',
  icon,
}) => {
  // Format numeric display
  const isCurrency = unit.includes('$') || unit.toLowerCase().includes('usd')
  const formattedValue = isCurrency
    ? `$${value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `${value.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}${unit.includes('%') ? '%' : ''}`

  const formattedP25 = p25 !== undefined
    ? (isCurrency ? `$${p25.toFixed(0)}` : `${p25.toFixed(1)}${unit.includes('%') ? '%' : ''}`)
    : null
  const formattedP75 = p75 !== undefined
    ? (isCurrency ? `$${p75.toFixed(0)}` : `${p75.toFixed(1)}${unit.includes('%') ? '%' : ''}`)
    : null

  return (
    <div
      data-testid={`rem-metric-card-${title.toLowerCase().replace(/\s+/g, '-')}`}
      className="bg-slate-900/70 border border-slate-800/80 rounded-xl p-5 shadow-lg backdrop-blur-sm hover:border-slate-700/80 transition-all duration-200 flex flex-col justify-between"
    >
      <div>
        {/* Header: Title and Period Tag */}
        <div className="flex items-start justify-between gap-2 mb-2 min-h-[2.25rem]">
          <div className="flex items-start gap-2 min-w-0 flex-1">
            {icon && <span className="text-blue-400 flex-shrink-0 mt-0.5">{icon}</span>}
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider break-words leading-tight">
              {title}
            </span>
          </div>
          <span className="text-xs font-mono bg-slate-800/90 text-slate-300 px-2 py-0.5 rounded border border-slate-700/50 flex-shrink-0 mt-0.5">
            {period}
          </span>
        </div>

        {/* Primary Value */}
        <div className="flex items-baseline gap-2 mt-1">
          <span className="text-3xl font-bold font-mono tabular-nums text-slate-100 tracking-tight">
            {formattedValue}
          </span>
          <span className="text-xs font-mono text-slate-400">{unit}</span>
        </div>

        {/* Confidence Interquartile Band (P25 - P75) */}
        {formattedP25 && formattedP75 && (
          <div className="mt-3 flex items-center justify-between text-xs text-slate-400 bg-slate-950/40 px-2.5 py-1.5 rounded-lg border border-slate-800/60 font-mono">
            <span className="text-slate-400 text-[11px]">Rango intercuartil (P25 - P75):</span>
            <span className="text-slate-200 tabular-nums">
              {formattedP25} — {formattedP75}
            </span>
          </div>
        )}
      </div>

      {/* Footer: Cohort Comparison & Divergence Flag */}
      <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-xs">
        <span className="text-slate-400 text-[11px]">
          Muestra: <strong className="text-slate-300">{cohort === 'top_10' ? 'Top 10' : 'Consenso Total'}</strong>
        </span>

        {divergenceFlag ? (
          <div
            data-testid="top10-divergence-badge"
            className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-950/50 text-amber-400 border border-amber-800/60 font-mono text-[11px] animate-pulse"
            title="Divergencia significativa (>= 0.3 pp) entre los 10 mejores pronosticadores y el consenso total"
          >
            <AlertTriangle className="w-3 h-3 text-amber-400" />
            <span>Div. Top 10: {top10Divergence > 0 ? `+${top10Divergence.toFixed(2)}` : top10Divergence.toFixed(2)} pp</span>
          </div>
        ) : (
          <span className="text-slate-400 font-mono text-[11px]">
            Div. Top 10: {top10Divergence.toFixed(2)}
          </span>
        )}
      </div>
    </div>
  )
}
