import React from 'react'
import type { WorkbenchSeriesStats, WorkbenchSource } from '../../types'

export interface WorkbenchStatsTableProps {
  stats: WorkbenchSeriesStats[]
}

const SOURCE_BADGES: Record<WorkbenchSource, { label: string; className: string }> = {
  BCRA: { label: 'BCRA', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300' },
  INDEC: { label: 'INDEC', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300' },
  FX: { label: 'FX', className: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300' },
  REM: { label: 'REM', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300' },
}

export const WorkbenchStatsTable: React.FC<WorkbenchStatsTableProps> = ({ stats }) => {
  if (stats.length === 0) return null

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Resumen estadístico de series activas
        </h3>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 text-[11px] font-medium text-slate-500 uppercase tracking-wider">
              <th className="py-2.5 px-4">Serie</th>
              <th className="py-2.5 px-3">Origen</th>
              <th className="py-2.5 px-3 text-right">Último valor</th>
              <th className="py-2.5 px-3 text-center">Fecha</th>
              <th className="py-2.5 px-3 text-right">Variación período</th>
              <th className="py-2.5 px-3 text-right">Mínimo</th>
              <th className="py-2.5 px-3 text-right">Máximo</th>
              <th className="py-2.5 px-4 text-right">Desvío estándar</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {stats.map((row) => {
              const badge = SOURCE_BADGES[row.source]
              const hasVariation = row.variacionPeriodo !== null

              return (
                <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                  <td className="py-2.5 px-4 font-medium text-slate-900 dark:text-slate-100">
                    {row.name}
                  </td>
                  <td className="py-2.5 px-3">
                    <span
                      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wider ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200">
                    {row.ultimoValor !== null ? Number(row.ultimoValor).toLocaleString('es-AR', { maximumFractionDigits: 2 }) : '—'}
                  </td>
                  <td className="py-2.5 px-3 text-center font-mono tabular-nums text-slate-500">
                    {row.fechaUltimo ? row.fechaUltimo.slice(0, 10) : '—'}
                  </td>
                  <td
                    className={`py-2.5 px-3 text-right font-mono tabular-nums font-medium ${
                      hasVariation
                        ? row.variacionPeriodo! > 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : row.variacionPeriodo! < 0
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-slate-600'
                        : 'text-slate-400'
                    }`}
                  >
                    {hasVariation ? `${row.variacionPeriodo! > 0 ? '+' : ''}${row.variacionPeriodo!.toFixed(2)}%` : '—'}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                    {row.minimo !== null ? Number(row.minimo).toLocaleString('es-AR', { maximumFractionDigits: 2 }) : '—'}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                    {row.maximo !== null ? Number(row.maximo).toLocaleString('es-AR', { maximumFractionDigits: 2 }) : '—'}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                    {row.desvioEstandar !== null ? Number(row.desvioEstandar).toLocaleString('es-AR', { maximumFractionDigits: 4 }) : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
