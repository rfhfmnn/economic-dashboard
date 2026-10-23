import React from 'react'
import { Calendar } from 'lucide-react'
import type { HistoryPoint } from '../../types'

export interface HistoryHeatmapProps {
  history: HistoryPoint[]
}

const HEATMAP_CLASSES: Record<number, string> = {
  1: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:border-emerald-400',
  2: 'bg-amber-500/20 text-amber-400 border-amber-500/30 hover:border-amber-400',
  3: 'bg-orange-500/20 text-orange-400 border-orange-500/30 hover:border-orange-400',
  4: 'bg-rose-500/20 text-rose-400 border-rose-500/30 hover:border-rose-400',
  5: 'bg-red-600/20 text-red-400 border-red-600/30 hover:border-red-400',
  6: 'bg-purple-600/20 text-purple-300 border-purple-600/30 hover:border-purple-300',
}

const SIT_LABELS: Record<number, string> = {
  1: 'Normal (Sit 1)',
  2: 'Bajo Seguimiento (Sit 2)',
  3: 'Con Problemas (Sit 3)',
  4: 'Alto Riesgo (Sit 4)',
  5: 'Irrecuperable (Sit 5)',
  6: 'Disposición Técnica (Sit 6)',
}

export const HistoryHeatmap: React.FC<HistoryHeatmapProps> = ({ history }) => {
  // Ensure chronological order
  const sorted = [...history].sort((a, b) => a.periodo.localeCompare(b.periodo))

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
        <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5 text-blue-400" />
          <span>Matriz de Calificación Histórica (24 Meses)</span>
        </h4>
        <span className="text-[11px] font-mono text-slate-500">
          Evolución mensual de la peor situación registrada en el sistema
        </span>
      </div>

      {sorted.length === 0 ? (
        <div className="p-4 text-center text-xs text-slate-500 font-mono">
          Sin registros históricos informados en la Central de Deudores.
        </div>
      ) : (
        <div>
          {/* Responsive 12 or 24 column grid */}
          <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5 sm:gap-2">
            {sorted.map((item) => {
              const sit = Math.max(1, Math.min(6, item.situacion || 1))
              const theme = HEATMAP_CLASSES[sit] || HEATMAP_CLASSES[1]

              // Format periodo e.g. 2024-05 -> 05/24 or 202608 -> 08/26
              let shortLabel = item.periodo
              if (item.periodo.includes('-')) {
                const parts = item.periodo.split('-')
                if (parts.length === 2) shortLabel = `${parts[1]}/${parts[0].slice(2)}`
              } else if (item.periodo.length === 6) {
                shortLabel = `${item.periodo.slice(4, 6)}/${item.periodo.slice(2, 4)}`
              }

              return (
                <div
                  key={item.periodo}
                  className={`flex flex-col items-center justify-center p-2 rounded border transition-all text-center ${theme}`}
                  title={`Período: ${item.periodo} — ${SIT_LABELS[sit]}`}
                >
                  <span className="text-sm font-bold font-mono tabular-nums leading-none">
                    {sit}
                  </span>
                  <span className="text-[9px] font-mono opacity-80 mt-1">
                    {shortLabel}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Legend */}
          <div className="mt-3 pt-3 border-t border-slate-800/60 flex flex-wrap items-center justify-center gap-3 text-[10px] font-mono text-slate-400">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded bg-emerald-500/40 border border-emerald-500 inline-block"></span>
              <span>1: Normal</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded bg-amber-500/40 border border-amber-500 inline-block"></span>
              <span>2: Seguimiento</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded bg-orange-500/40 border border-orange-500 inline-block"></span>
              <span>3: Problemas</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded bg-rose-500/40 border border-rose-500 inline-block"></span>
              <span>4: Alto Riesgo</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded bg-red-600/40 border border-red-600 inline-block"></span>
              <span>5: Default</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded bg-purple-600/40 border border-purple-600 inline-block"></span>
              <span>6: Técnico</span>
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
