import React from 'react'
import { ShieldAlert, CheckCircle2 } from 'lucide-react'
import type { AlertBadge } from '../../types'
import { EarlyWarningBadge } from '../common/EarlyWarningBadge'

export interface RiskBadgeGridProps {
  badges: AlertBadge[]
}

export const RiskBadgeGrid: React.FC<RiskBadgeGridProps> = ({ badges }) => {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
          <ShieldAlert className="w-3.5 h-3.5 text-blue-400" />
          <span>Matriz de Alertas Tempranas ({badges.length})</span>
        </h4>
      </div>

      {badges.length === 0 ? (
        <div className="flex items-center gap-2 p-2.5 rounded-lg border border-emerald-900/40 bg-emerald-950/20 text-emerald-300 text-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>Sin banderas de alerta temprana activas. Comportamiento crediticio regular y estable.</span>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {badges.map((b) => (
            <EarlyWarningBadge key={b.id} badge={b} size="md" />
          ))}
        </div>
      )}
    </div>
  )
}
