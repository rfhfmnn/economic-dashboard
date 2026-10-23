import React, { useState, useEffect, useMemo } from 'react'
import { FileDown, FileText, AlertTriangle, Building, Search, Layers, Calculator } from 'lucide-react'
import { api } from '../../services/api'
import type { DebtorReport } from '../../types'
import { RiskBadge } from '../common/RiskBadge'
import { BouncedChecks } from './BouncedChecks'
import { CuitSearchInput } from './CuitSearchInput'
import { DebtEntityTable } from './DebtEntityTable'
import { DossierModal, type DtiAnalysisData } from './DossierModal'
import { BatchView } from '../batch/BatchView'

export interface ScreenerViewProps {
  initialCuit?: string
  initialSubTab?: 'individual' | 'batch'
}

export const ScreenerView: React.FC<ScreenerViewProps> = ({ initialCuit = '', initialSubTab = 'individual' }) => {
  const [activeSubTab, setActiveSubTab] = useState<'individual' | 'batch'>(initialSubTab)
  const [report, setReport] = useState<DebtorReport | null>(null)
  const [isDossierOpen, setIsDossierOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Debt-to-Income / Capacidad de Pago Calculator State
  const [incomeInput, setIncomeInput] = useState<string>('')
  const [incomeFrequency, setIncomeFrequency] = useState<'monthly' | 'annual'>('monthly')

  useEffect(() => {
    if (initialSubTab) {
      setActiveSubTab(initialSubTab)
    }
  }, [initialSubTab])

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
    if (initialCuit && initialCuit.trim()) {
      fetchDebtor(initialCuit, true)
    }
  }, [initialCuit])

  const dtiAnalysis = useMemo<DtiAnalysisData | null>(() => {
    if (!report || !incomeInput.trim()) return null
    const num = parseFloat(incomeInput.replace(/[^0-9.]/g, ''))
    if (!num || num <= 0) return null

    // Central de Deudores debts are in thousands of ARS (e.g. 75000 = $75.000 miles)
    const incomeInMiles = num >= 100000 ? num / 1000 : num
    const annualIncomeInMiles = incomeFrequency === 'monthly' ? incomeInMiles * 12 : incomeInMiles
    const multiple = annualIncomeInMiles > 0 ? (report.deuda_total / annualIncomeInMiles) : 0

    let label = 'Baja carga (< 1.0x)'
    let color = 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'

    if (multiple > 2.5) {
      label = 'Carga elevada (> 2.5x)'
      color = 'bg-rose-500/15 text-rose-400 border-rose-500/30'
    } else if (multiple > 1.0) {
      label = 'Carga moderada (1.0x - 2.5x)'
      color = 'bg-amber-500/15 text-amber-400 border-amber-500/30'
    }

    return {
      income: num,
      frequency: incomeFrequency,
      multiple,
      label,
      color,
    }
  }, [report, incomeInput, incomeFrequency])

  const handleDownloadPdf = () => {
    if (!report) return
    const url = api.getExportPdfUrl(report.cuit)
    window.open(url, '_blank')
  }

  return (
    <div className="space-y-6">
      {/* Sub-tab switcher: Consulta Individual vs Portafolio Batch */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
        <button
          type="button"
          onClick={() => setActiveSubTab('individual')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg transition-all ${activeSubTab === 'individual'
            ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
        >
          <Search className="w-3.5 h-3.5" />
          <span>Consulta individual (CUIT)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('batch')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg transition-all ${activeSubTab === 'batch'
            ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Portafolio Batch</span>
        </button>
      </div>

      {activeSubTab === 'batch' ? (
        <BatchView />
      ) : (
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
                      <span>Período base: {report.periodo || 'Último informado'}</span>
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
                    title="Descargar dossier ejecutivo en PDF"
                  >
                    <FileDown className="w-4 h-4 text-blue-400" />
                    <span>Exportar PDF</span>
                  </button>
                </div>
              </div>

              {/* Debt-to-Income (DTI) & Capacidad de Pago Calculator */}
              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                      <Calculator className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
                        Capacidad de Pago & Ratio Deuda / Ingreso (DTI)
                      </h4>
                      <p className="text-[11px] text-slate-400">
                        Compare la deuda total informada en BCRA (${report.deuda_total?.toLocaleString('es-AR')}) contra los ingresos declarados del titular.
                      </p>
                    </div>
                  </div>

                  {/* Income Input & Quick Controls */}
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-400">$</span>
                      <input
                        type="number"
                        min="0"
                        step="1000"
                        value={incomeInput}
                        onChange={(e) => setIncomeInput(e.target.value)}
                        placeholder="Ingreso estimado..."
                        className="w-44 pl-6 pr-3 py-1.5 text-xs font-mono bg-slate-950 border border-slate-700 rounded-md text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>

                    <div className="inline-flex rounded-md border border-slate-700 bg-slate-950 p-0.5 text-xs font-mono">
                      <button
                        type="button"
                        onClick={() => setIncomeFrequency('monthly')}
                        className={`px-2 py-1 rounded text-[11px] transition-colors ${incomeFrequency === 'monthly' ? 'bg-slate-800 text-white font-medium' : 'text-slate-400 hover:text-slate-200'}`}
                      >
                        Mensual
                      </button>
                      <button
                        type="button"
                        onClick={() => setIncomeFrequency('annual')}
                        className={`px-2 py-1 rounded text-[11px] transition-colors ${incomeFrequency === 'annual' ? 'bg-slate-800 text-white font-medium' : 'text-slate-400 hover:text-slate-200'}`}
                      >
                        Anual
                      </button>
                    </div>

                    {dtiAnalysis && (
                      <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
                        <div className="text-right">
                          <span className="text-[10px] text-slate-500 uppercase font-mono block">Carga / Cobertura</span>
                          <span className={`text-xs font-bold font-mono px-2 py-0.5 rounded border ${dtiAnalysis.color}`}>
                            {dtiAnalysis.multiple.toFixed(1)}x {dtiAnalysis.label}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIncomeInput('')}
                          className="text-[10px] text-slate-500 hover:text-slate-300 underline font-mono"
                          title="Limpiar ingreso"
                        >
                          Limpiar
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

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
                dtiData={dtiAnalysis}
              />
            </div>
          )}

          {/* Empty State / Initial Prompt */}
          {!report && !loading && !error && (
            <div className="rounded-lg border border-slate-800/80 bg-slate-900/40 p-8 text-center space-y-3">
              <Building className="w-10 h-10 text-slate-600 mx-auto" />
              <h4 className="text-sm font-semibold text-slate-300">Central de Deudores del Sistema Financiero (BCRA)</h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Ingrese un CUIT o CUIL en el buscador superior para consultar en vivo la clasificación de deuda bancaria y cheques rechazados del período vigente.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
