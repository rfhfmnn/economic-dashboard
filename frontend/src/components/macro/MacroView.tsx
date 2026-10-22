import React, { useEffect, useState } from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { api } from '../../services/api'
import type {
  FxSpreadsResponse,
  IndicatorsSummaryResponse,
  MacroSeriesPoint,
  VariableCatalogItem,
} from '../../types'
import { FxSpreadChart } from './FxSpreadChart'
import { MacroChart, type Timeframe } from './MacroChart'
import { MetricCard } from './MetricCard'
import { VariablePicker } from './VariablePicker'

export const MacroView: React.FC = () => {
  const [summary, setSummary] = useState<IndicatorsSummaryResponse | null>(null)
  const [catalog, setCatalog] = useState<VariableCatalogItem[]>([])
  const [fxData, setFxData] = useState<FxSpreadsResponse | null>(null)

  // Primary & Secondary active series
  const [primaryId, setPrimaryId] = useState<number>(1) // Default: Reservas Internacionales (#1)
  const [secondaryId, setSecondaryId] = useState<number | undefined>(undefined)

  const [primaryTitle, setPrimaryTitle] = useState<string>('Reservas Internacionales')
  const [secondaryTitle, setSecondaryTitle] = useState<string | undefined>(undefined)

  const [primarySeries, setPrimarySeries] = useState<MacroSeriesPoint[]>([])
  const [secondarySeries, setSecondarySeries] = useState<MacroSeriesPoint[]>([])

  const [timeframe, setTimeframe] = useState<Timeframe>('1Y')
  const [loading, setLoading] = useState<boolean>(true)
  const [chartLoading, setChartLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch initial summary, catalog, and FX rates
  const loadDashboardData = async () => {
    try {
      setLoading(true)
      setError(null)
      const [summaryRes, catalogRes, fxRes] = await Promise.all([
        api.getMacroSummary(),
        api.getMacroCatalog(),
        api.getFxSpreads(),
      ])
      setSummary(summaryRes)
      setCatalog(catalogRes)
      setFxData(fxRes)
    } catch (err: any) {
      setError(err?.message || 'Error al conectar con los servicios macroeconómicos del BCRA.')
    } finally {
      setLoading(false)
    }
  }

  // Fetch primary series when primaryId changes
  useEffect(() => {
    const fetchPrimary = async () => {
      try {
        setChartLoading(true)
        const res = await api.getMacroSeries(primaryId)
        setPrimarySeries(res.data)
        setPrimaryTitle(res.variable_name || `Serie #${primaryId}`)
      } catch (err) {
        console.error('Error fetching primary series:', err)
      } finally {
        setChartLoading(false)
      }
    }
    fetchPrimary()
  }, [primaryId])

  // Fetch secondary series when secondaryId changes
  useEffect(() => {
    if (!secondaryId) {
      setSecondarySeries([])
      setSecondaryTitle(undefined)
      return
    }

    const fetchSecondary = async () => {
      try {
        const res = await api.getMacroSeries(secondaryId)
        setSecondarySeries(res.data)
        setSecondaryTitle(res.variable_name || `Serie #${secondaryId}`)
      } catch (err) {
        console.error('Error fetching secondary series:', err)
      }
    }
    fetchSecondary()
  }, [secondaryId])

  useEffect(() => {
    loadDashboardData()
  }, [])

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 rounded-lg bg-slate-900 border border-slate-800"></div>
          ))}
        </div>
        <div className="h-96 rounded-lg bg-slate-900 border border-slate-800"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-rose-900/50 bg-rose-950/20 p-6 text-center space-y-3">
        <AlertCircle className="w-8 h-8 text-rose-400 mx-auto" />
        <h3 className="text-base font-semibold text-rose-200">Error de Carga Macroeconómica</h3>
        <p className="text-xs text-rose-300 max-w-md mx-auto">{error}</p>
        <button
          onClick={loadDashboardData}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Reintentar Conexión</span>
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Top Indicators KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {summary?.indicators?.slice(0, 8).map((ind) => (
          <MetricCard
            key={ind.idVariable}
            title={ind.descripcion}
            value={ind.valor}
            date={ind.fecha}
            category={ind.categoria}
            active={ind.idVariable === primaryId}
            onClick={() => setPrimaryId(ind.idVariable)}
          />
        ))}
      </div>

      {/* Main Interactive Time-Series Section */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-900/40 p-3 rounded-lg border border-slate-800">
          <VariablePicker
            catalog={catalog}
            selectedPrimaryId={primaryId}
            selectedSecondaryId={secondaryId}
            onSelectPrimary={(id) => setPrimaryId(id)}
            onSelectSecondary={(id) => setSecondaryId(id)}
          />

          <span className="text-[11px] font-mono text-slate-500">
            {primarySeries.length} observaciones registradas
          </span>
        </div>

        <MacroChart
          primaryTitle={primaryTitle}
          primaryData={primarySeries}
          secondaryTitle={secondaryTitle}
          secondaryData={secondarySeries}
          timeframe={timeframe}
          onTimeframeChange={setTimeframe}
          loading={chartLoading}
        />
      </div>

      {/* FX Monitor & Spreads Board */}
      <FxSpreadChart fxData={fxData} />
    </div>
  )
}
