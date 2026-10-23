import React, { useEffect, useState, useMemo } from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { api } from '../../services/api'
import {
  FxSpreadsResponse,
  IndicatorsSummaryResponse,
  MacroSeriesPoint,
  VariableCatalogItem,
  KNOWN_BCRA_VARIABLES,
} from '../../types'
import { FxSpreadChart } from './FxSpreadChart'
import { MacroChart, type Timeframe, type ChartSeries } from './MacroChart'
import { MetricCard } from './MetricCard'
import { VariablePicker } from './VariablePicker'

const PRIMARY_COLORS = ['#3b82f6', '#06b6d4', '#10b981', '#38bdf8', '#14b8a6']
const SECONDARY_COLORS = ['#8b5cf6', '#f59e0b', '#ec4899', '#a855f7', '#fb923c']

export const MacroView: React.FC = () => {
  const [summary, setSummary] = useState<IndicatorsSummaryResponse | null>(null)
  const [catalog, setCatalog] = useState<VariableCatalogItem[]>([])
  const [fxData, setFxData] = useState<FxSpreadsResponse | null>(null)

  // Multi-variable selection state for Left (Principal) and Right (Dual) axes
  const [primaryIds, setPrimaryIds] = useState<number[]>([1]) // Default: Reservas internacionales (#1)
  const [secondaryIds, setSecondaryIds] = useState<number[]>([])

  // In-memory cache for series data to avoid refetching on toggling
  const [seriesCache, setSeriesCache] = useState<
    Record<number, { title: string; data: MacroSeriesPoint[] }>
  >({})

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

  // Fetch missing series data whenever primaryIds or secondaryIds change
  useEffect(() => {
    const allSelectedIds = Array.from(new Set([...primaryIds, ...secondaryIds]))
    const missingIds = allSelectedIds.filter(
      (id) => !seriesCache[id] || !seriesCache[id].data || seriesCache[id].data.length === 0
    )

    if (missingIds.length === 0) return

    let isMounted = true
    const fetchMissing = async () => {
      try {
        setChartLoading(true)
        const results = await Promise.all(
          missingIds.map((id) =>
            api
              .getMacroSeries(id)
              .then((res) => {
                const catItem = catalog.find((c) => c.idVariable === id)
                const title =
                  catItem?.descripcion ||
                  (res.variable_name && !res.variable_name.startsWith('Serie #') ? res.variable_name : null) ||
                  KNOWN_BCRA_VARIABLES[id]?.name ||
                  `Serie #${id}`
                return {
                  id,
                  title,
                  data: res.data || [],
                }
              })
              .catch((err) => {
                console.error(`Error fetching series #${id}:`, err)
                return { id, title: KNOWN_BCRA_VARIABLES[id]?.name || `Serie #${id}`, data: [] }
              })
          )
        )

        if (!isMounted) return

        setSeriesCache((prev) => {
          const updated = { ...prev }
          results.forEach((item) => {
            // Only cache valid series with data so temporary network drops can be retried cleanly
            if (item.data && item.data.length > 0) {
              updated[item.id] = { title: item.title, data: item.data }
            }
          })
          return updated
        })
      } finally {
        if (isMounted) {
          setChartLoading(false)
        }
      }
    }

    fetchMissing()
    return () => {
      isMounted = false
    }
  }, [primaryIds, secondaryIds])

  useEffect(() => {
    loadDashboardData()
  }, [])

  // Build multi-series structure for MacroChart
  const chartSeries = useMemo<ChartSeries[]>(() => {
    const seriesList: ChartSeries[] = []

    primaryIds.forEach((id, idx) => {
      const cached = seriesCache[id]
      const catItem = catalog.find((c) => c.idVariable === id)
      const title =
        catItem?.descripcion ||
        (cached?.title && !cached.title.startsWith('Serie #') ? cached.title : null) ||
        KNOWN_BCRA_VARIABLES[id]?.name ||
        `Serie #${id}`
      const unit = catItem?.unit || KNOWN_BCRA_VARIABLES[id]?.unit || ''
      seriesList.push({
        id,
        title,
        unit,
        data: cached?.data || [],
        axis: 'left',
        color: PRIMARY_COLORS[idx % PRIMARY_COLORS.length],
      })
    })

    secondaryIds.forEach((id, idx) => {
      const cached = seriesCache[id]
      const catItem = catalog.find((c) => c.idVariable === id)
      const title =
        catItem?.descripcion ||
        (cached?.title && !cached.title.startsWith('Serie #') ? cached.title : null) ||
        KNOWN_BCRA_VARIABLES[id]?.name ||
        `Serie #${id}`
      const unit = catItem?.unit || KNOWN_BCRA_VARIABLES[id]?.unit || ''
      seriesList.push({
        id,
        title,
        unit,
        data: cached?.data || [],
        axis: 'right',
        color: SECONDARY_COLORS[idx % SECONDARY_COLORS.length],
        strokeDasharray: '4 4',
      })
    })

    return seriesList
  }, [primaryIds, secondaryIds, seriesCache, catalog])

  const totalObservations = useMemo(() => {
    return chartSeries.reduce((acc, s) => acc + s.data.length, 0)
  }, [chartSeries])

  // Handler for clicking a top KPI indicator card: focuses the chart on that variable
  const handleSelectCard = (id: number) => {
    setPrimaryIds([id])
    setSecondaryIds((prev) => prev.filter((s) => s !== id))
  }

  // Handlers for variable toggling in catalog / multiselect
  const handleTogglePrimary = (id: number) => {
    if (primaryIds.includes(id)) {
      if (primaryIds.length > 1) {
        setPrimaryIds(primaryIds.filter((p) => p !== id))
      }
    } else {
      setPrimaryIds([...primaryIds, id])
      setSecondaryIds(secondaryIds.filter((s) => s !== id))
    }
  }

  const handleToggleSecondary = (id: number) => {
    if (secondaryIds.includes(id)) {
      setSecondaryIds(secondaryIds.filter((s) => s !== id))
    } else {
      setSecondaryIds([...secondaryIds, id])
      if (primaryIds.includes(id) && primaryIds.length > 1) {
        setPrimaryIds(primaryIds.filter((p) => p !== id))
      }
    }
  }

  const handleRemovePrimary = (id: number) => {
    if (primaryIds.length > 1) {
      setPrimaryIds(primaryIds.filter((p) => p !== id))
    }
  }

  const handleRemoveSecondary = (id: number) => {
    setSecondaryIds(secondaryIds.filter((s) => s !== id))
  }

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
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium transition-colors cursor-pointer"
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
        {Array.isArray(summary?.indicators) &&
          summary.indicators.slice(0, 8).map((ind) => (
            <MetricCard
              key={ind.idVariable}
              title={ind.descripcion}
              value={ind.valor}
              date={ind.fecha}
              category={ind.categoria}
              unit={ind.unit}
              active={primaryIds.includes(ind.idVariable)}
              onClick={() => handleSelectCard(ind.idVariable)}
            />
          ))}
      </div>

      {/* Main Interactive Time-Series Section with Multi-Select */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-900/40 p-3 rounded-lg border border-slate-800">
          <VariablePicker
            catalog={catalog}
            selectedPrimaryIds={primaryIds}
            selectedSecondaryIds={secondaryIds}
            onTogglePrimary={handleTogglePrimary}
            onToggleSecondary={handleToggleSecondary}
            onRemovePrimary={handleRemovePrimary}
            onRemoveSecondary={handleRemoveSecondary}
          />

          <span className="text-[11px] font-mono text-slate-500">
            {chartSeries.length} variable{chartSeries.length > 1 ? 's' : ''} activa{chartSeries.length > 1 ? 's' : ''} • {totalObservations.toLocaleString('es-AR')} puntos
          </span>
        </div>

        <MacroChart
          series={chartSeries}
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
