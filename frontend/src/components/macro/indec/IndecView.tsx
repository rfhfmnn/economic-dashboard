import React, { useEffect, useState, useMemo } from 'react'
import { AlertCircle, AlertTriangle, RefreshCw } from 'lucide-react'
import { api } from '../../../services/api'
import type {
  IndecCatalogItem,
  IndecIndicator,
  IndecSeriesPoint,
  IndecSummaryResponse,
  VariableCatalogItem,
} from '../../../types'
import { MacroChart, type ChartSeries, type Timeframe } from '../MacroChart'
import { MetricCard } from '../MetricCard'
import { VariablePicker } from '../VariablePicker'

const PRIMARY_COLORS = ['#3b82f6', '#06b6d4', '#10b981', '#38bdf8', '#14b8a6']
const SECONDARY_COLORS = ['#8b5cf6', '#f59e0b', '#ec4899', '#a855f7', '#fb923c']

export type IndecTimeframe = '1Y' | '2Y' | '5Y' | 'Max'
const INDEC_TIMEFRAMES: IndecTimeframe[] = ['1Y', '2Y', '5Y', 'Max']

export const IndecView: React.FC = () => {
  const [summary, setSummary] = useState<IndecSummaryResponse | null>(null)
  const [catalog, setCatalog] = useState<IndecCatalogItem[]>([])

  // Variable selection state for primary (left) and secondary (right) axes
  const [primaryIds, setPrimaryIds] = useState<string[]>(['ipc_general'])
  const [secondaryIds, setSecondaryIds] = useState<string[]>([])

  // In-memory cache for series data: key is `${variable_id}_${timeframe}`
  const [seriesCache, setSeriesCache] = useState<
    Record<string, IndecSeriesPoint[]>
  >({})

  const [timeframe, setTimeframe] = useState<IndecTimeframe>('1Y')
  const [loading, setLoading] = useState<boolean>(true)
  const [refreshing, setRefreshing] = useState<boolean>(false)
  const [chartLoading, setChartLoading] = useState<boolean>(false)
  const [error, setError] = useState<{ message: string; isAuthError: boolean } | null>(null)

  // Fetch initial summary and catalog
  const loadDashboardData = async (forceRefresh: boolean = false) => {
    try {
      if (forceRefresh) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }
      setError(null)

      const [summaryRes, catalogRes] = await Promise.all([
        api.getIndecSummary(forceRefresh),
        api.getIndecCatalog(),
      ])

      setSummary(summaryRes)
      setCatalog(catalogRes)

      if (forceRefresh) {
        // Clear in-memory series cache on manual sync
        setSeriesCache({})
      }
    } catch (err: any) {
      const msg = err?.message || 'Error al conectar con los servicios del INDEC.'
      const isAuth =
        err?.status === 401 ||
        err?.statusCode === 401 ||
        msg.includes('401') ||
        msg.toLowerCase().includes('indec_api_token')
      setError({ message: msg, isAuthError: isAuth })
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const handleRefresh = () => {
    loadDashboardData(true)
  }

  // Fetch missing series data when active variables or timeframe change
  useEffect(() => {
    const allSelectedIds = Array.from(new Set([...primaryIds, ...secondaryIds]))
    if (allSelectedIds.length === 0) return

    const missingIds = allSelectedIds.filter(
      (id) => !seriesCache[`${id}_${timeframe}`]
    )

    if (missingIds.length === 0) return

    let isMounted = true
    const fetchMissing = async () => {
      try {
        setChartLoading(true)
        const results = await Promise.all(
          missingIds.map((id) =>
            api
              .getIndecSeries(id, timeframe)
              .then((points) => ({ id, points }))
              .catch((err) => {
                console.error(`Error fetching INDEC series ${id}:`, err)
                return { id, points: [] as IndecSeriesPoint[] }
              })
          )
        )

        if (!isMounted) return

        setSeriesCache((prev) => {
          const updated = { ...prev }
          results.forEach((item) => {
            if (item.points && item.points.length > 0) {
              updated[`${item.id}_${timeframe}`] = item.points
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
  }, [primaryIds, secondaryIds, timeframe])

  // Initial load on mount
  useEffect(() => {
    loadDashboardData()
  }, [])

  // Adapt INDEC catalog items to VariableCatalogItem compatibility for VariablePicker
  const catalogForPicker = useMemo<VariableCatalogItem[]>(() => {
    return catalog.map((item) => ({
      idVariable: item.variable_id,
      descripcion: item.name,
      categoria: item.category,
      unit: item.unit,
    }))
  }, [catalog])

  // Build multi-series structure for MacroChart
  const chartSeries = useMemo<ChartSeries[]>(() => {
    const seriesList: ChartSeries[] = []

    primaryIds.forEach((id, idx) => {
      const cachedPoints = seriesCache[`${id}_${timeframe}`] || []
      const catItem = catalog.find((c) => c.variable_id === id)
      const indItem = summary?.indicators.find((i) => i.variable_id === id)
      const title = catItem?.name || indItem?.name || id
      const unit = catItem?.unit || indItem?.unit || ''

      seriesList.push({
        id,
        title,
        unit,
        data: cachedPoints,
        axis: 'left',
        color: PRIMARY_COLORS[idx % PRIMARY_COLORS.length],
      })
    })

    secondaryIds.forEach((id, idx) => {
      const cachedPoints = seriesCache[`${id}_${timeframe}`] || []
      const catItem = catalog.find((c) => c.variable_id === id)
      const indItem = summary?.indicators.find((i) => i.variable_id === id)
      const title = catItem?.name || indItem?.name || id
      const unit = catItem?.unit || indItem?.unit || ''

      seriesList.push({
        id,
        title,
        unit,
        data: cachedPoints,
        axis: 'right',
        color: SECONDARY_COLORS[idx % SECONDARY_COLORS.length],
        strokeDasharray: '4 4',
      })
    })

    return seriesList
  }, [primaryIds, secondaryIds, seriesCache, timeframe, catalog, summary])

  const totalObservations = useMemo(() => {
    return chartSeries.reduce((acc, s) => acc + s.data.length, 0)
  }, [chartSeries])

  // Clicking a top KPI card focuses it as the sole primary series
  const handleSelectCard = (variableId: string) => {
    setPrimaryIds([variableId])
    setSecondaryIds((prev) => prev.filter((id) => id !== variableId))
  }

  // Toggling primary axis variable
  const handleTogglePrimary = (id: string) => {
    if (primaryIds.includes(id)) {
      if (primaryIds.length > 1) {
        setPrimaryIds(primaryIds.filter((p) => p !== id))
      }
    } else {
      setPrimaryIds([...primaryIds, id])
      setSecondaryIds(secondaryIds.filter((s) => s !== id))
    }
  }

  // Toggling secondary axis variable
  const handleToggleSecondary = (id: string) => {
    if (secondaryIds.includes(id)) {
      setSecondaryIds(secondaryIds.filter((s) => s !== id))
    } else {
      setSecondaryIds([...secondaryIds, id])
      if (primaryIds.includes(id) && primaryIds.length > 1) {
        setPrimaryIds(primaryIds.filter((p) => p !== id))
      }
    }
  }

  const handleRemovePrimary = (id: string) => {
    if (primaryIds.length > 1) {
      setPrimaryIds(primaryIds.filter((p) => p !== id))
    }
  }

  const handleRemoveSecondary = (id: string) => {
    setSecondaryIds(secondaryIds.filter((s) => s !== id))
  }

  // Loading skeleton state
  if (loading) {
    return (
      <div className="space-y-6 animate-pulse" data-testid="indec-loading-skeleton">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div
              key={i}
              className="h-28 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
            />
          ))}
        </div>
        <div className="h-96 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800" />
      </div>
    )
  }

  // Error state: 401 missing token or 502/network failure
  if (error) {
    if (error.isAuthError) {
      return (
        <div
          data-testid="indec-auth-error-banner"
          className="rounded-lg border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-950/20 p-6 text-center space-y-3"
        >
          <AlertTriangle className="w-8 h-8 text-amber-600 dark:text-amber-400 mx-auto" />
          <h3 className="text-base font-semibold text-amber-900 dark:text-amber-200">
            Token de API INDEC no configurado
          </h3>
          <p className="text-xs text-amber-800 dark:text-amber-300 max-w-lg mx-auto">
            Para acceder a las estadísticas oficiales de la API del INDEC, configure la variable de
            entorno <code className="font-mono bg-amber-100 dark:bg-amber-900/40 px-1 py-0.5 rounded font-bold">INDEC_API_TOKEN</code> en
            el archivo <code className="font-mono">.env</code> del backend y reinicie el servicio.
          </p>
          <p className="text-[11px] text-amber-700 dark:text-amber-400 font-sans">
            (Detalle del backend: {error.message})
          </p>
          <button
            type="button"
            data-testid="indec-retry-button"
            onClick={() => loadDashboardData(false)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium transition-colors cursor-pointer shadow-sm"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reintentar conexión</span>
          </button>
        </div>
      )
    }

    return (
      <div
        data-testid="indec-network-error-banner"
        className="rounded-lg border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/20 p-6 text-center space-y-3"
      >
        <AlertCircle className="w-8 h-8 text-rose-500 dark:text-rose-400 mx-auto" />
        <h3 className="text-base font-semibold text-rose-800 dark:text-rose-200">
          Error de conexión con INDEC
        </h3>
        <p className="text-xs text-rose-600 dark:text-rose-300 max-w-md mx-auto">
          {error.message}
        </p>
        <button
          type="button"
          data-testid="indec-retry-button"
          onClick={() => loadDashboardData(false)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium transition-colors cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Reintentar conexión</span>
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header controls row: Timestamp and Sync button */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            Estadísticas oficiales INDEC (economía real)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Precios, actividad económica, empleo, salarios y balanza comercial argentina
          </p>
        </div>

        <div className="flex items-center gap-3 self-end sm:self-auto">
          {summary?.last_updated && (
            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-sans tabular-nums hidden sm:inline">
              Actualizado:{' '}
              {new Date(summary.last_updated).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          )}
          <button
            type="button"
            data-testid="indec-refresh-button"
            onClick={handleRefresh}
            disabled={refreshing || loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-700/80 text-slate-700 dark:text-slate-200 text-xs font-medium transition-all shadow-sm hover:border-slate-300 dark:hover:border-slate-600 disabled:opacity-50 cursor-pointer"
            title="Sincronizar últimas observaciones con la API del INDEC"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-blue-500 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'
                }`}
            />
            <span>{refreshing ? 'Sincronizando...' : 'Actualizar datos'}</span>
          </button>
        </div>
      </div>

      {/* Top Indicators KPI Grid: 8 key indicators */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.isArray(summary?.indicators) &&
          summary.indicators.map((ind: IndecIndicator) => {
            const isActive = primaryIds.includes(ind.variable_id)
            const cachedSeries = seriesCache[`${ind.variable_id}_${timeframe}`]
            const pointsForSparkline =
              ind.recent_points && ind.recent_points.length >= 2
                ? ind.recent_points
                : cachedSeries && cachedSeries.length >= 2
                ? cachedSeries.slice(-15).map((p) => p.valor)
                : undefined

            return (
              <MetricCard
                key={ind.variable_id}
                title={ind.name}
                value={ind.value !== null ? ind.value : '-'}
                date={ind.date || undefined}
                category={ind.category}
                unit={ind.unit}
                momDelta={ind.delta_mom ?? undefined}
                yoyDelta={ind.delta_yoy ?? undefined}
                recentPoints={pointsForSparkline}
                active={isActive}
                onClick={() => handleSelectCard(ind.variable_id)}
              />
            )
          })}
      </div>

      {/* Controls Toolbar: VariablePicker + Timeframe Switcher + Active Stats */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white dark:bg-slate-900/40 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
          <VariablePicker
            catalog={catalogForPicker}
            selectedPrimaryIds={primaryIds}
            selectedSecondaryIds={secondaryIds}
            onTogglePrimary={handleTogglePrimary}
            onToggleSecondary={handleToggleSecondary}
            onRemovePrimary={handleRemovePrimary}
            onRemoveSecondary={handleRemoveSecondary}
            title="Selector de variables INDEC"
            searchPlaceholder="Buscar variable INDEC por nombre o categoría..."
          />

          <div className="flex items-center gap-3 flex-wrap">
            {/* Timeframe selector buttons (1Y, 2Y, 5Y, Max) */}
            <div
              className="inline-flex rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 p-0.5"
              role="group"
              aria-label="Plazo temporal"
            >
              {INDEC_TIMEFRAMES.map((tf) => (
                <button
                  key={tf}
                  type="button"
                  data-testid={`timeframe-${tf.toLowerCase()}`}
                  onClick={() => setTimeframe(tf)}
                  className={`px-2.5 py-1 text-xs font-sans rounded transition-colors cursor-pointer ${timeframe === tf
                    ? 'bg-blue-600 text-white font-medium shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-900'
                    }`}
                >
                  {tf}
                </button>
              ))}
            </div>

            <span className="text-[11px] font-sans tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
              {chartSeries.length} variable{chartSeries.length > 1 ? 's' : ''} activa{chartSeries.length > 1 ? 's' : ''} •{' '}
              {totalObservations.toLocaleString('es-AR')} puntos
            </span>
          </div>
        </div>

        {/* Time-Series Chart */}
        <MacroChart
          series={chartSeries}
          timeframe={timeframe === '2Y' ? 'Custom' : (timeframe as Timeframe)}
          onTimeframeChange={(tf) => {
            if (tf === '1Y' || tf === '5Y' || tf === 'Max') {
              setTimeframe(tf)
            }
          }}
          loading={chartLoading}
        />
      </div>
    </div>
  )
}
