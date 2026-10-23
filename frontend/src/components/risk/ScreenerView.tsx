import React, { useState, useEffect } from 'react'
import { FileDown, FileText, AlertTriangle, Building } from 'lucide-react'
import { api } from '../../services/api'
import type { DebtorReport } from '../../types'
import { RiskBadge } from '../common/RiskBadge'
import { BouncedChecks } from './BouncedChecks'
import { CuitSearchInput } from './CuitSearchInput'
import { DebtEntityTable } from './DebtEntityTable'
import { HistoryHeatmap } from './HistoryHeatmap'
import { RiskBadgeGrid } from './RiskBadgeGrid'
import { DossierModal } from './DossierModal'

export interface ScreenerViewProps {
  initialCuit?: string
}

export const ScreenerView: React.FC<ScreenerViewProps> = ({ initialCuit = '30-50000173-5' }) => {
  const [report, setReport] = useState<DebtorReport | null>(null)
  const [isDossierOpen, setIsDossierOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchDebtor = async (cuit: string, bypassCache: boolean = true) => {
    try {
      setLoading(true)
      setError(null)
      const data = await api.getDebtorReport(cuit, bypassCache)
      setReport(data)
    } catch (err: any) {
      setError(err?.message || 'Error al obtener informe de la Central de Deudores BCRA.')
      setReport(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (initialCuit) {
      fetchDebtor(initialCuit, true)
    }
  }, [initialCuit])

  const handleDownloadPdf = () => {
    if (!report) return
    const url = api.getExportPdfUrl(report.cuit)
    window.open(url, '_blank')
  }

  return (
    <div className="space-y-6">
      {/* Search Input Bar */}
      <CuitSearchInput
        onSearch={(cuit, bypass) => fetchDebtor(cuit, bypass)}
        loading={loading}
        initialCuit={initialCuit}
      />

      {/* Loading Skeleton */}
      {loading && (
        <div className="space-y-4 animate-pulse">
          <div className="h-28 rounded-lg bg-slate-900 border border-slate-800"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="h-48 rounded-lg bg-slate-900 border border-slate-800"></div>
            <div className="h-48 rounded-lg bg-slate-900 border border-slate-800"></div>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && !loading && (
        <div className="rounded-lg border border-rose-900/50 bg-rose-950/20 p-5 text-center space-y-2">
          <AlertTriangle className="w-6 h-6 text-rose-400 mx-auto" />
          <h4 className="text-sm font-semibold text-rose-200">Error al consultar Central de Deudores</h4>
          <p className="text-xs text-rose-300 font-mono">{error}</p>
        </div>
      )}

      {/* Debtor Dossier Content */}
      {report && !loading && (
        <div className="space-y-6">
          {/* Executive Overview Banner */}
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="h-10 w-10 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
                <Building className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base font-bold text-slate-100 tracking-tight">
                    {report.denominacion}
                  </h3>
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                    {report.cuit_formateado || report.cuit}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1 text-xs text-slate-400 font-mono">
                  <span>Período Base: {report.periodo || 'Último Informado'}</span>
                  <span>•</span>
                  <span>Entidades: {report.entidades?.length || 0}</span>
                </div>
              </div>
            </div>

            {/* Right KPIs & PDF button */}
            <div className="flex flex-wrap items-center gap-3 md:border-l md:border-slate-800 md:pl-5">
              <div className="text-right sm:text-left md:text-right">
                <span className="text-[10px] text-slate-500 font-mono uppercase block">Peor Situación</span>
                <RiskBadge situacion={report.peor_situacion} showDescription size="md" variant="solid" />
              </div>

              <div className="text-right sm:text-left md:text-right">
                <span className="text-[10px] text-slate-500 font-mono uppercase block">Deuda Total</span>
                <span className="text-base font-bold font-mono text-slate-100 tabular-nums">
                  ${report.deuda_total?.toLocaleString('es-AR') || '0'}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setIsDossierOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors shadow-sm ml-auto sm:ml-0"
                title="Abrir vista de impresión de Dossier Ejecutivo"
              >
                <FileText className="w-4 h-4" />
                <span>Ver Dossier</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadPdf}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition-colors shadow-sm"
                title="Descargar Dossier Ejecutivo en PDF"
              >
                <FileDown className="w-4 h-4 text-blue-400" />
                <span>Exportar PDF</span>
              </button>
            </div>
          </div>

          {/* Early Warning Badges */}
          <RiskBadgeGrid badges={report.alertas_tempranas || []} />

          {/* 24-Month History Heatmap */}
          <HistoryHeatmap history={report.historia_24m || []} />

          {/* Bank Breakdown & Bounced Checks Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <DebtEntityTable entidades={report.entidades || []} totalDebt={report.deuda_total || 0} />
            <BouncedChecks cheques={report.cheques_rechazados || { cantidad: 0, total_monto: 0 }} />
          </div>

          {/* Executive Dossier Modal */}
          <DossierModal
            isOpen={isDossierOpen}
            onClose={() => setIsDossierOpen(false)}
            report={report}
          />
        </div>
      )}
    </div>
  )
}
