import React, { useState } from 'react'
import {
  TrendingUp,
  Percent,
  DollarSign,
  Activity,
  Users,
  BarChart3,
  Scale,
  ArrowUpRight,
  ArrowDownLeft,
  AlertTriangle,
  Target,
  CheckCircle2,
  XCircle,
  HelpCircle,
} from 'lucide-react'
import {
  RemCohort,
  RemModularVariableData,
  RemSparklinePoint,
  RemExpectationVsRealityHistoryPoint,
} from '../../../types'

export interface RemModularKpiCardProps {
  variableData: RemModularVariableData
  selectedHorizonId: string
  cohort: RemCohort
  onHorizonChange: (newHorizonId: string) => void
}

/**
 * Returns an appropriate thematic icon for a given REM variable.
 */
function getVariableIcon(varId: string): React.ReactNode {
  switch (varId) {
    case 'cpi_general':
      return <TrendingUp className="w-4 h-4 text-emerald-400" />
    case 'cpi_core':
      return <Percent className="w-4 h-4 text-blue-400" />
    case 'exchange_rate':
      return <DollarSign className="w-4 h-4 text-amber-400" />
    case 'interest_rate':
      return <Activity className="w-4 h-4 text-purple-400" />
    case 'pib':
      return <BarChart3 className="w-4 h-4 text-cyan-400" />
    case 'unemployment':
      return <Users className="w-4 h-4 text-rose-400" />
    case 'fiscal_result':
      return <Scale className="w-4 h-4 text-indigo-400" />
    case 'exports':
      return <ArrowUpRight className="w-4 h-4 text-emerald-400" />
    case 'imports':
      return <ArrowDownLeft className="w-4 h-4 text-amber-400" />
    default:
      return <TrendingUp className="w-4 h-4 text-blue-400" />
  }
}

/**
 * Forward-looking projection sparkline SVG component.
 */
interface SparklineProps {
  data: RemSparklinePoint[]
  unit: string
  color?: string
  varId: string
}

