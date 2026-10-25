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
  History,
} from 'lucide-react'
import { RemCohort, RemModularVariableData, RemSparklinePoint } from '../../../types'

export interface RemModularKpiCardProps {
  cardIndex: number
  selectedVariableId: string
  selectedHorizonId: string
  variablesData: Record<string, RemModularVariableData>
  cohort: RemCohort
  onVariableChange: (newVarId: string) => void
  onHorizonChange: (newHorizonId: string) => void
  onRemoveCard?: () => void
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
 * Interactive SVG Sparkline component rendering future or historical paths with hover tooltips.
 */
interface SparklineProps {
  data: RemSparklinePoint[]
  unit: string
  color?: string
  isHistorical?: boolean
  varId: string
}

const Sparkline: React.FC<SparklineProps> = ({
  data,
  unit,
  color = '#38bdf8',
  isHistorical = false,
  varId,
}) => {
  const [hoveredPoint, setHoveredPoint] = useState<RemSparklinePoint | null>(null)
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null)

  if (!data || data.length < 2) {
    return (
      <div className="h-11 flex items-center justify-center text-[10px] text-slate-500 font-mono italic">
        Sin puntos suficientes para serie
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

  // Coordinate mapping
  const points = data.map((d, index) => {
    const x = paddingX + (index / (data.length - 1)) * (width - paddingX * 2)
    const y = height - paddingY - ((d.value - minVal) / range) * (height - paddingY * 2)
    return { x, y, point: d }
  })

  const pathD = points.reduce((acc, pt, i) => (i === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`), '')
  const areaD = `${pathD} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`

  // Gradient ID unique per card variable
  const gradId = `spark-grad-${varId}-${isHistorical ? 'hist' : 'fut'}`

  return (
    <div className="relative mt-2" onMouseLeave={() => { setHoveredPoint(null); setHoverPos(null) }}>
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

        {/* Gradient Fill Area */}
        <path d={areaD} fill={`url(#${gradId})`} />

        {/* Trend Polyline */}
        <path
          d={pathD}
          fill="none"
          stroke={color}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Interactive Circles */}
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

      {/* Floating Micro Tooltip */}
      {hoveredPoint && hoverPos && (
        <div
          className="absolute pointer-events-none -top-7 transform -translate-x-1/2 bg-slate-950 border border-slate-700/80 px-2 py-0.5 rounded shadow-xl text-[10px] font-mono text-slate-200 z-20 whitespace-nowrap"
          style={{
            left: `${(hoverPos.x / width) * 100}%`,
          }}
        >
          <span className="text-slate-400 mr-1">{hoveredPoint.period}:</span>
          <strong className="text-slate-100">
            {hoveredPoint.value.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}
          </strong>
          <span className="text-slate-400 ml-0.5">{unit.includes('%') ? '%' : ''}</span>
        </div>
      )}
    </div>
  )
}

export const RemModularKpiCard: React.FC<RemModularKpiCardProps> = ({
  cardIndex,
  selectedVariableId,
  selectedHorizonId,
  variablesData,
  cohort,
  onVariableChange,
  onHorizonChange,
}) => {
  const [sparklineMode, setSparklineMode] = useState<'future' | 'historical'>('future')

  // Find selected variable definition or fallback to first available
  const variableKeys = Object.keys(variablesData)
  const activeVarKey = variablesData[selectedVariableId] ? selectedVariableId : (variableKeys[0] || 'cpi_general')
  const varDef = variablesData[activeVarKey]

  if (!varDef) {
    return (
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 h-44 animate-pulse flex items-center justify-center text-xs text-slate-500 font-mono">
        Cargando indicador...
      </div>
    )
  }

  // Find active horizon data or fallback to default
  const activeHorizonKey = varDef.horizons[selectedHorizonId]
    ? selectedHorizonId
    : (varDef.default_horizon || Object.keys(varDef.horizons)[0] || '12m')
  const horizonData = varDef.horizons[activeHorizonKey]

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

  const activeSparklineData = sparklineMode === 'future'
    ? (horizonData?.future_sparkline || [])
    : (horizonData?.historical_sparkline || [])

  // Thematic color for sparkline
  const sparklineColor = (() => {
    switch (activeVarKey) {
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
      data-testid={`rem-modular-kpi-card-${cardIndex}`}
      className="bg-slate-900/75 border border-slate-800/90 hover:border-slate-700/80 rounded-xl p-4 shadow-lg backdrop-blur-sm transition-all duration-200 flex flex-col justify-between"
    >
      <div>
        {/* Top Controls: Variable & Horizon Dropdowns */}
        <div className="flex items-center justify-between gap-2 mb-3">
          {/* Variable Selector */}
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <span className="flex-shrink-0">{getVariableIcon(activeVarKey)}</span>
            <select
              aria-label={`Variable para tarjeta ${cardIndex + 1}`}
              data-testid={`variable-select-${cardIndex}`}
              value={activeVarKey}
              onChange={(e) => onVariableChange(e.target.value)}
              className="bg-slate-950/90 border border-slate-700/80 rounded-lg px-2 py-1 text-xs font-semibold text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 truncate w-full cursor-pointer hover:border-slate-600 transition-colors"
            >
              {variableKeys.map((vKey) => (
                <option key={vKey} value={vKey}>
                  {variablesData[vKey].name}
                </option>
              ))}
            </select>
          </div>

          {/* Horizon Selector */}
          <div className="flex-shrink-0 max-w-[45%]">
            <select
              aria-label={`Horizonte para tarjeta ${cardIndex + 1}`}
              data-testid={`horizon-select-${cardIndex}`}
              value={activeHorizonKey}
              onChange={(e) => onHorizonChange(e.target.value)}
              className="bg-slate-950/90 border border-slate-700/80 rounded-lg px-2 py-1 text-xs font-mono text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer hover:border-slate-600 transition-colors"
            >
              {varDef.available_horizons.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Primary Value & Period Badge */}
        <div className="flex items-baseline justify-between gap-2 mt-1">
          <div className="flex items-baseline gap-2">
            <span
              data-testid={`kpi-value-${cardIndex}`}
              className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-slate-100 tracking-tight"
            >
              {formattedValue}
            </span>
            <span className="text-xs font-mono text-slate-400">{unit}</span>
          </div>

          <span
            data-testid={`kpi-period-tag-${cardIndex}`}
            className="text-[11px] font-mono bg-slate-800/90 text-slate-300 px-2 py-0.5 rounded border border-slate-700/50 flex-shrink-0"
          >
            {horizonData?.period || 'N/A'}
          </span>
        </div>

        {/* Mini Sparkline Header & Mode Switcher */}
        <div className="mt-3 pt-2.5 border-t border-slate-800/60">
          <div className="flex items-center justify-between text-[11px] text-slate-400 mb-0.5">
            <span className="font-medium text-slate-400 flex items-center gap-1">
              {sparklineMode === 'future' ? (
                <>
                  <TrendingUp className="w-3 h-3 text-cyan-400" />
                  <span>Trayectoria Proyectada</span>
                </>
              ) : (
                <>
                  <History className="w-3 h-3 text-amber-400" />
                  <span>Revisión Últimos 6 Informes</span>
                </>
              )}
            </span>

            {/* Sparkline Mode Switcher */}
            <div className="bg-slate-950 p-0.5 rounded border border-slate-800 flex items-center">
              <button
                type="button"
                data-testid={`sparkline-toggle-future-${cardIndex}`}
                onClick={() => setSparklineMode('future')}
                title="Ver curva de proyección futura"
                className={`px-1.5 py-0.5 text-[10px] font-medium rounded transition-all ${
                  sparklineMode === 'future'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                ↗ Proy.
              </button>
              <button
                type="button"
                data-testid={`sparkline-toggle-hist-${cardIndex}`}
                onClick={() => setSparklineMode('historical')}
                title="Ver historial de revisiones del consenso"
                className={`px-1.5 py-0.5 text-[10px] font-medium rounded transition-all ${
                  sparklineMode === 'historical'
                    ? 'bg-amber-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                ⟲ Hist.
              </button>
            </div>
          </div>

          {/* Sparkline Visual */}
          <Sparkline
            data={activeSparklineData}
            unit={unit}
            color={sparklineColor}
            isHistorical={sparklineMode === 'historical'}
            varId={`${activeVarKey}-${cardIndex}`}
          />
        </div>

        {/* Confidence Interquartile Band (P25 - P75) */}
        {formattedP25 && formattedP75 && (
          <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-400 bg-slate-950/40 px-2 py-1 rounded border border-slate-800/60 font-mono">
            <span className="text-slate-400 text-[10px]">Rango intercuartil (P25 - P75):</span>
            <span className="text-slate-200 tabular-nums">
              {formattedP25} — {formattedP75}
            </span>
          </div>
        )}
      </div>

      {/* Footer: Cohort Comparison & Top 10 Divergence Badge */}
      <div className="mt-3 pt-2.5 border-t border-slate-800/60 flex items-center justify-between text-xs">
        <span className="text-slate-400 text-[11px]">
          Muestra: <strong className="text-slate-300">{cohort === 'top_10' ? 'Top 10' : 'Consenso Total'}</strong>
        </span>

        {divFlag ? (
          <div
            data-testid={`top10-divergence-badge-${cardIndex}`}
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
