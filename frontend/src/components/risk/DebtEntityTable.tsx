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
          <span>Distribución de Deuda por Entidad ({entidades.length})</span>
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
                <th className="py-2.5 px-3 text-right">Exposición %</th>
                <th className="py-2.5 px-3 text-center">Días Atraso</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {entidades.map((ent, idx) => {
                const pct = totalDebt > 0 ? (ent.monto / totalDebt) * 100 : 0
                return (
                  <tr key={`${ent.entidad}-${idx}`} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-2.5 px-3 font-medium text-slate-200">
                      {ent.entidad}
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
                            className="h-full bg-blue-500 rounded-full"
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                        <span>{pct.toFixed(1)}%</span>
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