const ProjectionSparkline: React.FC<SparklineProps> = ({
  data,
  unit,
  color = '#38bdf8',
  varId,
}) => {
  const [hoveredPoint, setHoveredPoint] = useState<RemSparklinePoint | null>(null)
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null)

  if (!data || data.length < 2) {
    return (
      <div className="h-11 flex items-center justify-center text-[10px] text-slate-500 font-mono italic">
        Sin puntos suficientes para proyección
      </div>
    )
  }

  const values = data.map((d) => d.value)
  const minVal = Math.min(...values)
  const maxVal = Math.max(...values)
  const range = maxVal - minVal === 0 ? 1 : maxVal - minVal

  const width = 240
  const height = 44
  const paddingX = 8
  const paddingY = 6

  const points = data.map((d, index) => {
    const x = paddingX + (index / (data.length - 1)) * (width - paddingX * 2)
    const y = height - paddingY - ((d.value - minVal) / range) * (height - paddingY * 2)
    return { x, y, point: d }
  })

  const pathD = points.reduce((acc, pt, i) => (i === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`), '')
  const areaD = `${pathD} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`
  const gradId = `proj-grad-${varId}`

  const getTooltipStyle = () => {
    if (!hoverPos) return {}
    const ratio = hoverPos.x / width
    if (ratio < 0.22) {
      return { left: '0px', transform: 'none' }
    }
    if (ratio > 0.78) {
      return { right: '0px', left: 'auto', transform: 'none' }
    }
    return { left: `${ratio * 100}%`, transform: 'translateX(-50%)' }
  }

  return (
    <div className="relative mt-1" onMouseLeave={() => { setHoveredPoint(null); setHoverPos(null) }}>
      {/* Y-Axis (Measurement Unit & Scale Range) */}
      <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mb-1">
        <span className="flex items-center gap-1">
          <span className="text-slate-500 text-[9px] uppercase tracking-wider font-sans">Eje Y:</span>
          <span className="text-slate-200 font-semibold">{unit || 'N/A'}</span>
        </span>
        <span className="text-[10px] text-slate-400">
          Rango: {minVal.toLocaleString('es-AR', { maximumFractionDigits: 1 })} — {maxVal.toLocaleString('es-AR', { maximumFractionDigits: 1 })}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-11 overflow-visible cursor-crosshair"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0.0" />
          </linearGradient>
        </defs>

        <path d={areaD} fill={`url(#${gradId})`} />
        <path
          d={pathD}
          fill="none"
          stroke={color}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {points.map((pt, i) => (
          <circle
            key={i}
            cx={pt.x}
            cy={pt.y}
            r={hoveredPoint?.period === pt.point.period ? 3.5 : 2}
            className="transition-all duration-150"
            fill={hoveredPoint?.period === pt.point.period ? '#ffffff' : color}
            stroke={color}
            strokeWidth="1.2"
            onMouseEnter={() => {
              setHoveredPoint(pt.point)
              setHoverPos({ x: pt.x, y: pt.y })
            }}
          />
        ))}
      </svg>

      {/* Floating Tooltip with Elevated Stacking */}
      {hoveredPoint && hoverPos && (
        <div
          className="absolute pointer-events-none -top-8 bg-slate-950 border border-slate-700/90 px-2.5 py-0.5 rounded shadow-2xl text-[10px] font-mono text-slate-200 z-50 whitespace-nowrap"
          style={getTooltipStyle()}
        >
          <span className="text-slate-400 mr-1">{hoveredPoint.period}:</span>
          <strong className="text-slate-100">
            {hoveredPoint.value.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}
          </strong>
          <span className="text-slate-400 ml-0.5">{unit.includes('%') ? '%' : ''}</span>
        </div>
      )}

      {/* X-Axis (Date / Timeline Labels) */}
      <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mt-1 pt-1 border-t border-slate-800/50">
        <span className="text-slate-300 font-medium">{data[0].period}</span>
        <span className="text-[9px] text-slate-500 uppercase tracking-wider font-sans">Eje X: Fecha</span>
        <span className="text-slate-300 font-medium">{data[data.length - 1].period}</span>
      </div>
    </div>
  )
}

/**
 * Micro-chart comparing Real vs Previous Forecast across the last completed periods.
 */
interface RealVsForecastChartProps {
  history: RemExpectationVsRealityHistoryPoint[]
  unit: string
  varId: string
}

const RealVsForecastChart: React.FC<RealVsForecastChartProps> = ({
  history,
  unit,
  varId,
}) => {
  const [hovered, setHovered] = useState<RemExpectationVsRealityHistoryPoint | null>(null)
  const [hoverPos, setHoverPos] = useState<{ x: number } | null>(null)

  if (!history || history.length < 2) {
    return (
      <div className="h-11 flex items-center justify-center text-[10px] text-slate-500 font-mono italic">
        Sin historial comparativo disponible
      </div>
    )
  }

  const allVals = history.flatMap((h) => [h.real, h.forecast])
  const minVal = Math.min(...allVals)
  const maxVal = Math.max(...allVals)
  const range = maxVal - minVal === 0 ? 1 : maxVal - minVal

  const width = 240
  const height = 44
  const paddingX = 14
  const paddingY = 6

  const realPts = history.map((d, index) => {
    const x = paddingX + (index / (history.length - 1)) * (width - paddingX * 2)
    const y = height - paddingY - ((d.real - minVal) / range) * (height - paddingY * 2)
    return { x, y, point: d }
  })

  const forecastPts = history.map((d, index) => {
    const x = paddingX + (index / (history.length - 1)) * (width - paddingX * 2)
    const y = height - paddingY - ((d.forecast - minVal) / range) * (height - paddingY * 2)
    return { x, y, point: d }
  })

  const realPath = realPts.reduce((acc, pt, i) => (i === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`), '')
  const forecastPath = forecastPts.reduce((acc, pt, i) => (i === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`), '')

  const getTooltipStyle = () => {
    if (!hoverPos) return {}
    const ratio = hoverPos.x / width
    if (ratio < 0.22) {
      return { left: '0px', transform: 'none' }
    }
    if (ratio > 0.78) {
      return { right: '0px', left: 'auto', transform: 'none' }
    }
    return { left: `${ratio * 100}%`, transform: 'translateX(-50%)' }
  }

  return (
    <div className="relative mt-1" onMouseLeave={() => { setHovered(null); setHoverPos(null) }}>
      {/* Y-Axis (Measurement Unit & Dual Legend) */}
      <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mb-1">
        <span className="flex items-center gap-1">
          <span className="text-slate-500 text-[9px] uppercase tracking-wider font-sans">Eje Y:</span>
          <span className="text-slate-200 font-semibold">{unit || 'N/A'}</span>
        </span>
        <div className="flex items-center gap-3 text-[10px] font-mono text-slate-400">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-0.5 bg-emerald-400 rounded-full inline-block"></span> Real
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-0.5 border-t border-dashed border-amber-400 inline-block"></span> Previsto
          </span>
        </div>
      </div>

      <svg
        data-testid={`real-vs-forecast-svg-${varId}`}
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-11 overflow-visible cursor-crosshair"
        preserveAspectRatio="none"
      >
        {/* Forecast Line (Dashed Amber/Orange) */}
        <path
          d={forecastPath}
          fill="none"
          stroke="#f59e0b"
          strokeWidth="1.6"
          strokeDasharray="3 3"
          strokeLinecap="round"
        />

        {/* Real Line (Solid Emerald/Cyan) */}
        <path
          d={realPath}
          fill="none"
          stroke="#10b981"
          strokeWidth="2"
          strokeLinecap="round"
        />

        {/* Forecast Points (Hollow circles) */}
        {forecastPts.map((pt, i) => (
          <circle
            key={`fc-${i}`}
            cx={pt.x}
            cy={pt.y}
            r={2.5}
            fill="#0f172a"
            stroke="#f59e0b"
            strokeWidth="1.4"
          />
        ))}

        {/* Real Points (Solid circles) */}
        {realPts.map((pt, i) => (
          <circle
            key={`real-${i}`}
            cx={pt.x}
            cy={pt.y}
            r={hovered?.period === pt.point.period ? 4 : 2.5}
            fill={hovered?.period === pt.point.period ? '#ffffff' : '#10b981'}
            stroke="#0f172a"
            strokeWidth="1.2"
            onMouseEnter={() => {
              setHovered(pt.point)
              setHoverPos({ x: pt.x })
            }}
          />
        ))}
      </svg>

      {/* Floating Tooltip with Elevated Stacking */}
      {hovered && hoverPos && (
        <div
          className="absolute pointer-events-none -top-9 bg-slate-950 border border-slate-700/90 px-2.5 py-1 rounded shadow-2xl text-[10px] font-mono text-slate-200 z-50 whitespace-nowrap"
          style={getTooltipStyle()}
        >
          <span className="text-slate-400 font-semibold mr-1.5">{hovered.period}:</span>
          <span className="text-emerald-400 mr-2">Real: <strong>{hovered.real}{unit.includes('%') ? '%' : ''}</strong></span>
          <span className="text-amber-400 mr-2">Previsto: <strong>{hovered.forecast}{unit.includes('%') ? '%' : ''}</strong></span>
          <span className={hovered.delta > 0 ? 'text-rose-400' : 'text-emerald-400'}>
            Δ: {hovered.delta > 0 ? `+${hovered.delta}` : hovered.delta}
          </span>
        </div>
      )}

      {/* X-Axis (Date / Period Labels) */}
      <div className="mt-1 pt-1 border-t border-slate-800/50">
        <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
          {history.map((h, i) => (
            <span
              key={i}
              className={`text-[10px] ${i === history.length - 1 ? 'text-emerald-400 font-semibold' : 'text-slate-400'}`}
            >
              {h.period}
            </span>
          ))}
        </div>
        <div className="text-center text-[9px] font-mono text-slate-500 mt-0.5 uppercase tracking-wider font-sans">
          Eje X: Fecha observada
        </div>
      </div>
    </div>
  )
}

export const RemModularKpiCard: React.FC<RemModularKpiCardProps> = ({
  variableData,
  selectedHorizonId,
  cohort,
  onHorizonChange,
}) => {
  const [viewMode, setViewMode] = useState<'future' | 'reality'>('future')

  // Find active horizon or fallback to default
  const activeHorizonKey = variableData.horizons[selectedHorizonId]
    ? selectedHorizonId
    : (variableData.default_horizon || Object.keys(variableData.horizons)[0] || '12m')
  const horizonData = variableData.horizons[activeHorizonKey]

  const unit = horizonData?.unit || ''
  const val = horizonData?.value ?? 0
  const isCurrency = unit.includes('$') || unit.toLowerCase().includes('usd')

  const formattedValue = isCurrency
    ? `$${val.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `${val.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}${unit.includes('%') ? '%' : ''}`

  const formattedP25 = horizonData?.p25 !== undefined
    ? (isCurrency ? `$${horizonData.p25.toFixed(0)}` : `${horizonData.p25.toFixed(1)}${unit.includes('%') ? '%' : ''}`)
    : null
  const formattedP75 = horizonData?.p75 !== undefined
    ? (isCurrency ? `$${horizonData.p75.toFixed(0)}` : `${horizonData.p75.toFixed(1)}${unit.includes('%') ? '%' : ''}`)
    : null

  const top10Div = horizonData?.top10_divergence ?? 0
  const divFlag = horizonData?.divergence_flag ?? false

  const expReality = variableData.expectation_vs_reality

  // Thematic color for sparkline
  const sparklineColor = (() => {
    switch (variableData.id) {
      case 'cpi_general':
      case 'exports':
        return '#10b981' // emerald
      case 'exchange_rate':
      case 'imports':
        return '#f59e0b' // amber
      case 'interest_rate':
        return '#a855f7' // purple
      case 'fiscal_result':
        return '#6366f1' // indigo
      case 'unemployment':
        return '#f43f5e' // rose
      case 'pib':
        return '#06b6d4' // cyan
      default:
        return '#38bdf8' // sky
    }
  })()

  return (
    <div
      data-testid={`rem-kpi-card-${variableData.id}`}
      className="bg-slate-900/80 border border-slate-800/90 hover:border-slate-700/80 rounded-xl p-4 sm:p-5 shadow-lg backdrop-blur-sm transition-all duration-200 flex flex-col justify-between relative hover:z-30 focus-within:z-30"
    >
      <div>
        {/* Top Header: Fixed Variable Name on Left, Horizon Select on Right */}
        <div className="flex items-start justify-between gap-3 mb-3 min-h-[2.5rem]">
          {/* Dedicated Variable Title & Icon */}
          <div className="flex items-start gap-2 min-w-0 flex-1">
            <span className="flex-shrink-0 mt-0.5">{getVariableIcon(variableData.id)}</span>
            <span
              className="text-xs sm:text-[13px] font-semibold text-slate-200 uppercase tracking-wide break-words leading-tight"
              title={variableData.name}
            >
              {variableData.name}
            </span>
          </div>

          {/* Horizon Selector Dropdown */}
          <div className="flex-shrink-0 mt-0.5">
            <select
              aria-label={`Horizonte para ${variableData.name}`}
              data-testid={`horizon-select-${variableData.id}`}
              value={activeHorizonKey}
              onChange={(e) => onHorizonChange(e.target.value)}
              className="bg-slate-950/90 border border-slate-700/80 rounded-lg px-2.5 py-1 text-xs font-mono text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer hover:border-slate-600 transition-colors"
            >
              {variableData.available_horizons.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Primary Metric Value & Period Badge */}
        <div className="flex items-baseline justify-between gap-2 mt-1">
          <div className="flex items-baseline gap-2">
            <span
              data-testid={`kpi-value-${variableData.id}`}
              className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-slate-100 tracking-tight"
            >
              {formattedValue}
            </span>
            <span className="text-xs font-mono text-slate-400">{unit}</span>
          </div>

          <span
            data-testid={`kpi-period-tag-${variableData.id}`}
            className="text-[11px] font-mono bg-slate-800/90 text-slate-300 px-2 py-0.5 rounded border border-slate-700/50 flex-shrink-0"
          >
            {horizonData?.period || 'N/A'}
          </span>
        </div>

        {/* Confidence Interquartile Band (P25 - P75) */}
        {formattedP25 && formattedP75 && (
          <div className="mt-2.5 flex items-center justify-between text-xs text-slate-400 bg-slate-950/40 px-2.5 py-1.5 rounded-lg border border-slate-800/60 font-mono">
            <span className="text-slate-400 text-[11px]">Rango intercuartil (P25 - P75):</span>
            <span className="text-slate-200 font-semibold tabular-nums">
              {formattedP25} — {formattedP75}
            </span>
          </div>
        )}

        {/* Micro-Visualization Zone with Mode Switcher */}
        <div className="mt-3.5 pt-2.5 border-t border-slate-800/60">
          <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
            <span className="font-medium text-slate-400 flex items-center gap-1">
              {viewMode === 'future' ? (
                <>
                  <TrendingUp className="w-3 h-3 text-cyan-400" />
                  <span>Curva Proyectada</span>
                </>
              ) : (
                <>
                  <Target className="w-3 h-3 text-emerald-400" />
                  <span>Real vs Pronóstico</span>
                </>
              )}
            </span>

            {/* Mode Switcher */}
            <div className="bg-slate-950 p-0.5 rounded border border-slate-800 flex items-center">
              <button
                type="button"
                data-testid={`view-toggle-future-${variableData.id}`}
                onClick={() => setViewMode('future')}
                title="Ver trayectoria de pronóstico futuro"
                className={`px-1.5 py-0.5 text-[10px] font-medium rounded transition-all ${
                  viewMode === 'future'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                ↗ Futuro
              </button>
              <button
                type="button"
                data-testid={`view-toggle-reality-${variableData.id}`}
                onClick={() => setViewMode('reality')}
                title="Ver último dato real observado vs pronóstico previo del mercado"
                className={`px-1.5 py-0.5 text-[10px] font-medium rounded transition-all ${
                  viewMode === 'reality'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                🎯 Real vs Previsto
              </button>
            </div>
          </div>

          {/* Conditional View Mode */}
          {viewMode === 'future' ? (
            <ProjectionSparkline
              data={horizonData?.future_sparkline || []}
              unit={unit}
              color={sparklineColor}
              varId={variableData.id}
            />
          ) : expReality ? (
            <div className="space-y-1.5">
              {/* Closed Observation Summary Callout */}
              <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800/80 text-[11px] font-mono">
                <div className="flex items-center justify-between text-slate-400 mb-1">
                  <span>Último cerrado ({expReality.latest_period}):</span>
                  {/* Surprise Delta Badge */}
                  <div
                    className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                      expReality.status === 'favorable'
                        ? 'bg-emerald-950/50 text-emerald-400 border border-emerald-800/60'
                        : expReality.status === 'unfavorable'
                        ? 'bg-rose-950/50 text-rose-400 border border-rose-800/60'
                        : 'bg-slate-800 text-slate-300 border border-slate-700/60'
                    }`}
                  >
                    {expReality.status === 'favorable' ? (
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    ) : expReality.status === 'unfavorable' ? (
                      <XCircle className="w-3 h-3 text-rose-400" />
                    ) : (
                      <HelpCircle className="w-3 h-3 text-slate-400" />
                    )}
                    <span>
                      Sorpresa: {expReality.surprise_delta > 0 ? `+${expReality.surprise_delta}` : expReality.surprise_delta}
                      {expReality.unit.includes('%') ? ' pp' : ''}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-slate-300">
                  <span>
                    Dato Real: <strong className="text-emerald-400">{expReality.real_value.toLocaleString('es-AR')}{expReality.unit.includes('%') ? '%' : ''}</strong>
                  </span>
                  <span>
                    Previsto REM: <strong className="text-amber-400">{expReality.previous_forecast.toLocaleString('es-AR')}{expReality.unit.includes('%') ? '%' : ''}</strong>
                  </span>
                </div>
              </div>

              {/* Comparative Dual Line Chart */}
              <div>
                <RealVsForecastChart
                  history={expReality.history}
                  unit={expReality.unit}
                  varId={variableData.id}
                />
              </div>
            </div>
          ) : (
            <div className="h-11 flex items-center justify-center text-[10px] text-slate-500 font-mono italic">
              Sin datos de expectativa vs realidad
            </div>
          )}
        </div>
      </div>

      {/* Footer: Cohort & Divergence Badge */}
      <div className="mt-3 pt-2.5 border-t border-slate-800/60 flex items-center justify-between text-xs">
        <span className="text-slate-400 text-[11px]">
          Muestra: <strong className="text-slate-300">{cohort === 'top_10' ? 'Top 10' : 'Consenso Total'}</strong>
        </span>

        {divFlag ? (
          <div
            data-testid={`top10-divergence-badge-${variableData.id}`}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-950/50 text-amber-400 border border-amber-800/60 font-mono text-[10px] animate-pulse"
            title="Divergencia significativa (>= 0.3 pp) entre los 10 mejores pronosticadores y el consenso total"
          >
            <AlertTriangle className="w-3 h-3 text-amber-400" />
            <span>Div. Top 10: {top10Div > 0 ? `+${top10Div.toFixed(2)}` : top10Div.toFixed(2)}</span>
          </div>
        ) : (
          <span className="text-slate-400 font-mono text-[11px]">
            Div. Top 10: {top10Div.toFixed(2)}
          </span>
        )}
      </div>
    </div>
  )
}
