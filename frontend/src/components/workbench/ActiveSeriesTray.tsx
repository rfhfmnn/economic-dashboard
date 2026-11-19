import React from 'react'
import { X, Loader2, AlertTriangle, Layers } from 'lucide-react'
import type { WorkbenchSeriesData, WorkbenchSource } from '../../types'

export interface ActiveSeriesTrayProps {
  seriesList: WorkbenchSeriesData[]
  onRemoveSeries: (id: string) => void
  maxSeries: number
}

const SOURCE_BADGES: Record<WorkbenchSource, { label: string; className: string }> = {
  BCRA: { label: 'BCRA', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300' },
  INDEC: { label: 'INDEC', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300' },
  FX: { label: 'FX', className: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300' },
  REM: { label: 'REM', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300' },
}

export const ActiveSeriesTray: React.FC<ActiveSeriesTrayProps> = ({
  seriesList,
  onRemoveSeries,
  maxSeries,
}) => {
  if (seriesList.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-lg text-center bg-slate-50/50 dark:bg-slate-900/20">
        <Layers className="w-8 h-8 text-slate-400 dark:text-slate-500 mb-2" />
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Bandeja de series vacía
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Seleccione hasta 5 series del buscador universal para comenzar a analizar.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>
          Series activas ({seriesList.length}/{maxSeries})
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {seriesList.map((s) => {
          const badge = SOURCE_BADGES[s.source]

          return (
            <div
              key={s.id}
              className="inline-flex items-center gap-2 pl-2.5 pr-1.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm text-xs font-medium text-slate-800 dark:text-slate-200 transition-all hover:border-slate-300 dark:hover:border-slate-700"
            >
              {/* Color indicator dot */}
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: s.color }}
              />

              {/* Source badge */}
              <span
                className={`text-[9px] font-semibold px-1 py-0.2 rounded uppercase tracking-wider flex-shrink-0 ${badge.className}`}
              >
                {badge.label}
              </span>

              {/* Series name */}
              <span className="truncate max-w-[180px] sm:max-w-[220px]" title={s.name}>
                {s.name}
              </span>

              {/* Status indicator */}
              {s.status === 'loading' && (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500 flex-shrink-0" />
              )}
              {s.status === 'delayed' && (
                <span
                  title="Demora o error transitorio en la fuente externa"
                  className="inline-flex items-center gap-1 text-[10px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800"
                >
                  <AlertTriangle className="w-3 h-3 text-amber-500" />
                  <span>Dato demorado</span>
                </span>
              )}

              {/* Remove button */}
              <button
                type="button"
                onClick={() => onRemoveSeries(s.id)}
                className="ml-1 p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="Quitar serie"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
