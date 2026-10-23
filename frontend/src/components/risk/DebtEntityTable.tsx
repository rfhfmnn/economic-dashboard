import React from 'react'
import { Landmark } from 'lucide-react'
import type { DebtEntity } from '../../types'
import { RiskBadge } from '../common/RiskBadge'

export interface DebtEntityTableProps {
  entidades: DebtEntity[]
  totalDebt: number
}

export const DebtEntityTable: React.FC<DebtEntityTableProps> = ({ entidades, totalDebt }) => {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
          <Landmark className="w-3.5 h-3.5 text-blue-400" />
          <span>Distribución de deuda por entidad ({entidades.length})</span>
        </h4>
        <span className="text-xs font-mono text-slate-400">
          Deuda Total: <strong className="text-slate-100">${totalDebt.toLocaleString('es-AR')}</strong>
        </span>
      </div>

      {entidades.length === 0 ? (
        <div className="p-4 text-center text-xs text-slate-500 font-mono">
          No registra saldos de deuda activa en entidades financieras informadas.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-mono text-[11px]">
                <th className="py-2.5 px-3">Entidad Financiera</th>
                <th className="py-2.5 px-3 text-center">Situación</th>
                <th className="py-2.5 px-3 text-right">Monto (Miles ARS)</th>
                <th className="py-2.5 px-3 text-right">Participación %</th>
                <th className="py-2.5 px-3 text-center">Días Atraso</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {[...entidades]
                .sort((a, b) => b.monto - a.monto)
                .map((ent, idx) => {
                  const pct = totalDebt > 0 ? (ent.monto / totalDebt) * 100 : 0
                  const isMajorConcentration = pct >= 50
                  return (
                    <tr key={`${ent.entidad}-${idx}`} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-2.5 px-3 font-medium text-slate-200">
                        <div className="flex items-center gap-2">
                          <span>{ent.entidad}</span>
                          {isMajorConcentration && (
                            <span className="text-[10px] font-mono font-medium px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30 shrink-0">
                              Concentración &gt;50%
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <RiskBadge situacion={ent.situacion} size="sm" />
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-100 tabular-nums font-semibold">
                        ${ent.monto.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-400 tabular-nums">
                        <div className="flex items-center justify-end gap-1.5">
                          <div className="w-12 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${isMajorConcentration ? 'bg-amber-500' : 'bg-blue-500'}`}
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            />
                          </div>
                          <span className={isMajorConcentration ? 'text-amber-300 font-semibold' : ''}>
                            {pct.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono text-slate-400">
                        {ent.diasAtraso ?? 0}
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
