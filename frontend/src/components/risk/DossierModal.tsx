import React from 'react'
import { Printer, FileDown, X, Landmark, FileWarning } from 'lucide-react'
import type { DebtorReport } from '../../types'
import { RiskBadge } from '../common/RiskBadge'
import { api } from '../../services/api'

export interface DtiAnalysisData {
  income: number
  frequency: 'monthly' | 'annual'
  multiple: number
  label: string
  color: string
}

export interface DossierModalProps {
  isOpen: boolean
  onClose: () => void
  report: DebtorReport | null
  dtiData?: DtiAnalysisData | null
}

export const DossierModal: React.FC<DossierModalProps> = ({ isOpen, onClose, report, dtiData }) => {
  if (!isOpen || !report) return null

  const handlePrint = () => {
    window.print()
  }

  const handleDownloadPdf = () => {
    const url = api.getExportPdfUrl(report.cuit)
    window.open(url, '_blank')
  }

  const sortedEntidades = [...(report.entidades || [])].sort((a, b) => b.monto - a.monto)
  const totalDebt = report.deuda_total || 0
  const cheques = report.cheques_rechazados
  const impagos = (cheques?.detalles || []).filter((c) => !c.pagado && (!c.fechaPago || c.fechaPago === null))
  const totalImpago = impagos.reduce((acc, c) => acc + (c.monto || 0), 0)

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 print:p-0 print:bg-white">
      {/* Modal Container */}
      <div className="relative w-full max-w-4xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl overflow-hidden print-container print:border-none print:shadow-none print:bg-white print:text-slate-900">
        {/* Action Toolbar (Hidden during printing) */}
        <div className="no-print p-4 bg-slate-50 dark:bg-slate-950/80 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Vista previa de impresión — Dossier ejecutivo
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors shadow-sm cursor-pointer"
              title="Imprimir documento (Ctrl+P)"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimir dossier</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadPdf}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 text-xs font-medium transition-colors cursor-pointer"
              title="Descargar archivo PDF generado por el servidor"
            >
              <FileDown className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
              <span>Descargar PDF</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ml-1 cursor-pointer"
              aria-label="Cerrar modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable 1-Page Document Body */}
        <div className="p-6 sm:p-8 space-y-5 print:p-0 print:space-y-3.5 text-slate-900 dark:text-slate-100 print:text-slate-900">
          {/* Header Banner */}
          <div className="border-b border-slate-200 dark:border-slate-800 print:border-slate-300 pb-3 flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded bg-blue-600 flex items-center justify-center font-bold text-white text-sm">
                BCRA
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 print:text-slate-900 tracking-tight">
                  BANCO CENTRAL DE LA REPÚBLICA ARGENTINA
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 print:text-slate-600">
                  Central de deudores del sistema financiero — Dossier ejecutivo de riesgo
                </p>
              </div>
            </div>

            <div className="text-right text-xs font-sans tabular-nums text-slate-500 dark:text-slate-400 print:text-slate-600">
              <div>Emisión: {new Date().toLocaleDateString('es-AR')}</div>
              <div className="text-[10px]">Confidencial/uso institucional</div>
            </div>
          </div>

          {/* Debtor Overview Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 print:bg-slate-50 border border-slate-200 dark:border-slate-800 print:border-slate-300">
            <div>
              <span className="text-[10px] font-sans text-slate-500 dark:text-slate-400 print:text-slate-600 uppercase block">Titular/razón social</span>
              <span className="text-sm font-bold text-slate-900 dark:text-slate-100 print:text-slate-900 truncate block" title={report.denominacion}>
                {report.denominacion}
              </span>
            </div>

            <div>
              <span className="text-[10px] font-sans text-slate-500 dark:text-slate-400 print:text-slate-600 uppercase block">CUIT/CUIL</span>
              <span className="text-sm font-mono font-semibold text-slate-800 dark:text-slate-200 print:text-slate-800">
                {report.cuit_formateado || report.cuit}
              </span>
            </div>

            <div>
              <span className="text-[10px] font-sans text-slate-500 dark:text-slate-400 print:text-slate-600 uppercase block">Peor situación</span>
              <RiskBadge situacion={report.peor_situacion} showDescription size="sm" variant="solid" />
            </div>

            <div>
              <span className="text-[10px] font-sans text-slate-500 dark:text-slate-400 print:text-slate-600 uppercase block">Deuda consolidada</span>
              <span className="text-sm font-sans font-bold text-slate-900 dark:text-slate-100 print:text-slate-900 tabular-nums">
                ${report.deuda_total?.toLocaleString('es-AR') || '0'} ARS
              </span>
            </div>
          </div>

          {/* Optional Debt-to-Income / Capacidad de Pago Evaluation Block */}
          {dtiData && dtiData.income > 0 && (
            <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 print:border-slate-300 bg-slate-50 dark:bg-slate-950/40 print:bg-slate-50 flex items-center justify-between text-xs">
              <div>
                <span className="text-[10px] font-sans text-slate-500 dark:text-slate-400 print:text-slate-600 uppercase block">
                  Capacidad de pago evaluada
                </span>
                <span className="font-semibold text-slate-800 dark:text-slate-200 print:text-slate-800">
                  Ingreso declarado: ${dtiData.income.toLocaleString('es-AR')} ({dtiData.frequency === 'monthly' ? 'mensual' : 'anual'})
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-sans text-slate-500 dark:text-slate-400 print:text-slate-600 uppercase block">
                  Ratio deuda/ingreso anual
                </span>
                <span className="font-sans tabular-nums font-bold text-sm text-slate-900 dark:text-slate-100 print:text-slate-900">
                  {dtiData.multiple.toFixed(1)}x ({dtiData.label})
                </span>
              </div>
            </div>
          )}

          {/* Bank Distribution Table */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 print:text-slate-800 mb-2 flex items-center gap-1.5">
              <Landmark className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
              <span>Detalle de deudas por entidad financiera ({sortedEntidades.length})</span>
            </h4>
            <div className="border border-slate-200 dark:border-slate-800 print:border-slate-300 rounded overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 print:border-slate-300 bg-slate-50 dark:bg-slate-950/60 print:bg-slate-100 font-sans text-[11px] text-slate-600 dark:text-slate-400 print:text-slate-700 uppercase tracking-wider">
                    <th className="py-2 px-3">Entidad</th>
                    <th className="py-2 px-3 text-center">Situación</th>
                    <th className="py-2 px-3 text-right">Monto (miles ARS)</th>
                    <th className="py-2 px-3 text-right">Participación %</th>
                    <th className="py-2 px-3 text-center">Días atraso</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 print:divide-slate-200 font-sans tabular-nums">
                  {sortedEntidades.length > 0 ? (
                    sortedEntidades.map((ent, idx) => {
                      const pct = totalDebt > 0 ? (ent.monto / totalDebt) * 100 : 0
                      return (
                        <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/20">
                          <td className="py-1.5 px-3 text-slate-900 dark:text-slate-200 print:text-slate-900 font-sans">
                            {ent.entidad}
                          </td>
                          <td className="py-1.5 px-3 text-center">
                            <RiskBadge situacion={ent.situacion} size="sm" />
                          </td>
                          <td className="py-1.5 px-3 text-right font-bold tabular-nums text-slate-900 dark:text-slate-100 print:text-slate-900">
                            ${ent.monto.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                          </td>
                          <td className="py-1.5 px-3 text-right font-sans tabular-nums text-slate-600 dark:text-slate-400 print:text-slate-700">
                            {pct.toFixed(1)}%
                          </td>
                          <td className="py-1.5 px-3 text-center text-slate-600 dark:text-slate-400 print:text-slate-600">
                            {ent.diasAtraso ?? 0}
                          </td>
                        </tr>
                      )
                    })
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-3 text-center text-slate-500 font-sans">
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
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 print:text-slate-800 mb-2 flex items-center gap-1.5">
              <FileWarning className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
              <span>Cheques rechazados</span>
            </h4>
            <div className="p-3 rounded border border-slate-200 dark:border-slate-800 print:border-slate-300 bg-slate-50 dark:bg-slate-950/40 print:bg-slate-50 flex items-center justify-between text-xs font-sans tabular-nums">
              <div className="flex items-center gap-3">
                <span>Cantidad: <strong className="text-slate-900 dark:text-slate-100 print:text-slate-900">{cheques?.cantidad || 0}</strong></span>
                {impagos.length > 0 && (
                  <span className="text-rose-600 dark:text-rose-400 print:text-rose-700 font-semibold">
                    (⚠️ {impagos.length} sin abonar: ${totalImpago.toLocaleString('es-AR')})
                  </span>
                )}
              </div>
              <span>Monto total: <strong className="text-slate-900 dark:text-slate-100 print:text-slate-900">${cheques?.total_monto?.toLocaleString('es-AR') || '0'} ARS</strong></span>
            </div>
          </div>

          {/* Institutional Print Footer */}
          <div className="border-t border-slate-200 dark:border-slate-800 print:border-slate-300 pt-3 text-[10px] text-slate-500 print:text-slate-600 flex items-center justify-between font-sans">
            <span>Fuente: BCRA Central de Deudores • Algoritmo AFIP módulo 11 validado</span>
            <span>Página 1 de 1</span>
          </div>
        </div>
      </div>
    </div>
  )
}
