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
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-4 overflow-hidden shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
          <Landmark className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
          <span>Distribución de deuda por entidad ({entidades.length})</span>
        </h4>
        <span className="text-xs font-sans text-slate-500 dark:text-slate-400">
          Deuda total: <strong className="text-slate-900 dark:text-slate-100 tabular-nums">${totalDebt.toLocaleString('es-AR')}</strong>
        </span>
      </div>

      {entidades.length === 0 ? (
        <div className="p-4 text-center text-xs text-slate-500 font-sans">
          No registra saldos de deuda activa en entidades financieras informadas.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 text-slate-600 dark:text-slate-400 font-sans text-[11px] uppercase tracking-wider">
                <th className="py-2.5 px-3">Entidad financiera</th>
                <th className="py-2.5 px-3 text-center">Situación</th>
                <th className="py-2.5 px-3 text-right">Monto (miles ARS)</th>
                <th className="py-2.5 px-3 text-right">Participación %</th>
                <th className="py-2.5 px-3 text-center">Días atraso</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
              {[...entidades]
                .sort((a, b) => b.monto - a.monto)
                .map((ent, idx) => {
                  const pct = totalDebt > 0 ? (ent.monto / totalDebt) * 100 : 0
                  const isMajorConcentration = pct >= 50
                  return (
                    <tr key={`${ent.entidad}-${idx}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-2.5 px-3 font-medium text-slate-900 dark:text-slate-200">
                        <div className="flex items-center gap-2">
                          <span>{ent.entidad}</span>
                          {isMajorConcentration && (
                            <span className="text-[10px] font-sans font-medium px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30 shrink-0">
                              Concentración &gt;50%
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <RiskBadge situacion={ent.situacion} size="sm" />
                      </td>
                      <td className="py-2.5 px-3 text-right font-sans text-slate-900 dark:text-slate-100 tabular-nums font-semibold">
                        ${ent.monto.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                      </td>
                      <td className="py-2.5 px-3 text-right font-sans text-slate-600 dark:text-slate-400 tabular-nums">
                        <div className="flex items-center justify-end gap-1.5">
                          <div className="w-12 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${isMajorConcentration ? 'bg-amber-500' : 'bg-blue-500'}`}
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            />
                          </div>
                          <span className={isMajorConcentration ? 'text-amber-600 dark:text-amber-300 font-semibold' : ''}>
                            {pct.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-center font-sans tabular-nums text-slate-600 dark:text-slate-400">
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
