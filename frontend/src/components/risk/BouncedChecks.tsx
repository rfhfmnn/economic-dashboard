import React from 'react'
import { FileWarning, CheckCircle } from 'lucide-react'
import type { BouncedCheckSummary } from '../../types'

export interface BouncedChecksProps {
  cheques: BouncedCheckSummary
}

export const BouncedChecks: React.FC<BouncedChecksProps> = ({ cheques }) => {
  const { cantidad, total_monto, detalles = [] } = cheques

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
          <FileWarning className="w-3.5 h-3.5 text-blue-400" />
          <span>Registro de cheques rechazados</span>
        </h4>

        <div className="flex items-center gap-3 text-xs font-mono">
          <span>Cantidad: <strong className={cantidad > 0 ? 'text-rose-400' : 'text-emerald-400'}>{cantidad}</strong></span>
          <span>•</span>
          <span>Monto: <strong className="text-slate-100">${total_monto.toLocaleString('es-AR')}</strong></span>
        </div>
      </div>

      {cantidad === 0 ? (
        <div className="flex items-center gap-2 p-2.5 rounded-lg border border-emerald-900/40 bg-emerald-950/20 text-emerald-300 text-xs">
          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>Sin cheques rechazados registrados ante el BCRA en los últimos períodos informados.</span>
        </div>
      ) : (
        <div className="space-y-2">
          {detalles.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-mono text-[11px]">
                    <th className="py-2 px-3">N° Cheque</th>
                    <th className="py-2 px-3">Fecha rechazo</th>
                    <th className="py-2 px-3 text-right">Monto (ARS)</th>
                    <th className="py-2 px-3">Causal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {detalles.map((chq, i) => (
                    <tr key={i} className="hover:bg-slate-800/40">
                      <td className="py-2 px-3 text-slate-300">
                        {chq.numeroCheque || `CHQ-${i + 1}`}
                      </td>
                      <td className="py-2 px-3 text-slate-400">
                        {chq.fechaRechazo}
                      </td>
                      <td className="py-2 px-3 text-right text-rose-300 font-semibold tabular-nums">
                        ${chq.monto.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-2 px-3 text-slate-400 font-sans">
                        {chq.causal || 'Sin fondos suficientes'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-2.5 rounded border border-rose-900/40 bg-rose-950/20 text-xs text-rose-300">
              Registra <strong>{cantidad}</strong> cheques rechazados por un total de{' '}
              <strong>${total_monto.toLocaleString('es-AR')}</strong> en el sistema centralizado.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
