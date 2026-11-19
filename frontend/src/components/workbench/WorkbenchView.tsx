import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { UniversalSearchBar } from './UniversalSearchBar'
import { ActiveSeriesTray } from './ActiveSeriesTray'
import { WorkbenchToolbar, type WorkbenchViewMode, type TimeframeOption, type ScaleMode } from './WorkbenchToolbar'
import { WorkbenchChart } from './WorkbenchChart'
import { WorkbenchStatsTable } from './WorkbenchStatsTable'
import { api } from '../../services/api'
import type {
  WorkbenchCatalogItem,
  WorkbenchSeriesData,
  MacroSeriesPoint,
  WorkbenchSeriesStats,
  CpiPoint,
} from '../../types'
import { alignTimeSeries } from '../../utils/alignment'
import { calculateRollingCorrelation, calculateSeriesStats } from '../../utils/correlation'
import { buildDeflatorModel, deflateSeries } from '../../utils/deflator'
import {
  type ExpressionMode,
  transformOriginal,
  transformBase100,
  transformMoM,
  transformYoY,
} from '../../utils/transforms'

const SERIES_COLORS = [
  '#2563eb', // Blue
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#8b5cf6', // Purple
  '#ec4899', // Pink
]

const MAX_SERIES = 5

export const WorkbenchView: React.FC = () => {
  const [catalog, setCatalog] = useState<WorkbenchCatalogItem[]>([])
  const [activeSeries, setActiveSeries] = useState<WorkbenchSeriesData[]>([])
  const [cpiPoints, setCpiPoints] = useState<CpiPoint[]>([])

  // Controls state
  const [viewMode, setViewMode] = useState<WorkbenchViewMode>('normalized')
  const [timeframe, setTimeframe] = useState<TimeframeOption>('1Y')
  const [customStart, setCustomStart] = useState<string>('')
  const [customEnd, setCustomEnd] = useState<string>('')
  const [expressionMode, setExpressionMode] = useState<ExpressionMode>('base100')
  const [scaleMode, setScaleMode] = useState<ScaleMode>('auto')
  const [adjustInflation, setAdjustInflation] = useState<boolean>(false)

  // Correlation controls
  const [seriesA, setSeriesA] = useState<string>('')
  const [seriesB, setSeriesB] = useState<string>('')
  const [correlationWindow, setCorrelationWindow] = useState<30 | 90 | 180>(90)

  // Export state
  const [isExportingExcel, setIsExportingExcel] = useState<boolean>(false)

  // 1. Fetch catalog and CPI series on mount
  useEffect(() => {
    let isMounted = true
    async function loadInitialData() {
      try {
        const cat = await api.getWorkbenchCatalog()
        if (isMounted) setCatalog(cat)
      } catch (err) {
        console.error('Failed to load workbench catalog:', err)
      }

      try {
        const cpi = await api.getMacroCpi()
        if (isMounted) setCpiPoints(cpi)
      } catch (err) {
        console.error('Failed to load CPI history:', err)
      }
    }
    loadInitialData()
    return () => {
      isMounted = false
    }
  }, [])

  // Calculate start date based on timeframe
  useEffect(() => {
    if (timeframe === 'Max') {
      setCustomStart('')
      setCustomEnd('')
      return
    }

    const now = new Date()
    const start = new Date(now)
    if (timeframe === '1M') start.setMonth(now.getMonth() - 1)
    else if (timeframe === '3M') start.setMonth(now.getMonth() - 3)
    else if (timeframe === '6M') start.setMonth(now.getMonth() - 6)
    else if (timeframe === '1Y') start.setFullYear(now.getFullYear() - 1)
    else if (timeframe === '5Y') start.setFullYear(now.getFullYear() - 5)

    setCustomStart(start.toISOString().slice(0, 10))
    setCustomEnd(now.toISOString().slice(0, 10))
  }, [timeframe])

  // 2. Fetch series data function
  const fetchSeriesData = useCallback(async (item: WorkbenchCatalogItem): Promise<MacroSeriesPoint[]> => {
    if (item.source === 'BCRA') {
      const varId = Number(item.id.replace('bcra_', ''))
      const res = await api.getMacroSeries(varId)
      return res.data.map((p: MacroSeriesPoint) => ({ fecha: p.fecha, valor: p.valor }))
    } else if (item.source === 'FX') {
      const fxType = item.id.replace('fx_', '') as 'oficial' | 'mep' | 'ccl' | 'blue'
      const history = await api.getFxHistory()
      const pts = history.rates[fxType] || []
      return pts.map((p: MacroSeriesPoint) => ({ fecha: p.fecha, valor: p.valor }))
    } else if (item.source === 'INDEC') {
      const varId = item.id.replace('indec_', '')
      const pts = await api.getIndecSeries(varId, '5Y')
      return pts.map((p: { fecha: string; valor: number }) => ({ fecha: p.fecha, valor: p.valor }))
    } else if (item.source === 'REM') {
      if (item.id === 'rem_ipc_general') {
        const cone = await api.getRemForecastCone('ipc_nivel_general')
        return cone.points.map((p) => ({ fecha: `${p.period}-01`, valor: p.mediana }))
      } else if (item.id === 'rem_tipo_cambio') {
        const cone = await api.getRemForecastCone('tipo_de_cambio')
        return cone.points.map((p) => ({ fecha: `${p.period}-01`, valor: p.mediana }))
      } else {
        const cone = await api.getRemForecastCone('tasa_politica')
        return cone.points.map((p) => ({ fecha: `${p.period}-01`, valor: p.mediana }))
      }
    }
    return []
  }, [])

  // 3. Add series handler
  const handleSelectSeries = useCallback(
    async (item: WorkbenchCatalogItem) => {
      if (activeSeries.length >= MAX_SERIES) return
      if (activeSeries.some((s) => s.id === item.id)) return

      const assignedColor = SERIES_COLORS[activeSeries.length % SERIES_COLORS.length]

      const newSeries: WorkbenchSeriesData = {
        id: item.id,
        source: item.source,
        name: item.name,
        color: assignedColor,
        unit: item.unit,
        frequency: item.frequency,
        isArs: item.isArs,
        status: 'loading',
        points: [],
      }

      setActiveSeries((prev) => [...prev, newSeries])

      try {
        const pts = await fetchSeriesData(item)
        setActiveSeries((prev) =>
          prev.map((s) =>
            s.id === item.id ? { ...s, points: pts, status: 'success' } : s
          )
        )
      } catch (err) {
        console.error(`Failed to load data for ${item.id}:`, err)
        setActiveSeries((prev) =>
          prev.map((s) =>
            s.id === item.id ? { ...s, status: 'delayed' } : s
          )
        )
      }
    },
    [activeSeries, fetchSeriesData]
  )

  // 4. Remove series handler
  const handleRemoveSeries = useCallback((id: string) => {
    setActiveSeries((prev) => prev.filter((s) => s.id !== id))
  }, [])

  // Update default Series A & B for correlation
  useEffect(() => {
    if (activeSeries.length >= 2) {
      if (!seriesA || !activeSeries.some((s) => s.id === seriesA)) {
        setSeriesA(activeSeries[0].id)
      }
      if (!seriesB || !activeSeries.some((s) => s.id === seriesB) || seriesB === activeSeries[0].id) {
        setSeriesB(activeSeries[1].id)
      }
    } else if (activeSeries.length === 1) {
      setSeriesA(activeSeries[0].id)
      setSeriesB('')
    } else {
      setSeriesA('')
      setSeriesB('')
    }
  }, [activeSeries, seriesA, seriesB])

  // Check if any series is ARS eligible for inflation adjustment
  const hasArsSeries = useMemo(() => {
    return activeSeries.some((s) => s.isArs)
  }, [activeSeries])

  // 5. Compute effective points (deflated if switch active)
  const deflatorModel = useMemo(() => {
    return buildDeflatorModel(cpiPoints)
  }, [cpiPoints])

  const effectiveSeries = useMemo(() => {
    return activeSeries.map((s) => {
      let pts = s.points
      // Apply inflation adjustment if requested and eligible
      if (adjustInflation && s.isArs && deflatorModel.hasCpiData) {
        const { deflatedPoints } = deflateSeries(pts, deflatorModel)
        pts = deflatedPoints
      }
      return {
        ...s,
        points: pts,
      }
    })
  }, [activeSeries, adjustInflation, deflatorModel])

  // 6. Aligned data for normalized time-series chart
  const alignedData = useMemo(() => {
    const entries = effectiveSeries.map((s) => ({
      key: s.id,
      frequency: s.frequency,
      points: s.points,
    }))

    return alignTimeSeries(entries, {
      expressionMode,
      startDate: customStart || undefined,
      endDate: customEnd || undefined,
    })
  }, [effectiveSeries, expressionMode, customStart, customEnd])

  // 7. Rolling correlation computation
  const { correlationPoints, isDownsampled } = useMemo(() => {
    const sA = effectiveSeries.find((s) => s.id === seriesA)
    const sB = effectiveSeries.find((s) => s.id === seriesB)

    if (!sA || !sB || sA.id === sB.id) {
      return { correlationPoints: [], isDownsampled: false }
    }

    let ptsA = sA.points
    let ptsB = sB.points
    if (customStart) {
      ptsA = ptsA.filter((p) => p.fecha >= customStart)
      ptsB = ptsB.filter((p) => p.fecha >= customStart)
    }
    if (customEnd) {
      ptsA = ptsA.filter((p) => p.fecha <= customEnd)
      ptsB = ptsB.filter((p) => p.fecha <= customEnd)
    }

    const res = calculateRollingCorrelation(
      { points: ptsA, frequency: sA.frequency },
      { points: ptsB, frequency: sB.frequency },
      correlationWindow
    )

    return {
      correlationPoints: res.points,
      isDownsampled: res.isDownsampled,
    }
  }, [effectiveSeries, seriesA, seriesB, correlationWindow, customStart, customEnd])

  // 8. Statistics table summary
  const statsList = useMemo<WorkbenchSeriesStats[]>(() => {
    return effectiveSeries.map((s) => {
      let pts = s.points

      if (expressionMode === 'mom') {
        pts = transformMoM(pts, s.frequency)
      } else if (expressionMode === 'yoy') {
        pts = transformYoY(pts, s.frequency)
      }

      if (customStart) pts = pts.filter((p) => p.fecha >= customStart)
      if (customEnd) pts = pts.filter((p) => p.fecha <= customEnd)

      if (expressionMode === 'base100') {
        pts = transformBase100(pts)
      } else if (expressionMode === 'original') {
        pts = transformOriginal(pts)
      }

      return calculateSeriesStats(s.id, s.name, s.source, pts, s.unit)
    })
  }, [effectiveSeries, expressionMode, customStart, customEnd])

  // 9. Export to CSV handler
  const handleExportCsv = useCallback(() => {
    if (alignedData.length === 0) return

    const keys = Object.keys(alignedData[0])
    // Column headers row
    const headerRow = keys
      .map((k) => {
        if (k === 'fecha') return 'fecha'
        const s = activeSeries.find((x) => x.id === k)
        return s ? `"${s.source}_${s.name.replace(/"/g, '""')}"` : `"${k}"`
      })
      .join(',')

    const dataRows = alignedData.map((row) =>
      keys.map((k) => (row[k] !== null && row[k] !== undefined ? row[k] : '')).join(',')
    )

    const csvContent = '\uFEFF' + [headerRow, ...dataRows].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `banco_de_trabajo_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }, [alignedData, activeSeries])

  // 10. Export to Excel handler
  const handleExportExcel = useCallback(async () => {
    if (alignedData.length === 0) return
    setIsExportingExcel(true)
    try {
      const seriesHeaders = activeSeries.map((s) => ({
        key: s.id,
        name: `[${s.source}] ${s.name}`,
      }))

      const blob = await api.downloadWorkbenchExcel({
        aligned_data: alignedData,
        stats_data: statsList,
        series_headers: seriesHeaders,
      })

      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `banco_de_trabajo_${new Date().toISOString().slice(0, 10)}.xlsx`)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Failed to export Excel:', err)
    } finally {
      setIsExportingExcel(false)
    }
  }, [alignedData, statsList, activeSeries])

  return (
    <div className="space-y-6">
      {/* Title banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
            Banco de trabajo
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Pool universal de datos, normalización multivariable y motor de correlación cruzada
          </p>
        </div>
      </div>

      {/* Universal Search Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 shadow-sm">
        <UniversalSearchBar
          catalog={catalog}
          activeSeriesIds={activeSeries.map((s) => s.id)}
          onSelectSeries={handleSelectSeries}
          maxSeriesReached={activeSeries.length >= MAX_SERIES}
        />

        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
          <ActiveSeriesTray
            seriesList={activeSeries}
            onRemoveSeries={handleRemoveSeries}
            maxSeries={MAX_SERIES}
          />
        </div>
      </div>

      {/* Controls & Toolbar */}
      <WorkbenchToolbar
        viewMode={viewMode}
        onChangeViewMode={setViewMode}
        timeframe={timeframe}
        onChangeTimeframe={setTimeframe}
        customStart={customStart}
        customEnd={customEnd}
        onChangeCustomDates={(s, e) => {
          setCustomStart(s)
          setCustomEnd(e)
        }}
        expressionMode={expressionMode}
        onChangeExpressionMode={setExpressionMode}
        scaleMode={scaleMode}
        onChangeScaleMode={setScaleMode}
        adjustInflation={adjustInflation}
        onToggleAdjustInflation={setAdjustInflation}
        hasArsSeries={hasArsSeries}
        activeSeries={activeSeries}
        seriesA={seriesA}
        seriesB={seriesB}
        onChangeSeriesA={setSeriesA}
        onChangeSeriesB={setSeriesB}
        correlationWindow={correlationWindow}
        onChangeCorrelationWindow={setCorrelationWindow}
        isDownsampled={isDownsampled}
        onExportCsv={handleExportCsv}
        onExportExcel={handleExportExcel}
        isExportingExcel={isExportingExcel}
      />

      {/* Main Chart Area */}
      <WorkbenchChart
        viewMode={viewMode}
        expressionMode={expressionMode}
        scaleMode={scaleMode}
        alignedData={alignedData}
        activeSeries={activeSeries}
        correlationPoints={correlationPoints}
        seriesAName={activeSeries.find((s) => s.id === seriesA)?.name}
        seriesBName={activeSeries.find((s) => s.id === seriesB)?.name}
      />

      {/* Summary Statistics Table */}
      <WorkbenchStatsTable stats={statsList} expressionMode={expressionMode} />
    </div>
  )
}

