import React, { useState, useEffect, useMemo, useRef } from 'react'
import {
  TrendingUp,
  Calendar,
  Camera,
  FileSpreadsheet,
  Check,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react'
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
import type { FxHistoryPoint, FxHistoryResponse, FxSpreadsResponse } from '../../types'
import { api } from '../../services/api'

export type FxTimeframe = '1M' | '3M' | '6M' | '1Y' | '5Y' | 'Max' | 'Custom'

export type CotizationKey = 'oficial' | 'mep' | 'ccl' | 'blue'

export interface CotizationConfig {
  key: CotizationKey
  name: string
  shortName: string
  desc: string
  color: string
}

export const COTIZACIONES: CotizationConfig[] = [
  { key: 'oficial', name: 'Oficial mayorista', shortName: 'Oficial', desc: 'A3500 BCRA', color: '#38bdf8' },
  { key: 'mep', name: 'Dólar MEP', shortName: 'MEP', desc: 'Bolsa (AL30)', color: '#818cf8' },
  { key: 'ccl', name: 'Dólar CCL', shortName: 'CCL', desc: 'Contado con liq.', color: '#a855f7' },
  { key: 'blue', name: 'Dólar Blue', shortName: 'Blue', desc: 'Informal/Libre', color: '#f59e0b' },
]

const TIMEFRAMES: FxTimeframe[] = ['1M', '3M', '6M', '1Y', '5Y', 'Max']

export interface FxSpreadChartProps {
  fxData: FxSpreadsResponse | null
  loading?: boolean
  initialHistory?: FxHistoryResponse | null
  timeframe?: FxTimeframe
  onTimeframeChange?: (tf: FxTimeframe) => void
}

export const FxSpreadChart: React.FC<FxSpreadChartProps> = ({
  fxData,
  loading = false,
  initialHistory = null,
  timeframe: propTimeframe,
  onTimeframeChange,
}) => {
  // Historical data state
  const [historyData, setHistoryData] = useState<FxHistoryResponse | null>(initialHistory)
  const [loadingHistory, setLoadingHistory] = useState<boolean>(!initialHistory)

  // Cotizations selection state: by default, ALL four are active
  const [activeCotizaciones, setActiveCotizaciones] = useState<Record<CotizationKey, boolean>>({
    oficial: true,
    mep: true,
    ccl: true,
    blue: true,
  })

  // Date and Timeframe controls
  const [internalTimeframe, setInternalTimeframe] = useState<FxTimeframe>('1Y')
  const timeframe = propTimeframe ?? internalTimeframe

  const handleTimeframeChange = (tf: FxTimeframe) => {
    setInternalTimeframe(tf)
    if (onTimeframeChange) {
      onTimeframeChange(tf)
    }
  }

  const [customStartDate, setCustomStartDate] = useState<string>('')
  const [customEndDate, setCustomEndDate] = useState<string>('')
  const [showCustomPicker, setShowCustomPicker] = useState<boolean>(false)

  const chartContainerRef = useRef<HTMLDivElement>(null)

  // Fetch FX historical data on mount if not provided via props
  useEffect(() => {
    if (initialHistory) {
      setHistoryData(initialHistory)
      setLoadingHistory(false)
      return
    }

    let isMounted = true
    setLoadingHistory(true)
    api
      .getFxHistory()
      .then((res) => {
        if (isMounted) {
          setHistoryData(res)
        }
      })
      .catch((err) => {
        console.error('Error fetching FX historical data:', err)
      })
      .finally(() => {
        if (isMounted) {
          setLoadingHistory(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [initialHistory])

  // Cotization toggling handlers
  const toggleCotization = (key: CotizationKey) => {
    setActiveCotizaciones((prev) => {
      const isCurrentlyActive = prev[key]
      const activeCount = Object.values(prev).filter(Boolean).length
      // Keep at least one active
      if (isCurrentlyActive && activeCount <= 1) {
        return prev
      }
      return { ...prev, [key]: !isCurrentlyActive }
    })
  }

  const soloCotization = (key: CotizationKey, e: React.MouseEvent) => {
    e.stopPropagation()
    setActiveCotizaciones({
      oficial: key === 'oficial',
      mep: key === 'mep',
      ccl: key === 'ccl',
      blue: key === 'blue',
    })
  }

  const selectAllCotizaciones = () => {
    setActiveCotizaciones({
      oficial: true,
      mep: true,
      ccl: true,
      blue: true,
    })
  }

  // Merge historical time-series into tabular observations
  const mergedRawData = useMemo(() => {
    if (!historyData?.rates) return []

    const dateMap: Record<
      string,
      { fecha: string; oficial?: number; mep?: number; ccl?: number; blue?: number }
    > = {}

    const populate = (key: CotizationKey) => {
      const list: FxHistoryPoint[] = historyData.rates[key] || []
      for (const pt of list) {
        if (!pt.fecha) continue
        if (!dateMap[pt.fecha]) {
          dateMap[pt.fecha] = { fecha: pt.fecha }
        }
        dateMap[pt.fecha][key] = pt.valor
      }
    }

    populate('oficial')
    populate('mep')
    populate('ccl')
    populate('blue')

    const sortedDates = Object.keys(dateMap).sort()
    return sortedDates.map((d) => dateMap[d])
  }, [historyData])

  // Timeframe and date-filtered dataset
  const chartData = useMemo(() => {
    if (mergedRawData.length === 0) return []

    if (timeframe === 'Max') return mergedRawData

    if (timeframe === 'Custom') {
      return mergedRawData.filter((pt) => {
        if (customStartDate && pt.fecha < customStartDate) return false
        if (customEndDate && pt.fecha > customEndDate) return false
        return true
      })
    }

    const lastDateStr = mergedRawData[mergedRawData.length - 1].fecha
    const lastDate = new Date(lastDateStr)

    let daysBack = 365
    if (timeframe === '1M') daysBack = 30
    if (timeframe === '3M') daysBack = 90
    if (timeframe === '6M') daysBack = 180
    if (timeframe === '1Y') daysBack = 365
    if (timeframe === '5Y') daysBack = 1825

    const cutoff = new Date(lastDate.getTime() - daysBack * 24 * 60 * 60 * 1000)
    const cutoffStr = cutoff.toISOString().split('T')[0]

    return mergedRawData.filter((pt) => pt.fecha >= cutoffStr)
  }, [mergedRawData, timeframe, customStartDate, customEndDate])

  // Date label formatting for X-Axis
  const formatXAxis = (tickItem: string) => {
    if (!tickItem) return ''
    const parts = tickItem.split('-')
    if (parts.length < 3) return tickItem
    const [, month, day] = parts
    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
    const mIdx = parseInt(month, 10) - 1
    const mStr = monthNames[mIdx] || month
    if (timeframe === '1M' || timeframe === '3M') {
      return `${day} ${mStr}`
    }
    return `${mStr} '${parts[0].slice(2)}`
  }

  // Export handlers
  const handleDownloadCsv = () => {
    if (chartData.length === 0) return

    const headers = [
      'Fecha',
      'Oficial',
      'MEP',
      'CCL',
      'Blue',
      'Brecha_MEP(%)',
      'Brecha_CCL(%)',
      'Brecha_Blue(%)',
    ]

    const rows = chartData.map((pt) => {
      const oficial = pt.oficial ?? ''
      const mep = pt.mep ?? ''
      const ccl = pt.ccl ?? ''
      const blue = pt.blue ?? ''

      const bMep =
        pt.oficial && pt.mep ? (((pt.mep - pt.oficial) / pt.oficial) * 100).toFixed(2) : ''
      const bCcl =
        pt.oficial && pt.ccl ? (((pt.ccl - pt.oficial) / pt.oficial) * 100).toFixed(2) : ''
      const bBlue =
        pt.oficial && pt.blue ? (((pt.blue - pt.oficial) / pt.oficial) * 100).toFixed(2) : ''

      return [pt.fecha, oficial, mep, ccl, blue, bMep, bCcl, bBlue].join(';')
    })

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const dateStr = new Date().toISOString().split('T')[0]
    a.download = `cotizaciones_dolar_${timeframe.toLowerCase()}_${dateStr}.csv`
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
    const footerHeight = 32

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

    // Header title
    ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    ctx.fillStyle = '#f8fafc'
    ctx.fillText('Monitor cambiario — Evolución de cotizaciones y brecha financiera', paddingX, 30)

    // Subtitle
    ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    ctx.fillStyle = '#94a3b8'
    const activeNames = COTIZACIONES.filter((c) => activeCotizaciones[c.key])
      .map((c) => c.name)
      .join(' • ')
    ctx.fillText(`${activeNames} | Rango: ${timeframe}`, paddingX, 48)

    // Divider line
    ctx.strokeStyle = '#1e293b'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(paddingX, 58)
    ctx.lineTo(totalWidth - paddingX, 58)
    ctx.stroke()

    // Serialize SVG
    const serializer = new XMLSerializer()
    let svgString = serializer.serializeToString(svgElement)
    if (!svgString.match(/^<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)) {
      svgString = svgString.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"')
    }

    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
    const URLObj = window.URL || window.webkitURL || window
    const blobURL = URLObj.createObjectURL(svgBlob)

    const img = new Image()
    img.onload = () => {
      ctx.drawImage(img, paddingX, headerHeight, svgWidth, svgHeight)
      URLObj.revokeObjectURL(blobURL)

      // Footer
      ctx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      ctx.fillStyle = '#64748b'
      const dateStr = new Date().toLocaleDateString('es-AR')
      ctx.fillText(
        `Fuente: BCRA / DolarApi / ArgentinaDatos • Generado: ${dateStr}`,
        paddingX,
        totalHeight - 12
      )

      const pngUrl = canvas.toDataURL('image/png')
      const downloadLink = document.createElement('a')
      downloadLink.href = pngUrl
      downloadLink.download = `monitor_cambiario_${timeframe.toLowerCase()}_${new Date().toISOString().split('T')[0]}.png`
      document.body.appendChild(downloadLink)
      downloadLink.click()
      document.body.removeChild(downloadLink)
    }
    img.src = blobURL
  }

  // Custom Recharts Tooltip
  const FxCustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || payload.length === 0) return null

    const oficialItem = payload.find((p: any) => p.dataKey === 'oficial')
    const oficialVal = oficialItem?.value

    const formatDate = (d: string) => {
      try {
        const [year, month, day] = d.split('-')
        const monthNames = [
          'enero',
          'febrero',
          'marzo',
          'abril',
          'mayo',
          'junio',
          'julio',
          'agosto',
          'septiembre',
          'octubre',
          'noviembre',
          'diciembre',
        ]
        const mName = monthNames[parseInt(month, 10) - 1] || month
        return `${parseInt(day, 10)} de ${mName} de ${year}`
      } catch {
        return d
      }
    }

    return (
      <div className="bg-slate-900/95 border border-slate-700/80 rounded-lg p-3 shadow-2xl backdrop-blur-md min-w-[240px] text-xs">
        <div className="text-slate-400 font-sans font-medium text-[11px] pb-1.5 mb-2 border-b border-slate-800 flex items-center justify-between">
          <span>{formatDate(label)}</span>
          <span className="text-[10px] text-slate-500 font-mono">ARS/USD</span>
        </div>
        <div className="space-y-2">
          {payload.map((item: any) => {
            const cfg = COTIZACIONES.find((c) => c.key === item.dataKey)
            const val = item.value
            const brecha =
              oficialVal && item.dataKey !== 'oficial'
                ? ((val - oficialVal) / oficialVal) * 100
                : null

            return (
              <div key={item.dataKey} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-slate-200 font-medium">{cfg?.name || item.name}</span>
                </div>
                <div className="flex items-center gap-2 font-mono tabular-nums">
                  <span className="text-slate-100 font-bold">
                    $
                    {val?.toLocaleString('es-AR', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                  {brecha !== null && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-semibold ${brecha > 40
                          ? 'text-rose-400 bg-rose-500/15 border border-rose-500/30'
                          : brecha > 20
                            ? 'text-amber-400 bg-amber-500/15 border border-amber-500/30'
                            : 'text-emerald-400 bg-emerald-500/15 border border-emerald-500/30'
                        }`}
                    >
                      +{brecha.toFixed(1)}%
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  if (loading || !fxData) {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-5 animate-pulse">
        <div className="h-5 w-48 bg-slate-800 rounded mb-4"></div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 bg-slate-800/60 rounded"></div>
          ))}
        </div>
        <div className="mt-4 h-64 bg-slate-800/40 rounded"></div>
      </div>
    )
  }

  const oficial_base = fxData.oficial_base || 0
  const rates = fxData.rates || {}
  const spreads = fxData.spreads || {}
  const timestamp = fxData.timestamp

  let formattedTime = 'Reciente'
  try {
    if (timestamp) {
      const parsedDate = new Date(timestamp)
      if (!isNaN(parsedDate.getTime())) {
        formattedTime = parsedDate.toLocaleTimeString('es-AR', {
          hour: '2-digit',
          minute: '2-digit',
        })
      }
    }
  } catch {
    formattedTime = 'Reciente'
  }

  const getSpreadBadgeClass = (brecha: number) => {
    if (brecha > 40) return 'bg-rose-500/15 text-rose-400 border-rose-500/30'
    if (brecha > 20) return 'bg-amber-500/15 text-amber-400 border-amber-500/30'
    return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
  }

  const activeCount = Object.values(activeCotizaciones).filter(Boolean).length

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 sm:p-5 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <span>Monitor cambiario & brecha financiera</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Cotizaciones de tipos de cambio financieros, dispersión histórica y comparación interactiva
          </p>
        </div>

        <span className="text-[11px] font-mono text-slate-500">
          Act: {formattedTime}
        </span>
      </div>

      {/* FX Current Rates Grid (Clicking toggles that cotization in the plot) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {COTIZACIONES.map((card) => {
          const rate = rates[card.key]
          const spread = spreads[card.key]
          const venta = rate?.venta || (card.key === 'oficial' ? oficial_base : 0)
          const compra = rate?.compra || 0
          const isActive = activeCotizaciones[card.key]

          return (
            <div
              key={card.key}
              onClick={() => toggleCotization(card.key)}
              title={`Clic para ${isActive ? 'ocultar en' : 'mostrar en'} el gráfico histórico`}
              className={`rounded-lg border p-3.5 flex flex-col justify-between cursor-pointer transition-all duration-200 ${isActive
                  ? 'border-slate-700 bg-slate-950/80 shadow-md ring-1 ring-slate-700/60'
                  : 'border-slate-800/60 bg-slate-950/30 opacity-60 hover:opacity-90'
                }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: card.color }}
                    />
                    <span className="text-xs font-semibold text-slate-200">{card.name}</span>
                  </div>
                  {spread && (
                    <span
                      className={`text-[11px] font-mono px-1.5 py-0.5 rounded border ${getSpreadBadgeClass(
                        spread.brecha_porcentaje
                      )}`}
                    >
                      +{spread.brecha_porcentaje.toFixed(1)}%
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <p className="text-[10px] text-slate-500">{card.desc}</p>
                  <span
                    className={`text-[9px] uppercase tracking-wider font-mono font-medium ${isActive ? 'text-emerald-400' : 'text-slate-500'
                      }`}
                  >
                    {isActive ? 'En gráfico' : 'Oculto'}
                  </span>
                </div>
              </div>

              <div className="mt-3">
                <div className="flex items-baseline justify-between font-mono">
                  <div>
                    <span className="text-[10px] text-slate-500 block">Venta</span>
                    <span className="text-lg font-bold text-slate-100 tabular-nums">
                      ${venta.toFixed(2)}
                    </span>
                  </div>
                  {compra > 0 && (
                    <div className="text-right">
                      <span className="text-[10px] text-slate-500 block">Compra</span>
                      <span className="text-xs text-slate-400 tabular-nums">${compra.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Brecha Cambiaria Summary Bar */}
      <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/40 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-300">Brecha cambiaria máxima:</span>
          {spreads?.blue && (
            <span
              className={`font-mono font-bold px-2 py-0.5 rounded border ${getSpreadBadgeClass(
                Math.max(
                  spreads?.mep?.brecha_porcentaje || 0,
                  spreads?.ccl?.brecha_porcentaje || 0,
                  spreads?.blue?.brecha_porcentaje || 0
                )
              )}`}
            >
              {Math.max(
                spreads?.mep?.brecha_porcentaje || 0,
                spreads?.ccl?.brecha_porcentaje || 0,
                spreads?.blue?.brecha_porcentaje || 0
              ).toFixed(2)}
              %
            </span>
          )}
        </div>

        <div className="flex items-center gap-4 text-slate-400 font-mono text-[11px]">
          <span>
            MEP Spread:{' '}
            <strong className="text-slate-200">
              +{spreads?.mep?.brecha_porcentaje?.toFixed(1) || '0.0'}%
            </strong>
          </span>
          <span>
            CCL Spread:{' '}
            <strong className="text-slate-200">
              +{spreads?.ccl?.brecha_porcentaje?.toFixed(1) || '0.0'}%
            </strong>
          </span>
          <span>
            Blue Spread:{' '}
            <strong className="text-slate-200">
              +{spreads?.blue?.brecha_porcentaje?.toFixed(1) || '0.0'}%
            </strong>
          </span>
        </div>
      </div>

      {/* Interactive Time-Series Section */}
      <div className="rounded-lg border border-slate-800/90 bg-slate-950/70 p-4 space-y-3.5">
        {/* Controls Toolbar: Cotizations Selector + Date Configs + Export Buttons */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 pb-3 border-b border-slate-800/80">
          {/* Cotization Pill Multi-Select and Comparison */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5 mr-1">
              <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
              <span>Cotizaciones:</span>
            </span>

            {COTIZACIONES.map((c) => {
              const active = activeCotizaciones[c.key]
              return (
                <div
                  key={c.key}
                  onClick={() => toggleCotization(c.key)}
                  className={`group relative flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-150 cursor-pointer border select-none ${active
                      ? 'border-slate-700 bg-slate-900/90 text-slate-100 shadow-sm'
                      : 'border-slate-800/70 bg-slate-950/40 text-slate-400 hover:text-slate-300 hover:border-slate-700'
                    }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full transition-opacity ${active ? 'opacity-100' : 'opacity-40'
                      }`}
                    style={{ backgroundColor: c.color }}
                  />
                  <span>{c.shortName}</span>
                  {active && <Check className="w-3 h-3 text-emerald-400 ml-0.5" />}

                  {/* Quick 'Solo' hover button to isolate cotization */}
                  <button
                    type="button"
                    onClick={(e) => soloCotization(c.key, e)}
                    title={`Aislar solo ${c.name}`}
                    className="ml-1 text-[10px] text-slate-400 hover:text-emerald-400 font-mono px-1 rounded hover:bg-slate-800/80 transition-colors"
                  >
                    solo
                  </button>
                </div>
              )
            })}

            {activeCount < COTIZACIONES.length && (
              <button
                type="button"
                onClick={selectAllCotizaciones}
                className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-sky-400 hover:text-sky-300 hover:bg-sky-500/10 border border-sky-500/20 transition-colors"
                title="Mostrar todas las cotizaciones"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Todas</span>
              </button>
            )}
          </div>

          {/* Timeframe Presets & Export Actions */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Timeframe Pill Buttons */}
            <div className="flex items-center bg-slate-900/90 rounded-lg p-0.5 border border-slate-800">
              {TIMEFRAMES.map((tf) => (
                <button
                  key={tf}
                  type="button"
                  onClick={() => {
                    handleTimeframeChange(tf)
                    if (showCustomPicker) setShowCustomPicker(false)
                  }}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${timeframe === tf
                      ? 'bg-emerald-500 text-slate-950 font-semibold shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                    }`}
                >
                  {tf}
                </button>
              ))}

              <button
                type="button"
                onClick={() => {
                  handleTimeframeChange('Custom')
                  setShowCustomPicker(!showCustomPicker)
                }}
                className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-all ${timeframe === 'Custom'
                    ? 'bg-emerald-500 text-slate-950 font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                  }`}
                title="Rango personalizado de fechas"
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Personalizado</span>
              </button>
            </div>

            {/* Export buttons */}
            <div className="flex items-center gap-1.5 ml-auto sm:ml-0">
              <button
                type="button"
                onClick={handleDownloadPng}
                disabled={chartData.length === 0}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-40"
                title="Descargar gráfico en alta resolución (PNG)"
              >
                <Camera className="w-3.5 h-3.5 text-slate-400" />
                <span className="hidden sm:inline">PNG</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadCsv}
                disabled={chartData.length === 0}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-40"
                title="Exportar datos a CSV / Excel"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-slate-400" />
                <span className="hidden sm:inline">CSV</span>
              </button>
            </div>
          </div>
        </div>

        {/* Custom Date Pickers Drawer (when 'Personalizado' is active) */}
        {showCustomPicker && (
          <div className="flex flex-wrap items-center gap-3 p-3 rounded-lg bg-slate-900/60 border border-slate-800 text-xs">
            <span className="text-slate-300 font-medium">Rango de fechas:</span>
            <div className="flex items-center gap-2">
              <label htmlFor="fx-custom-start" className="text-slate-400">
                Desde:
              </label>
              <input
                id="fx-custom-start"
                type="date"
                value={customStartDate}
                onChange={(e) => {
                  setCustomStartDate(e.target.value)
                  handleTimeframeChange('Custom')
                }}
                className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200 text-xs focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="fx-custom-end" className="text-slate-400">
                Hasta:
              </label>
              <input
                id="fx-custom-end"
                type="date"
                value={customEndDate}
                onChange={(e) => {
                  setCustomEndDate(e.target.value)
                  handleTimeframeChange('Custom')
                }}
                className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200 text-xs focus:outline-none focus:border-emerald-500"
              />
            </div>
            <span className="text-slate-500 text-[11px] font-mono">
              {chartData.length} observaciones filtradas
            </span>
          </div>
        )}

        {/* Chart Viewport */}
        <div ref={chartContainerRef} className="relative w-full h-[340px] pt-2">
          {loadingHistory ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/60 backdrop-blur-xs rounded-lg z-10 space-y-2">
              <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs font-mono text-slate-400">
                Cargando serie histórica de cotizaciones...
              </span>
            </div>
          ) : chartData.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 text-xs">
              <p>Sin observaciones de cotizaciones disponibles para el rango seleccionado.</p>
              <button
                type="button"
                onClick={() => handleTimeframeChange('1Y')}
                className="mt-2 text-emerald-400 hover:underline"
              >
                Restablecer a 1 Año
              </button>
            </div>
          ) : null}

          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 10, right: 20, left: 15, bottom: 20 }}
            >
              <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="fecha"
                stroke="#64748b"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: '#334155' }}
                tickFormatter={formatXAxis}
                dy={6}
              />
              <YAxis
                stroke="#64748b"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: '#334155' }}
                domain={['auto', 'auto']}
                tickFormatter={(val: number) => `$${Math.round(val).toLocaleString('es-AR')}`}
                width={70}
              />
              <Tooltip content={<FxCustomTooltip />} />
              <Legend
                verticalAlign="bottom"
                height={28}
                content={() => (
                  <div className="flex flex-wrap items-center justify-center gap-4 text-xs font-medium pt-2 select-none">
                    {COTIZACIONES.map((c) => {
                      const active = activeCotizaciones[c.key]
                      return (
                        <button
                          key={c.key}
                          type="button"
                          onClick={() => toggleCotization(c.key)}
                          className={`flex items-center gap-1.5 transition-opacity ${active ? 'opacity-100' : 'opacity-40 hover:opacity-75'
                            }`}
                        >
                          <span
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: c.color }}
                          />
                          <span className="text-slate-300 font-sans">{c.name}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              />

              {/* Render dynamic line per active cotization */}
              {COTIZACIONES.map((c) => {
                if (!activeCotizaciones[c.key]) return null
                return (
                  <Line
                    key={c.key}
                    type="monotone"
                    dataKey={c.key}
                    name={c.name}
                    stroke={c.color}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 5, stroke: '#090d16', strokeWidth: 2 }}
                    isAnimationActive={false}
                  />
                )
              })}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Footer Metrics Indicator */}
        <div className="flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-500 font-mono pt-1 border-t border-slate-800/60">
          <div>
            <span>
              {activeCount} de {COTIZACIONES.length} cotizaciones activas •{' '}
              {chartData.length.toLocaleString('es-AR')} días evaluados
            </span>
          </div>
          <div>
            <span>Fuente: DolarApi/ArgentinaDatos/BCRA</span>
          </div>
        </div>
      </div>
    </div>
  )
}
