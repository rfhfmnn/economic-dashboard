import React from 'react'
import { Printer, FileDown, X, ShieldAlert, Landmark, Calendar, FileWarning } from 'lucide-react'
import type { DebtorReport } from '../../types'
import { RiskBadge } from '../common/RiskBadge'
import { EarlyWarningBadge } from '../common/EarlyWarningBadge'
import { api } from '../../services/api'

export interface DossierModalProps {
  isOpen: boolean
  onClose: () => void
  report: DebtorReport | null
}

const HEATMAP_CLASSES: Record<number, string> = {
  1: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30',
  2: 'bg-amber-500/15 text-amber-600 border-amber-500/30',
  3: 'bg-orange-500/15 text-orange-600 border-orange-500/30',
  4: 'bg-rose-500/15 text-rose-600 border-rose-500/30',
  5: 'bg-red-600/15 text-red-600 border-red-600/30',
  6: 'bg-purple-600/15 text-purple-600 border-purple-600/30',
}

export const DossierModal: React.FC<DossierModalProps> = ({ isOpen, onClose, report }) => {
  if (!isOpen || !report) return null

  const handlePrint = () => {
    window.print()
  }

  const handleDownloadPdf = () => {
    const url = api.getExportPdfUrl(report.cuit)
    window.open(url, '_blank')
  }

  const historySorted = [...(report.historia_24m || [])].sort((a, b) =>
    a.periodo.localeCompare(b.periodo)
  )

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 print:p-0 print:bg-white">
      {/* Modal Container */}
      <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden print-container print:border-none print:shadow-none print:bg-white print:text-slate-900">
        {/* Action Toolbar (Hidden during printing) */}
        <div className="no-print p-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Vista Previa de Impresión — Dossier Ejecutivo
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors shadow-sm"
              title="Imprimir documento (Ctrl+P)"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimir Dossier</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadPdf}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition-colors"
              title="Descargar archivo PDF generado por el servidor"
            >
              <FileDown className="w-3.5 h-3.5 text-blue-400" />
              <span>Descargar PDF</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors ml-1"
              aria-label="Cerrar modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable 1-Page Document Body */}
        <div className="p-6 sm:p-8 space-y-6 print:p-0 print:space-y-4 text-slate-100 print:text-slate-900">
          {/* Header Banner */}
          <div className="border-b border-slate-800 print:border-slate-300 pb-4 flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded bg-blue-600 flex items-center justify-center font-bold text-white text-sm">
                BCRA
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-100 print:text-slate-900 tracking-tight">
                  BANCO CENTRAL DE LA REPÚBLICA ARGENTINA
                </h2>
                <p className="text-xs text-slate-400 print:text-slate-600">
                  Central de Deudores del Sistema Financiero — Dossier Ejecutivo de Riesgo
                </p>
              </div>
            </div>

            <div className="text-right text-xs font-mono text-slate-400 print:text-slate-600">
              <div>Emisión: {new Date().toLocaleDateString('es-AR')}</div>
              <div className="text-[10px]">Confidencial / Uso Institucional</div>
            </div>
          </div>

          {/* Debtor Overview Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-lg bg-slate-950/60 print:bg-slate-50 border border-slate-800 print:border-slate-300">
            <div>
              <span className="text-[10px] font-mono text-slate-400 uppercase block">Titular / Razón Social</span>
              <span className="text-sm font-bold text-slate-100 print:text-slate-900 truncate block" title={report.denominacion}>
                {report.denominacion}
              </span>
            </div>

            <div>
              <span className="text-[10px] font-mono text-slate-400 uppercase block">CUIT / CUIL</span>
              <span className="text-sm font-mono font-semibold text-slate-200 print:text-slate-800">
                {report.cuit_formateado || report.cuit}
              </span>
            </div>

            <div>
              <span className="text-[10px] font-mono text-slate-400 uppercase block">Peor Situación</span>
              <RiskBadge situacion={report.peor_situacion} showDescription size="sm" variant="solid" />
            </div>

            <div>
              <span className="text-[10px] font-mono text-slate-400 uppercase block">Deuda Consolidada</span>
              <span className="text-sm font-mono font-bold text-slate-100 print:text-slate-900 tabular-nums">
                ${report.deuda_total?.toLocaleString('es-AR') || '0'} ARS
              </span>
            </div>
          </div>

          {/* Active Risk Alerts */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300 print:text-slate-800 mb-2 flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-blue-400" />
              <span>Alertas Tempranas de Riesgo Crediticio ({report.alertas_tempranas?.length || 0})</span>
            </h4>
            {report.alertas_tempranas && report.alertas_tempranas.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {report.alertas_tempranas.map((b) => (
                  <EarlyWarningBadge key={b.id} badge={b} size="sm" />
                ))}
              </div>
            ) : (
              <p className="text-xs text-emerald-400 font-mono">
                ✓ Sin alertas de riesgo activas. Perfil crediticio regular sin observaciones.
              </p>
            )}
          </div>

          {/* 24-Month Heatmap */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300 print:text-slate-800 mb-2 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-blue-400" />
              <span>Evolución Histórica de Calificación (24 Meses)</span>
            </h4>
            <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5 text-center">
              {historySorted.map((item) => {
                const sit = Math.max(1, Math.min(6, item.situacion || 1))
                const theme = HEATMAP_CLASSES[sit] || HEATMAP_CLASSES[1]
                const parts = item.periodo.split('-')
                const shortLabel = parts.length === 2 ? `${parts[1]}/${parts[0].slice(2)}` : item.periodo

                return (
                  <div key={item.periodo} className={`p-1.5 rounded border text-center ${theme}`}>
                    <div className="text-xs font-bold font-mono">{sit}</div>
                    <div className="text-[9px] font-mono opacity-80">{shortLabel}</div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Bank Distribution Table */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300 print:text-slate-800 mb-2 flex items-center gap-1.5">
              <Landmark className="w-3.5 h-3.5 text-blue-400" />
              <span>Detalle de Deudas por Entidad Financiera</span>
            </h4>
            <div className="border border-slate-800 print:border-slate-300 rounded overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 print:border-slate-300 bg-slate-950/60 print:bg-slate-100 font-mono text-[11px] text-slate-400 print:text-slate-700">
                    <th className="py-2 px-3">Entidad</th>
                    <th className="py-2 px-3 text-center">Situación</th>
                    <th className="py-2 px-3 text-right">Monto (Miles ARS)</th>
                    <th className="py-2 px-3 text-center">Días Atraso</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 print:divide-slate-200 font-mono">
                  {report.entidades && report.entidades.length > 0 ? (
                    report.entidades.map((ent, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/20">
                        <td className="py-1.5 px-3 text-slate-200 print:text-slate-900 font-sans">
                          {ent.entidad}
                        </td>
                        <td className="py-1.5 px-3 text-center">
                          <RiskBadge situacion={ent.situacion} size="sm" />
                        </td>
                        <td className="py-1.5 px-3 text-right font-bold tabular-nums">
                          ${ent.monto.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                        </td>
                        <td className="py-1.5 px-3 text-center text-slate-400 print:text-slate-600">
                          {ent.diasAtraso ?? 0}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="py-3 text-center text-slate-500 font-sans">
                        No registra deudas activas en entidades financieras.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bounced Checks Summary */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300 print:text-slate-800 mb-2 flex items-center gap-1.5">
              <FileWarning className="w-3.5 h-3.5 text-blue-400" />
              <span>Cheques Rechazados</span>
            </h4>
            <div className="p-3 rounded border border-slate-800 print:border-slate-300 bg-slate-950/40 print:bg-slate-50 flex items-center justify-between text-xs font-mono">
              <span>Cantidad Total: <strong className="text-slate-100 print:text-slate-900">{report.cheques_rechazados?.cantidad || 0}</strong></span>
              <span>Monto Acumulado: <strong className="text-slate-100 print:text-slate-900">${report.cheques_rechazados?.total_monto?.toLocaleString('es-AR') || '0'} ARS</strong></span>
            </div>
          </div>

          {/* Institutional Print Footer */}
          <div className="border-t border-slate-800 print:border-slate-300 pt-3 text-[10px] text-slate-500 print:text-slate-600 flex items-center justify-between font-mono">
            <span>Fuente: BCRA Central de Deudores • Algoritmo AFIP Módulo 11 Validado</span>
            <span>Página 1 de 1</span>
          </div>
        </div>
      </div>
    </div>
  )
}
