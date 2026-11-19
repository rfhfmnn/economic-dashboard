import React from 'react'
import type { WorkbenchSeriesStats, WorkbenchSource, Periodicity } from '../../types'
import type { ExpressionMode } from '../../utils/transforms'
import { formatPeriodDate } from './WorkbenchChart'

export interface WorkbenchStatsTableProps {
  stats: WorkbenchSeriesStats[]
  expressionMode?: ExpressionMode
  periodicity?: Periodicity
}

const SOURCE_BADGES: Record<WorkbenchSource, { label: string; className: string }> = {
  BCRA: { label: 'BCRA', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300' },
  INDEC: { label: 'INDEC', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300' },
  FX: { label: 'FX', className: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300' },
  REM: { label: 'REM', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300' },
}

export const WorkbenchStatsTable: React.FC<WorkbenchStatsTableProps> = ({
  stats,
  expressionMode = 'base100',
  periodicity = 'original',
}) => {
  if (stats.length === 0) return null

  const isPercentMode = expressionMode === 'mom' || expressionMode === 'yoy'

  // Dynamic column headers based on active expression mode
  const latestHeader =
    expressionMode === 'mom'
      ? 'Última var. MoM'
      : expressionMode === 'yoy'
      ? 'Última var. YoY'
      : expressionMode === 'base100'
      ? 'Último valor (base 100)'
      : 'Último valor'

  const secondaryHeader =
    expressionMode === 'mom'
      ? 'Promedio MoM'
      : expressionMode === 'yoy'
      ? 'Promedio YoY'
      : 'Variación período'

  const minHeader =
    expressionMode === 'mom'
      ? 'Mínimo MoM'
      : expressionMode === 'yoy'
      ? 'Mínimo YoY'
      : 'Mínimo'

  const maxHeader =
    expressionMode === 'mom'
      ? 'Máximo MoM'
      : expressionMode === 'yoy'
      ? 'Máximo YoY'
      : 'Máximo'

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
            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 text-[11px] font-medium text-slate-500 tracking-wider">
              <th className="py-2.5 px-4">Serie</th>
              <th className="py-2.5 px-3">Origen</th>
              <th className="py-2.5 px-3 text-right">{latestHeader}</th>
              <th className="py-2.5 px-3 text-center">Fecha</th>
              <th className="py-2.5 px-3 text-right">{secondaryHeader}</th>
              <th className="py-2.5 px-3 text-right">{minHeader}</th>
              <th className="py-2.5 px-3 text-right">{maxHeader}</th>
              <th className="py-2.5 px-4 text-right">Desvío estándar</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {stats.map((row) => {
              const badge = SOURCE_BADGES[row.source]
              const hasVariation = row.variacionPeriodo !== null
              const hasPromedio = row.promedio !== null && row.promedio !== undefined

              // Format secondary metric: in MoM/YoY show promedio; in base100/original show variacionPeriodo
              const secondaryVal = isPercentMode
                ? hasPromedio
                  ? `${row.promedio! > 0 ? '+' : ''}${row.promedio!.toFixed(2)}%`
                  : '—'
                : hasVariation
                ? `${row.variacionPeriodo! > 0 ? '+' : ''}${row.variacionPeriodo!.toFixed(2)}%`
                : '—'

              const secondaryColor = isPercentMode
                ? hasPromedio
                  ? row.promedio! > 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : row.promedio! < 0
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-slate-600'
                  : 'text-slate-400'
                : hasVariation
                ? row.variacionPeriodo! > 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : row.variacionPeriodo! < 0
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-slate-600'
                : 'text-slate-400'

              // Format latest value
              const latestFormatted =
                row.ultimoValor !== null
                  ? isPercentMode
                    ? `${row.ultimoValor > 0 ? '+' : ''}${row.ultimoValor.toFixed(2)}%`
                    : expressionMode === 'base100'
                    ? row.ultimoValor.toFixed(2)
                    : Number(row.ultimoValor).toLocaleString('es-AR', { maximumFractionDigits: 2 })
                  : '—'

              // Format min
              const minFormatted =
                row.minimo !== null
                  ? isPercentMode
                    ? `${row.minimo > 0 ? '+' : ''}${row.minimo.toFixed(2)}%`
                    : expressionMode === 'base100'
                    ? row.minimo.toFixed(2)
                    : Number(row.minimo).toLocaleString('es-AR', { maximumFractionDigits: 2 })
                  : '—'

              // Format max
              const maxFormatted =
                row.maximo !== null
                  ? isPercentMode
                    ? `${row.maximo > 0 ? '+' : ''}${row.maximo.toFixed(2)}%`
                    : expressionMode === 'base100'
                    ? row.maximo.toFixed(2)
                    : Number(row.maximo).toLocaleString('es-AR', { maximumFractionDigits: 2 })
                  : '—'

              // Format std dev
              const stdDevFormatted =
                row.desvioEstandar !== null
                  ? isPercentMode
                    ? `${row.desvioEstandar.toFixed(2)}%`
                    : expressionMode === 'base100'
                    ? row.desvioEstandar.toFixed(4)
                    : Number(row.desvioEstandar).toLocaleString('es-AR', { maximumFractionDigits: 4 })
                  : '—'

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
                  <td
                    className={`py-2.5 px-3 text-right font-mono tabular-nums ${
                      isPercentMode && row.ultimoValor !== null
                        ? row.ultimoValor > 0
                          ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                          : row.ultimoValor < 0
                          ? 'text-rose-600 dark:text-rose-400 font-medium'
                          : 'text-slate-800 dark:text-slate-200'
                        : 'text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    {latestFormatted}
                  </td>
                  <td className="py-2.5 px-3 text-center font-mono tabular-nums text-slate-500">
                    {row.fechaUltimo ? formatPeriodDate(row.fechaUltimo, periodicity) : '—'}
                  </td>
                  <td className={`py-2.5 px-3 text-right font-mono tabular-nums font-medium ${secondaryColor}`}>
                    {secondaryVal}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                    {minFormatted}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                    {maxFormatted}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                    {stdDevFormatted}
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
