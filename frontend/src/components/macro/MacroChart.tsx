import React, { useMemo, useState, useRef } from 'react'
import { Calendar, Camera, FileSpreadsheet } from 'lucide-react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts'
import type { MacroSeriesPoint } from '../../types'
import { KNOWN_BCRA_VARIABLES } from '../../types'

export type Timeframe = '1M' | '3M' | '6M' | '1Y' | '5Y' | 'Max' | 'Custom'

export interface ChartSeries {
  id: number | string
  title: string
  unit?: string
  data: MacroSeriesPoint[]
  axis: 'left' | 'right'
  color: string
  strokeDasharray?: string
}

export interface MacroChartProps {
  series?: ChartSeries[]
  primaryTitle?: string
  primaryData?: MacroSeriesPoint[]
  secondaryTitle?: string
  secondaryData?: MacroSeriesPoint[]
  timeframe: Timeframe
  onTimeframeChange: (tf: Timeframe) => void
  loading?: boolean
  customStartDate?: string
  customEndDate?: string
  onCustomDateChange?: (start: string, end: string) => void
}

const TIMEFRAMES: Timeframe[] = ['1M', '3M', '6M', '1Y', '5Y', 'Max']

export const MacroChart: React.FC<MacroChartProps> = ({
  series,
  primaryTitle,
  primaryData,
  secondaryTitle,
  secondaryData,
  timeframe,
  onTimeframeChange,
  loading = false,
  customStartDate: propStartDate,
  customEndDate: propEndDate,
  onCustomDateChange,
}) => {
  const [internalStartDate, setInternalStartDate] = useState<string>('')
  const [internalEndDate, setInternalEndDate] = useState<string>('')
  const [showCustomPicker, setShowCustomPicker] = useState<boolean>(false)

  const startDate = propStartDate !== undefined ? propStartDate : internalStartDate
  const endDate = propEndDate !== undefined ? propEndDate : internalEndDate

  const handleStartDateChange = (val: string) => {
    setInternalStartDate(val)
    if (onCustomDateChange) onCustomDateChange(val, endDate)
  }

  const handleEndDateChange = (val: string) => {
    setInternalEndDate(val)
    if (onCustomDateChange) onCustomDateChange(startDate, val)
  }

  const chartContainerRef = useRef<HTMLDivElement>(null)

  const handleDownloadCsv = () => {
    if (chartData.length === 0 || effectiveSeries.length === 0) return

    const headerCols = [
      'Fecha',
      ...effectiveSeries.map((s) => {
        const unit = s.unit ? ` (${s.unit})` : ''
        const axis = s.axis === 'left' ? 'Principal' : 'Dual'
        return `"${s.title.replace(/"/g, '""')}${unit} [${axis}]"`
      }),
    ]

    const rows = chartData.map((item) => {
      const cols = [item.fecha]
      effectiveSeries.forEach((s) => {
        const val = item[`var_${s.id}`]
        cols.push(val !== undefined && val !== null ? String(val) : '')
      })
      return cols.join(';')
    })

    const csvContent = '\uFEFF' + [headerCols.join(';'), ...rows].join('\r\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const dateStr = new Date().toISOString().split('T')[0]
    a.download = `series_macro_bcra_${timeframe.toLowerCase()}_${dateStr}.csv`
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)
  }

  const handleDownloadPng = () => {
    const container = chartContainerRef.current
    if (!container) return

    const svgElement = container.querySelector('svg.recharts-surface') as SVGSVGElement | null
    if (!svgElement) return

    const rect = svgElement.getBoundingClientRect()
    const svgWidth = Math.max(700, rect.width || 800)
    const svgHeight = Math.max(300, rect.height || 320)

    const scale = 2
    const paddingX = 28
    const headerHeight = 72
    const footerHeight = 28

    const totalWidth = svgWidth + paddingX * 2
    const totalHeight = svgHeight + headerHeight + footerHeight

    const canvas = document.createElement('canvas')
    canvas.width = totalWidth * scale
    canvas.height = totalHeight * scale
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.scale(scale, scale)

    // Dark canvas background
    ctx.fillStyle = '#090d16'
    ctx.fillRect(0, 0, totalWidth, totalHeight)

    // Blue accent top bar
    ctx.fillStyle = '#3b82f6'
    ctx.fillRect(0, 0, totalWidth, 3)

    // Main title
    ctx.fillStyle = '#f8fafc'
    ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    const titleText = effectiveSeries.map((s) => s.title).join('  vs  ') || 'Monitor Macroeconómico BCRA'
    const displayTitle = titleText.length > 70 ? titleText.slice(0, 67) + '...' : titleText
    ctx.fillText(displayTitle, paddingX, 32)

    // Period / Timeframe subtitle
    ctx.fillStyle = '#94a3b8'
    ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    const periodText =
      chartData.length > 0
        ? `Período: ${chartData[0].fecha} a ${chartData[chartData.length - 1].fecha} (${timeframe})`
        : `Período: ${timeframe}`
    ctx.fillText(periodText, paddingX, 52)

    // Draw Legend series on top right of the canvas
    let legendX = totalWidth - paddingX
    effectiveSeries.slice(0, 3).reverse().forEach((s) => {
      const label = `${s.title}${s.unit ? ` (${s.unit})` : ''}`
      ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      const textWidth = ctx.measureText(label).width
      legendX -= textWidth

      ctx.fillStyle = '#e2e8f0'
      ctx.fillText(label, legendX, 50)

      legendX -= 14
      ctx.beginPath()
      ctx.arc(legendX + 6, 46, 4, 0, Math.PI * 2)
      ctx.fillStyle = s.color
      ctx.fill()

      legendX -= 14
    })

    // Clone SVG to attach proper standalone XML attributes
    const clonedSvg = svgElement.cloneNode(true) as SVGSVGElement
    clonedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    clonedSvg.setAttribute('width', String(svgWidth))
    clonedSvg.setAttribute('height', String(svgHeight))

    const svgData = new XMLSerializer().serializeToString(clonedSvg)
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
    const url = window.URL.createObjectURL(svgBlob)

    const img = new Image()
    img.onload = () => {
      ctx.drawImage(img, paddingX, headerHeight, svgWidth, svgHeight)
      window.URL.revokeObjectURL(url)

      // Footer notice
      ctx.fillStyle = '#64748b'
      ctx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      ctx.fillText(
        'Fuente: Banco Central de la República Argentina (BCRA) · Monitor Macroeconómico',
        paddingX,
        totalHeight - 10
      )

      const pngUrl = canvas.toDataURL('image/png')
      const a = document.createElement('a')
      a.href = pngUrl
      const dateStr = new Date().toISOString().split('T')[0]
      a.download = `grafico_bcra_${timeframe.toLowerCase()}_${dateStr}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    }
    img.onerror = () => {
      window.URL.revokeObjectURL(url)
      console.error('Error al generar la imagen PNG del gráfico')
    }
    img.src = url
  }
  // Normalize series: either use passed multi-series or fall back to primaryData/secondaryData
  const effectiveSeries = useMemo<ChartSeries[]>(() => {
    if (series && series.length > 0) {
      return series.map((s) => {
        let title = s.title
        let unit = s.unit
        const numId = typeof s.id === 'number' ? s.id : Number(String(s.id).replace(/\D/g, ''))
        if (numId && KNOWN_BCRA_VARIABLES[numId]) {
          if (!title || title.startsWith('Serie #')) {
            title = KNOWN_BCRA_VARIABLES[numId].name
          }
          if (!unit) {
            unit = KNOWN_BCRA_VARIABLES[numId].unit
          }
        }
        return { ...s, title, unit }
      })
    }
    const result: ChartSeries[] = []
    if (primaryData && primaryData.length > 0) {
      result.push({
        id: 'primary',
        title: primaryTitle || 'Variable Principal',
        data: primaryData,
        axis: 'left',
        color: '#3b82f6',
      })
    }
    if (secondaryData && secondaryData.length > 0) {
      result.push({
        id: 'secondary',
        title: secondaryTitle || 'Variable Dual',
        data: secondaryData,
        axis: 'right',
        color: '#8b5cf6',
        strokeDasharray: '4 4',
      })
    }
    return result
  }, [series, primaryTitle, primaryData, secondaryTitle, secondaryData])

  // Merge series by date
  const chartData = useMemo(() => {
    if (effectiveSeries.length === 0) return []

    const map = new Map<string, { fecha: string; [key: string]: any }>()

    effectiveSeries.forEach((s) => {
      const key = `var_${s.id}`
      s.data.forEach((p) => {
        const existing = map.get(p.fecha)
        if (existing) {
          existing[key] = p.valor
        } else {
          map.set(p.fecha, { fecha: p.fecha, [key]: p.valor })
        }
      })
    })

    const merged = Array.from(map.values())
    merged.sort((a, b) => a.fecha.localeCompare(b.fecha))

    // Filter by timeframe or custom range
    if (merged.length === 0) return merged

    if (timeframe === 'Custom') {
      const filtered = merged.filter((item) => {
        if (startDate && item.fecha < startDate) return false
        if (endDate && item.fecha > endDate) return false
        return true
      })
      return filtered.length > 0 ? filtered : merged
    }

    if (timeframe === 'Max') return merged

    const latest = new Date(merged[merged.length - 1].fecha)
    let cutoff = new Date(latest)

    if (timeframe === '1M') cutoff.setMonth(latest.getMonth() - 1)
    else if (timeframe === '3M') cutoff.setMonth(latest.getMonth() - 3)
    else if (timeframe === '6M') cutoff.setMonth(latest.getMonth() - 6)
    else if (timeframe === '1Y') cutoff.setFullYear(latest.getFullYear() - 1)
    else if (timeframe === '5Y') cutoff.setFullYear(latest.getFullYear() - 5)

    const cutoffStr = cutoff.toISOString().split('T')[0]
    const filtered = merged.filter((item) => item.fecha >= cutoffStr)
    return filtered.length > 0 ? filtered : merged
  }, [effectiveSeries, timeframe, startDate, endDate])

  const leftSeries = effectiveSeries.filter((s) => s.axis === 'left')
  const rightSeries = effectiveSeries.filter((s) => s.axis === 'right')
  const hasRightAxis = rightSeries.length > 0

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 sm:p-5 flex flex-col justify-between">
      {/* Header controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap text-sm font-semibold text-slate-100">
            {leftSeries.length > 0 ? (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-mono uppercase tracking-wider text-blue-400 bg-blue-950/60 px-1.5 py-0.5 rounded border border-blue-800/60">
                  Principal
                </span>
                {leftSeries.map((s, idx) => (
                  <span key={s.id} className="inline-flex items-center gap-1.5 text-slate-200 text-xs sm:text-sm font-medium">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                    <span>{s.title}</span>
                    {s.unit && (
                      <span className="text-[10px] font-mono text-slate-400 bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-700/60">
                        {s.unit}
                      </span>
                    )}
                    {idx < leftSeries.length - 1 && <span className="text-slate-600 font-mono">/</span>}
                  </span>
                ))}
              </div>
            ) : (
              <span>{primaryTitle || 'Monitor Macroeconómico'}</span>
            )}

            {rightSeries.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-slate-500 font-normal text-xs">vs</span>
                <span className="text-[10px] font-mono uppercase tracking-wider text-indigo-400 bg-indigo-950/60 px-1.5 py-0.5 rounded border border-indigo-800/60">
                  Dual
                </span>
                {rightSeries.map((s, idx) => (
                  <span key={s.id} className="inline-flex items-center gap-1.5 text-indigo-300 text-xs sm:text-sm font-medium">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                    <span>{s.title}</span>
                    {s.unit && (
                      <span className="text-[10px] font-mono text-indigo-400/80 bg-indigo-950/60 px-1.5 py-0.5 rounded border border-indigo-800/60">
                        {s.unit}
                      </span>
                    )}
                    {idx < rightSeries.length - 1 && <span className="text-slate-600 font-mono">/</span>}
                  </span>
                ))}
              </div>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Evolución histórica y comparación temporal multi-variable de series BCRA
          </p>
        </div>
        {/* Timeframe pill switcher with Personalizado & Export actions */}
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <div className="inline-flex rounded-lg border border-slate-800 bg-slate-950 p-0.5 flex-wrap">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                onClick={() => {
                  setShowCustomPicker(false)
                  onTimeframeChange(tf)
                }}
                className={`px-2.5 py-1 text-xs font-mono rounded transition-colors cursor-pointer ${
                  timeframe === tf && !showCustomPicker
                    ? 'bg-blue-600 text-white font-medium shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                {tf}
              </button>
            ))}
            <button
              onClick={() => {
                const next = !showCustomPicker
                setShowCustomPicker(next)
                if (next) onTimeframeChange('Custom')
              }}
              className={`px-2.5 py-1 text-xs font-mono rounded transition-colors inline-flex items-center gap-1.5 cursor-pointer ${
                timeframe === 'Custom' || showCustomPicker
                  ? 'bg-blue-600 text-white font-medium shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
              title="Seleccionar rango de fechas específico"
            >
              <Calendar className="w-3 h-3" />
              <span>Personalizado</span>
            </button>
          </div>

          {/* Export buttons: PNG and CSV/Excel */}
          <div className="inline-flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleDownloadPng}
              disabled={chartData.length === 0}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono rounded border border-slate-800 bg-slate-950 text-slate-300 hover:text-white hover:bg-slate-900 hover:border-slate-700 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
              title="Descargar gráfico como imagen PNG de alta resolución"
            >
              <Camera className="w-3.5 h-3.5 text-blue-400" />
              <span>PNG</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadCsv}
              disabled={chartData.length === 0}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono rounded border border-slate-800 bg-slate-950 text-slate-300 hover:text-white hover:bg-slate-900 hover:border-slate-700 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
              title="Descargar datos en formato CSV compatible con Excel"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span>CSV / Excel</span>
            </button>
          </div>
        </div>
      </div>

      {/* Expandable Custom Date Range Selector Toolbar */}
      {(showCustomPicker || timeframe === 'Custom') && (
        <div className="mb-4 p-3 rounded-lg bg-slate-950/80 border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 font-mono">
              <span className="text-slate-400 text-xs">Desde:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  handleStartDateChange(e.target.value)
                  if (timeframe !== 'Custom') onTimeframeChange('Custom')
                }}
                className="bg-slate-900 border border-slate-700 text-slate-100 px-2 py-1 rounded text-xs focus:outline-none focus:border-blue-500 font-mono transition-colors"
              />
            </div>
            <div className="flex items-center gap-2 font-mono">
              <span className="text-slate-400 text-xs">Hasta:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  handleEndDateChange(e.target.value)
                  if (timeframe !== 'Custom') onTimeframeChange('Custom')
                }}
                className="bg-slate-900 border border-slate-700 text-slate-100 px-2 py-1 rounded text-xs focus:outline-none focus:border-blue-500 font-mono transition-colors"
              />
            </div>
            {(startDate || endDate) && (
              <button
                onClick={() => {
                  handleStartDateChange('')
                  handleEndDateChange('')
                }}
                className="text-[11px] text-blue-400 hover:text-blue-300 underline font-mono cursor-pointer"
              >
                Limpiar fechas
              </button>
            )}
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            {chartData.length.toLocaleString('es-AR')} observaciones en período
          </span>
        </div>
      )}

      {/* Chart Canvas */}
      <div ref={chartContainerRef} className="h-72 sm:h-80 w-full relative">
        {loading && (
          <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm z-10 flex items-center justify-center">
            <span className="text-xs text-blue-400 font-mono animate-pulse">Cargando serie temporal...</span>
          </div>
        )}

        {chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-slate-500 font-mono">
            Sin observaciones disponibles para las variables seleccionadas.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis
                dataKey="fecha"
                stroke="#64748b"
                fontSize={11}
                tickLine={false}
                tickFormatter={(val) => {
                  if (timeframe === '1M' || timeframe === '3M') return val.slice(5)
                  return val.slice(0, 7)
                }}
              />
              <YAxis
                yAxisId="left"
                stroke="#64748b"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                domain={['auto', 'auto']}
                tickFormatter={(val) => {
                  if (Math.abs(val) >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`
                  if (Math.abs(val) >= 1_000) return `${(val / 1_000).toFixed(0)}k`
                  return val
                }}
              />
              {hasRightAxis && (
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  stroke="#818cf8"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  domain={['auto', 'auto']}
                  tickFormatter={(val) => {
                    if (Math.abs(val) >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`
                    if (Math.abs(val) >= 1_000) return `${(val / 1_000).toFixed(0)}k`
                    return val
                  }}
                />
              )}
              <Tooltip
                contentStyle={{
                  backgroundColor: '#090d16',
                  borderColor: '#334155',
                  borderRadius: '0.5rem',
                  fontSize: '12px',
                  color: '#f8fafc',
                }}
                formatter={(val: any, name: any) => {
                  const s = effectiveSeries.find(
                    (item) => item.title === name || `var_${item.id}` === name || String(item.id) === String(name)
                  )
                  const displayName = s
                    ? `${s.title} (${s.axis === 'left' ? 'Principal' : 'Dual'})`
                    : (name === 'primary' ? (primaryTitle || 'Principal') : (secondaryTitle || 'Dual'))
                  const unitSuffix = s?.unit ? ` ${s.unit}` : ''
                  return [
                    typeof val === 'number' ? `${val.toLocaleString('es-AR')}${unitSuffix}` : val,
                    displayName,
                  ]
                }}
                labelFormatter={(label) => `Fecha: ${label}`}
              />
              <Legend
                verticalAlign="top"
                align="right"
                wrapperStyle={{ paddingBottom: '12px', fontSize: '12px' }}
                formatter={(value: any) => {
                  const s = effectiveSeries.find(
                    (item) => item.title === value || `var_${item.id}` === value || String(item.id) === String(value)
                  )
                  const title = s ? s.title : (value === 'primary' ? (primaryTitle || 'Principal') : (secondaryTitle || 'Dual'))
                  const axisLabel = s?.axis === 'right' ? 'Dual' : 'Principal'
                  return (
                    <span className="inline-flex items-center gap-1.5 text-slate-200 font-medium mr-2">
                      <span>{title}</span>
                      {s?.unit && (
                        <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/40 px-1 py-0.2 rounded border border-emerald-800/30">
                          {s.unit}
                        </span>
                      )}
                      <span className="text-[10px] font-mono text-slate-400">
                        ({axisLabel})
                      </span>
                    </span>
                  )
                }}
              />
              {effectiveSeries.map((s) => (
                <Line
                  key={s.id}
                  yAxisId={s.axis}
                  type="monotone"
                  dataKey={`var_${s.id}`}
                  name={s.title}
                  stroke={s.color}
                  strokeWidth={2}
                  strokeDasharray={s.strokeDasharray || (s.axis === 'right' ? '4 4' : undefined)}
                  dot={false}
                  activeDot={{ r: 4, stroke: s.color, strokeWidth: 2 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
