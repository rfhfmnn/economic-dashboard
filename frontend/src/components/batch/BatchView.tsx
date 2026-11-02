import React, { useState } from 'react'
import { FileSpreadsheet, RefreshCw, AlertCircle, AlertTriangle } from 'lucide-react'
import { api } from '../../services/api'
import type { BatchPortfolioResponse } from '../../types'
import { RiskBadge } from '../common/RiskBadge'
import { FileUploadZone } from './FileUploadZone'
import { PortfolioTable } from './PortfolioTable'

export const BatchView: React.FC = () => {
  const [portfolio, setPortfolio] = useState<BatchPortfolioResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleEvaluateCuits = async (cuits: string[], portfolioName: string) => {
    try {
      setLoading(true)
      setError(null)
      const data = await api.evaluateBatch(cuits, portfolioName)
      setPortfolio(data)
    } catch (err: any) {
      setError(err?.message || 'Error al procesar el lote de CUITs en el backend.')
    } finally {
      setLoading(false)
    }
  }

  const handleEvaluateFile = async (file: File) => {
    try {
      setLoading(true)
      setError(null)
      const data = await api.uploadBatchFile(file)
      setPortfolio(data)
    } catch (err: any) {
      setError(err?.message || 'Error al procesar el archivo en el backend.')
    } finally {
      setLoading(false)
    }
  }

  const handleExportExcel = async () => {
    if (!portfolio) return
    try {
      setExporting(true)
      const blob = await api.downloadBatchExcel({
        results: portfolio.debtors,
        metrics: {
          total_cuits: portfolio.total_cuits,
          valid_cuits: portfolio.valid_count,
          invalid_cuits: portfolio.invalid_count,
          max_situacion: portfolio.peor_situacion_portfolio,
        },
      })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `portafolio_${portfolio.portfolio_name.replace(/\s+/g, '_').toLowerCase()}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (err: any) {
      alert(`Error al generar .xlsx: ${err?.message}`)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Upload Zone */}
      <FileUploadZone
        onEvaluateCuits={handleEvaluateCuits}
        onEvaluateFile={handleEvaluateFile}
        loading={loading}
      />

      {/* Error Message */}
      {error && !loading && (
        <div className="rounded-lg border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/20 p-5 text-center space-y-2">
          <AlertCircle className="w-6 h-6 text-rose-500 dark:text-rose-400 mx-auto" />
          <h4 className="text-sm font-semibold text-rose-800 dark:text-rose-200">Error en evaluación de cartera</h4>
          <p className="text-xs text-rose-600 dark:text-rose-300 font-sans">{error}</p>
        </div>
      )}

      {/* Portfolio Results View */}
      {portfolio && !loading && (
        <div className="space-y-6">
          {/* Top KPI Summary Banner */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                  {portfolio.portfolio_name}
                </h3>
                <span className="text-xs font-sans tabular-nums px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                  {portfolio.valid_count} evaluados
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-sans tabular-nums">
                Procesado: {new Date(portfolio.timestamp).toLocaleString('es-AR')}
              </p>
            </div>

            {/* Metrics cards & Export button */}
            <div className="flex flex-wrap items-center gap-4">
              <div className="text-right">
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-sans uppercase block">Peor situación</span>
                <RiskBadge situacion={portfolio.peor_situacion_portfolio} showDescription size="md" variant="solid" />
              </div>

              <div className="text-right">
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-sans uppercase block">Deuda consolidada</span>
                <span className="text-base font-bold font-sans text-slate-900 dark:text-slate-100 tabular-nums">
                  ${portfolio.total_debt?.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportExcel}
                  disabled={exporting}
                  className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors shadow-sm cursor-pointer"
                  title="Descargar portafolio en formato .xlsx"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>{exporting ? 'Generando Excel...' : 'Exportar a Excel'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPortfolio(null)}
                  className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs transition-colors cursor-pointer"
                  title="Limpiar y cargar nuevo lote"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Invalid CUITs warning alert if any */}
          {portfolio.invalid_items && portfolio.invalid_items.length > 0 && (
            <div className="p-3.5 rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/20 text-xs space-y-1">
              <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-semibold">
                <AlertTriangle className="w-4 h-4 text-amber-500 dark:text-amber-400" />
                <span>CUITs omitidos por validación ({portfolio.invalid_items.length}):</span>
              </div>
              <div className="flex flex-wrap gap-2 pt-1 font-sans text-[11px]">
                {portfolio.invalid_items.map((inv, idx) => (
                  <span
                    key={idx}
                    className="px-2 py-0.5 rounded bg-white dark:bg-slate-900 text-amber-800 dark:text-amber-300/80 border border-amber-200 dark:border-amber-800/60"
                    title={inv.error}
                  >
                    <span className="font-mono">{inv.raw}</span> ({inv.error})
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Comparative Portfolio Table */}
          <PortfolioTable
            debtors={portfolio.debtors}
            portfolioName={portfolio.portfolio_name}
          />
        </div>
      )}
    </div>
  )
}
