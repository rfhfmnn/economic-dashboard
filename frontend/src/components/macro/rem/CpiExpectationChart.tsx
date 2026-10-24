import React, { useEffect, useState, useMemo } from 'react'
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ReferenceLine,
} from 'recharts'
import {
  TrendingDown,
  TrendingUp,
  Sliders,
  Eye,
  Info,
} from 'lucide-react'
import { api } from '../../../services/api'
import {
  RemCohort,
  RemCpiComparisonPoint,
  RemCpiComparisonResponse,
  RemForecastConePoint,
  RemForecastConeResponse,
} from '../../../types'

export type CpiChartMode = 'comparison' | 'cone'

export interface CpiExpectationChartProps {
  period?: string
  cohort?: RemCohort
}

export const CpiExpectationChart: React.FC<CpiExpectationChartProps> = ({
  period = 'ultimo',
  cohort = 'todos',
}) => {
  const [mode, setMode] = useState<CpiChartMode>('comparison')
  const [lookback, setLookback] = useState<number>(12)
  const [coneVariable, setConeVariable] = useState<string>('ipc_nivel_general')

  const [comparisonData, setComparisonData] = useState<RemCpiComparisonResponse | null>(null)
  const [coneData, setConeData] = useState<RemForecastConeResponse | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch comparison data when lookback or cohort changes
  useEffect(() => {
    let isMounted = true
    const fetchComparison = async () => {
      try {
        setLoading(true)
        const res = await api.getRemCpiComparison(lookback, cohort)
        if (isMounted) setComparisonData(res)
      } catch (err: any) {
        if (isMounted) setError(err?.message || 'Error al cargar datos de inflación')
      } finally {
        if (isMounted) setLoading(false)
      }
    }
    fetchComparison()
    return () => {
      isMounted = false
    }
  }, [lookback, cohort])

  // Fetch forecast cone when period, coneVariable or cohort changes
  useEffect(() => {
    let isMounted = true
    const fetchCone = async () => {
      try {
        const res = await api.getRemForecastCone(coneVariable, period, cohort)
        if (isMounted) setConeData(res)
      } catch (err: any) {
        console.warn('Error fetching forecast cone:', err)
      }
    }
    fetchCone()
    return () => {
      isMounted = false
    }
  }, [coneVariable, period, cohort])

  // Custom Tooltip for Expectation vs Reality Comparison
  const renderComparisonTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null
    const data: RemCpiComparisonPoint = payload[0]?.payload
    if (!data) return null

    const isOvershoot = data.surprise_delta > 0
    const isUndershoot = data.surprise_delta < 0

    return (
      <div className="bg-slate-950/95 border border-slate-700/80 rounded-xl p-3.5 shadow-2xl backdrop-blur-md text-xs font-mono min-w-[240px]">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2">
          <span className="font-semibold text-slate-200">{data.period_label} ({data.period})</span>
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
              isUndershoot
                ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/60'
                : isOvershoot
                ? 'bg-rose-950/80 text-rose-400 border border-rose-800/60'
                : 'bg-slate-800 text-slate-300'
            }`}
          >
            {data.direction === 'undershoot' ? 'Favorable' : data.direction === 'overshoot' ? 'Overshoot' : 'En línea'}
          </span>
        </div>

        <div className="space-y-1.5 text-slate-300">
          <div className="flex items-center justify-between">
            <span className="text-emerald-400 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
              Real INDEC:
            </span>
            <strong className="text-slate-100 tabular-nums">{data.real_cpi.toFixed(2)}% m/m</strong>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-amber-400 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
              Expectativa REM:
            </span>
            <strong className="text-slate-100 tabular-nums">{data.expected_cpi.toFixed(2)}% m/m</strong>
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-slate-800/60">
            <span className="text-slate-400">Delta Sorpresa:</span>
            <span
              className={`font-bold tabular-nums ${
                isUndershoot ? 'text-emerald-400' : isOvershoot ? 'text-rose-400' : 'text-slate-300'
              }`}
            >
              {data.surprise_delta > 0 ? `+${data.surprise_delta.toFixed(2)}` : data.surprise_delta.toFixed(2)} pp
            </span>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/40">
            <span>Rango P25 - P75:</span>
            <span className="tabular-nums text-slate-300">{data.p25.toFixed(2)}% — {data.p75.toFixed(2)}%</span>
          </div>
        </div>
      </div>
    )
  }

  // Custom Tooltip for Forecast Cone
  const renderConeTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null
    const data: RemForecastConePoint = payload[0]?.payload
    if (!data) return null

    return (
      <div className="bg-slate-950/95 border border-slate-700/80 rounded-xl p-3.5 shadow-2xl backdrop-blur-md text-xs font-mono min-w-[240px]">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2">
          <span className="font-semibold text-slate-200">Periodo {data.period}</span>
          <span className="text-[10px] text-slate-400 font-mono">{data.participantes} entidades</span>
        </div>

        <div className="space-y-1.5 text-slate-300">
          <div className="flex items-center justify-between">
            <span className="text-blue-400 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
              Mediana consenso:
            </span>
            <strong className="text-slate-100 tabular-nums">{data.mediana.toFixed(2)}%</strong>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sky-300">Promedio:</span>
            <span className="text-slate-200 tabular-nums">{data.promedio.toFixed(2)}%</span>
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-slate-800/60 text-slate-400">
            <span>Rango intercuartil (P25 - P75):</span>
            <span className="text-slate-200 tabular-nums">{data.p25.toFixed(2)}% — {data.p75.toFixed(2)}%</span>
          </div>

          <div className="flex items-center justify-between text-slate-400">
            <span>Banda 80% (P10 - P90):</span>
            <span className="text-slate-200 tabular-nums">{data.p10.toFixed(2)}% — {data.p90.toFixed(2)}%</span>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-800/40">
            <span>Mínimo / Máximo:</span>
            <span className="tabular-nums">{data.minimo.toFixed(2)}% — {data.maximo.toFixed(2)}%</span>
          </div>
        </div>
      </div>
    )
  }

  // Summary accuracy calculations
  const summary = comparisonData?.summary

  // Memoized formatted comparison data
  const formattedComparison = useMemo(() => {
    if (!comparisonData?.series) return []
    return comparisonData.series
  }, [comparisonData])

  // Memoized formatted cone data with band spreads for stacked Area rendering
  const formattedCone = useMemo(() => {
    if (!coneData?.points) return []
    return coneData.points.map((pt) => ({
      ...pt,
      // For Recharts area: lower base = p10, band1 = p25 - p10, band2 = p75 - p25, band3 = p90 - p75
      base_p10: pt.p10,
      band_p10_p25: Math.max(0, pt.p25 - pt.p10),
      band_iqr: Math.max(0, pt.p75 - pt.p25),
      band_p75_p90: Math.max(0, pt.p90 - pt.p75),
    }))
  }, [coneData])

  return (
    <div
      data-testid="cpi-expectation-chart"
      className="bg-slate-900/70 border border-slate-800/80 rounded-xl p-5 shadow-xl backdrop-blur-sm space-y-4"
    >
      {/* Chart Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-slate-100 tracking-tight">
              {mode === 'comparison'
                ? 'Expectativa vs. Realidad: Inflación Mensual (INDEC vs. REM)'
                : 'Cono de Proyección de Inflación (Fan Chart REM)'}
            </h3>
            <span className="text-[10px] font-mono uppercase bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded border border-blue-500/30">
              {cohort === 'top_10' ? 'Top 10' : 'Consenso Total'}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            {mode === 'comparison'
              ? 'Contraste entre el IPC mensual oficial publicado por INDEC y la proyección del REM previa a la publicación'
              : 'Trayectoria proyectada con bandas de confianza intercuartil (P25 - P75) y percentil 80 (P10 - P90)'}
          </p>
        </div>

        {/* View Mode & Timeframe Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Mode Switcher */}
          <div className="bg-slate-950 p-1 rounded-lg border border-slate-800 flex items-center gap-1">
            <button
              type="button"
              data-testid="mode-toggle-comparison"
              onClick={() => setMode('comparison')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
                mode === 'comparison'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Histórico (vs. Real)</span>
            </button>
            <button
              type="button"
              data-testid="mode-toggle-cone"
              onClick={() => setMode('cone')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
                mode === 'cone'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Cono Fan Chart</span>
            </button>
          </div>

          {/* Secondary Controls: Lookback (if comparison) or Variable (if cone) */}
          {mode === 'comparison' ? (
            <div className="bg-slate-950 p-1 rounded-lg border border-slate-800 flex items-center gap-1">
              {[6, 12, 18].map((m) => (
                <button
                  key={m}
                  type="button"
                  data-testid={`lookback-btn-${m}`}
                  onClick={() => setLookback(m)}
                  className={`px-2.5 py-1 text-xs font-mono rounded transition-colors ${
                    lookback === m
                      ? 'bg-slate-800 text-blue-400 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {m}M
                </button>
              ))}
            </div>
          ) : (
            <select
              data-testid="cone-variable-select"
              value={coneVariable}
              onChange={(e) => setConeVariable(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs font-mono text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="ipc_nivel_general">IPC Nivel General</option>
              <option value="ipc_nucleo">IPC Núcleo</option>
            </select>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-rose-950/40 border border-rose-800 text-rose-300 rounded-lg p-3 text-xs">
          {error}
        </div>
      )}

      {/* Accuracy Summary Bar (Visible in Comparison Mode) */}
      {mode === 'comparison' && summary && (
        <div
          data-testid="cpi-accuracy-summary"
          className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-950/60 border border-slate-800/70 rounded-xl p-3 text-xs font-mono"
        >
          <div className="flex items-center justify-between sm:justify-start gap-2">
            <span className="text-slate-400">Error Absoluto Medio (MAE):</span>
            <strong className="text-slate-100 tabular-nums">{summary.mean_absolute_error.toFixed(2)} pp</strong>
          </div>

          <div className="flex items-center justify-between sm:justify-start gap-2">
            <span className="text-slate-400">Sesgo de proyección:</span>
            <strong
              className={`tabular-nums ${
                summary.average_bias > 0
                  ? 'text-rose-400'
                  : summary.average_bias < 0
                  ? 'text-emerald-400'
                  : 'text-slate-200'
              }`}
            >
              {summary.average_bias > 0 ? `+${summary.average_bias.toFixed(2)}` : summary.average_bias.toFixed(2)} pp
            </strong>
          </div>

          <div className="flex items-center justify-between sm:justify-start gap-2">
            <span className="text-slate-400">Última sorpresa ({summary.latest_month}):</span>
            <span
              className={`font-semibold tabular-nums flex items-center gap-1 ${
                summary.latest_surprise > 0 ? 'text-rose-400' : 'text-emerald-400'
              }`}
            >
              {summary.latest_surprise > 0 ? (
                <TrendingUp className="w-3 h-3 text-rose-400" />
              ) : (
                <TrendingDown className="w-3 h-3 text-emerald-400" />
              )}
              {summary.latest_surprise > 0 ? `+${summary.latest_surprise.toFixed(2)}` : summary.latest_surprise.toFixed(2)} pp
            </span>
          </div>
        </div>
      )}

      {/* Interactive Chart Container */}
      <div className="w-full h-80 min-h-[320px]">
        {loading ? (
          <div className="w-full h-full flex items-center justify-center bg-slate-950/30 rounded-lg">
            <span className="text-xs font-mono text-slate-500 animate-pulse">Cargando serie de expectativas...</span>
          </div>
        ) : mode === 'comparison' ? (
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={300}>
            <ComposedChart data={formattedComparison} margin={{ top: 15, right: 15, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis
                dataKey="period_label"
                stroke="#64748b"
                tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }}
                tickLine={false}
              />
              <YAxis
                stroke="#64748b"
                tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }}
                tickFormatter={(val) => `${val}%`}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={renderComparisonTooltip} />
              <Legend
                verticalAlign="top"
                align="right"
                wrapperStyle={{ paddingBottom: 10, fontSize: 12, fontFamily: 'monospace' }}
              />
              <ReferenceLine y={0} stroke="#334155" />

              {/* Actual INDEC Inflation Bars */}
              <Bar
                name="Real INDEC (MoM %)"
                dataKey="real_cpi"
                fill="#10b981"
                radius={[4, 4, 0, 0]}
                barSize={24}
              />

              {/* REM Expected Consensus Line */}
              <Line
                name="Expectativa REM previa (% m/m)"
                type="monotone"
                dataKey="expected_cpi"
                stroke="#f59e0b"
                strokeWidth={2.5}
                strokeDasharray="4 4"
                dot={{ r: 4, fill: '#f59e0b', strokeWidth: 0 }}
                activeDot={{ r: 6, fill: '#fbbf24' }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={300}>
            <ComposedChart data={formattedCone} margin={{ top: 15, right: 15, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis
                dataKey="period"
                stroke="#64748b"
                tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }}
                tickLine={false}
              />
              <YAxis
                stroke="#64748b"
                tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }}
                tickFormatter={(val) => `${val}%`}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={renderConeTooltip} />
              <Legend
                verticalAlign="top"
                align="right"
                wrapperStyle={{ paddingBottom: 10, fontSize: 12, fontFamily: 'monospace' }}
              />

              {/* 80% Percentile Spread (P10 - P90) */}
              <Area
                name="Rango 80% (P10 - P90)"
                dataKey="p90"
                stroke="transparent"
                fill="rgba(59, 130, 246, 0.08)"
              />
              {/* Interquartile Range (P25 - P75) */}
              <Area
                name="Rango Intercuartil (P25 - P75)"
                dataKey="p75"
                stroke="transparent"
                fill="rgba(59, 130, 246, 0.16)"
              />

              {/* Consensus Median Line */}
              <Line
                name="Mediana Proyectada (% m/m)"
                type="monotone"
                dataKey="mediana"
                stroke="#3b82f6"
                strokeWidth={3}
                dot={{ r: 4, fill: '#3b82f6' }}
                activeDot={{ r: 6, fill: '#60a5fa' }}
              />

              {/* Consensus Mean Line */}
              <Line
                name="Promedio Participantes"
                type="monotone"
                dataKey="promedio"
                stroke="#93c5fd"
                strokeWidth={1.5}
                strokeDasharray="3 3"
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Chart Footer Note */}
      <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
        <Info className="w-3.5 h-3.5 flex-shrink-0 text-slate-400" />
        <span>
          {mode === 'comparison'
            ? 'Los deltas sorpresa reflejan la diferencia en puntos porcentuales (pp = Real - Esperado). Valores negativos indican inflación menor a la anticipada por el mercado.'
            : 'El cono de proyección del REM muestra las expectativas a futuro recopiladas por el BCRA. Las bandas representan la dispersión de pronósticos.'}
        </span>
      </div>
    </div>
  )
}
