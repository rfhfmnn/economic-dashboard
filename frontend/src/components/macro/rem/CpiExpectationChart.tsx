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
import { useTheme } from '../../../context/ThemeContext'

export type CpiChartMode = 'comparison' | 'cone'

export interface CpiExpectationChartProps {
  period?: string
  cohort?: RemCohort
}

export const CpiExpectationChart: React.FC<CpiExpectationChartProps> = ({
  period = 'ultimo',
  cohort = 'todos',
}) => {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

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
      <div
        className={`${
          isDark
            ? 'bg-slate-950/95 border-slate-700/80 text-slate-100 shadow-2xl'
            : 'bg-white/95 border-slate-200 text-slate-900 shadow-xl'
        } border rounded-xl p-3.5 backdrop-blur-md text-xs font-sans min-w-[240px]`}
      >
        <div
          className={`flex items-center justify-between border-b pb-2 mb-2 ${
            isDark ? 'border-slate-800 text-slate-200' : 'border-slate-200 text-slate-800'
          }`}
        >
          <span className="font-semibold">{data.period_label} ({data.period})</span>
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-sans font-bold uppercase border ${
              isUndershoot
                ? isDark
                  ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800/60'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : isOvershoot
                ? isDark
                  ? 'bg-rose-950/80 text-rose-400 border-rose-800/60'
                  : 'bg-rose-50 text-rose-700 border-rose-200'
                : isDark
                ? 'bg-slate-800 text-slate-300 border-slate-700'
                : 'bg-slate-100 text-slate-700 border-slate-200'
            }`}
          >
            {data.direction === 'undershoot' ? 'Favorable' : data.direction === 'overshoot' ? 'Overshoot' : 'En línea'}
          </span>
        </div>

        <div className={`space-y-1.5 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
          <div className="flex items-center justify-between">
            <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
              Real INDEC:
            </span>
            <strong className={`${isDark ? 'text-slate-100' : 'text-slate-900'} tabular-nums`}>
              {data.real_cpi.toFixed(2)}% m/m
            </strong>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1 font-medium">
              <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
              Expectativa REM:
            </span>
            <strong className={`${isDark ? 'text-slate-100' : 'text-slate-900'} tabular-nums`}>
              {data.expected_cpi.toFixed(2)}% m/m
            </strong>
          </div>

          <div className={`flex items-center justify-between pt-1 border-t ${isDark ? 'border-slate-800/60' : 'border-slate-200'}`}>
            <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Delta Sorpresa:</span>
            <span
              className={`font-bold tabular-nums ${
                isUndershoot
                  ? isDark ? 'text-emerald-400' : 'text-emerald-600'
                  : isOvershoot
                  ? isDark ? 'text-rose-400' : 'text-rose-600'
                  : isDark ? 'text-slate-300' : 'text-slate-700'
              }`}
            >
              {data.surprise_delta > 0 ? `+${data.surprise_delta.toFixed(2)}` : data.surprise_delta.toFixed(2)} pp
            </span>
          </div>

          <div className={`flex items-center justify-between text-[11px] pt-1 border-t ${isDark ? 'border-slate-800/40 text-slate-400' : 'border-slate-200 text-slate-500'}`}>
            <span>Rango P25 - P75:</span>
            <span className={`tabular-nums ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
              {data.p25.toFixed(2)}% — {data.p75.toFixed(2)}%
            </span>
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
      <div
        className={`${
          isDark
            ? 'bg-slate-950/95 border-slate-700/80 text-slate-100 shadow-2xl'
            : 'bg-white/95 border-slate-200 text-slate-900 shadow-xl'
        } border rounded-xl p-3.5 backdrop-blur-md text-xs font-sans min-w-[240px]`}
      >
        <div
          className={`flex items-center justify-between border-b pb-2 mb-2 ${
            isDark ? 'border-slate-800 text-slate-200' : 'border-slate-200 text-slate-800'
          }`}
        >
          <span className="font-semibold">Periodo {data.period}</span>
          <span className={`text-[10px] font-sans tabular-nums ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            {data.participantes} entidades
          </span>
        </div>

        <div className={`space-y-1.5 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
          <div className="flex items-center justify-between">
            <span className="text-blue-600 dark:text-blue-400 flex items-center gap-1 font-medium">
              <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
              Mediana consenso:
            </span>
            <strong className={`${isDark ? 'text-slate-100' : 'text-slate-900'} tabular-nums`}>
              {data.mediana.toFixed(2)}%
            </strong>
          </div>

          <div className="flex items-center justify-between">
            <span className={isDark ? 'text-sky-300' : 'text-sky-700'}>Promedio:</span>
            <span className={`${isDark ? 'text-slate-200' : 'text-slate-800'} tabular-nums`}>
              {data.promedio.toFixed(2)}%
            </span>
          </div>

          <div className={`flex items-center justify-between pt-1 border-t ${isDark ? 'border-slate-800/60 text-slate-400' : 'border-slate-200 text-slate-500'}`}>
            <span>Rango intercuartil (P25 - P75):</span>
            <span className={`${isDark ? 'text-slate-200' : 'text-slate-800'} tabular-nums`}>
              {data.p25.toFixed(2)}% — {data.p75.toFixed(2)}%
            </span>
          </div>

          <div className={`flex items-center justify-between ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            <span>Banda 80% (P10 - P90):</span>
            <span className={`${isDark ? 'text-slate-200' : 'text-slate-800'} tabular-nums`}>
              {data.p10.toFixed(2)}% — {data.p90.toFixed(2)}%
            </span>
          </div>

          <div className={`flex items-center justify-between text-[11px] pt-1 border-t ${isDark ? 'border-slate-800/40 text-slate-500' : 'border-slate-200 text-slate-400'}`}>
            <span>Mínimo/máximo:</span>
            <span className="tabular-nums">
              {data.minimo.toFixed(2)}% — {data.maximo.toFixed(2)}%
            </span>
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
      className="bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800/80 rounded-xl p-5 shadow-sm dark:shadow-xl backdrop-blur-sm space-y-4"
    >
      {/* Chart Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 tracking-tight">
              {mode === 'comparison'
                ? 'Expectativa vs. realidad: inflación mensual (INDEC vs. REM)'
                : 'Cono de proyección de inflación (fan chart REM)'}
            </h3>
            <span className="text-[10px] font-sans tabular-nums uppercase bg-blue-50 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded border border-blue-200 dark:border-blue-500/30">
              {cohort === 'top_10' ? 'Top 10' : 'Consenso total'}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {mode === 'comparison'
              ? 'Contraste entre el IPC mensual oficial publicado por INDEC y la proyección del REM previa a la publicación'
              : 'Trayectoria proyectada con bandas de confianza intercuartil (P25 - P75) y percentil 80 (P10 - P90)'}
          </p>
        </div>

        {/* View Mode & Timeframe Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Mode Switcher */}
          <div className="bg-slate-100 dark:bg-slate-950 p-1 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center gap-1">
            <button
              type="button"
              data-testid="mode-toggle-comparison"
              onClick={() => setMode('comparison')}
              className={`px-3 py-1 text-xs font-sans font-medium rounded-md transition-all flex items-center gap-1.5 ${
                mode === 'comparison'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800/60'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Histórico (vs. real)</span>
            </button>
            <button
              type="button"
              data-testid="mode-toggle-cone"
              onClick={() => setMode('cone')}
              className={`px-3 py-1 text-xs font-sans font-medium rounded-md transition-all flex items-center gap-1.5 ${
                mode === 'cone'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800/60'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Cono fan chart</span>
            </button>
          </div>

          {/* Secondary Controls: Lookback (if comparison) or Variable (if cone) */}
          {mode === 'comparison' ? (
            <div className="bg-slate-100 dark:bg-slate-950 p-1 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center gap-1">
              {[6, 12, 18].map((m) => (
                <button
                  key={m}
                  type="button"
                  data-testid={`lookback-btn-${m}`}
                  onClick={() => setLookback(m)}
                  className={`px-2.5 py-1 text-xs font-sans tabular-nums rounded transition-colors ${
                    lookback === m
                      ? isDark
                        ? 'bg-slate-800 text-blue-400 font-semibold'
                        : 'bg-white text-blue-600 font-semibold shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
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
              className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1 text-xs font-sans text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-xs"
            >
              <option value="ipc_nivel_general">IPC nivel general</option>
              <option value="ipc_nucleo">IPC núcleo</option>
            </select>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 rounded-lg p-3 text-xs">
          {error}
        </div>
      )}

      {/* Accuracy Summary Bar (Visible in Comparison Mode) */}
      {mode === 'comparison' && summary && (
        <div
          data-testid="cpi-accuracy-summary"
          className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/70 rounded-xl p-3 text-xs font-sans"
        >
          <div className="flex items-center justify-between sm:justify-start gap-2">
            <span className="text-slate-600 dark:text-slate-400">Error absoluto medio (MAE):</span>
            <strong className="text-slate-900 dark:text-slate-100 tabular-nums">
              {summary.mean_absolute_error.toFixed(2)} pp
            </strong>
          </div>

          <div className="flex items-center justify-between sm:justify-start gap-2">
            <span className="text-slate-600 dark:text-slate-400">Sesgo de proyección:</span>
            <strong
              className={`tabular-nums ${
                summary.average_bias > 0
                  ? 'text-rose-600 dark:text-rose-400'
                  : summary.average_bias < 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-slate-800 dark:text-slate-200'
              }`}
            >
              {summary.average_bias > 0 ? `+${summary.average_bias.toFixed(2)}` : summary.average_bias.toFixed(2)} pp
            </strong>
          </div>

          <div className="flex items-center justify-between sm:justify-start gap-2">
            <span className="text-slate-600 dark:text-slate-400">Última sorpresa ({summary.latest_month}):</span>
            <span
              className={`font-semibold tabular-nums flex items-center gap-1 ${
                summary.latest_surprise > 0
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-emerald-600 dark:text-emerald-400'
              }`}
            >
              {summary.latest_surprise > 0 ? (
                <TrendingUp className="w-3 h-3 text-rose-600 dark:text-rose-400" />
              ) : (
                <TrendingDown className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
              )}
              {summary.latest_surprise > 0 ? `+${summary.latest_surprise.toFixed(2)}` : summary.latest_surprise.toFixed(2)} pp
            </span>
          </div>
        </div>
      )}

      {/* Interactive Chart Container */}
      <div className="w-full h-80 min-h-[320px]">
        {loading ? (
          <div className="w-full h-full flex items-center justify-center bg-slate-100 dark:bg-slate-950/30 rounded-lg">
            <span className="text-xs font-sans text-slate-500 animate-pulse">Cargando serie de expectativas...</span>
          </div>
        ) : mode === 'comparison' ? (
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={300}>
            <ComposedChart data={formattedComparison} margin={{ top: 15, right: 15, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#1e293b' : '#e2e8f0'} vertical={false} />
              <XAxis
                dataKey="period_label"
                stroke={isDark ? '#64748b' : '#475569'}
                tick={{ fill: isDark ? '#94a3b8' : '#475569', fontSize: 11, fontFamily: 'Inter, sans-serif' }}
                tickLine={false}
                axisLine={{ stroke: isDark ? '#334155' : '#cbd5e1' }}
                className="font-sans tabular-nums"
              />
              <YAxis
                stroke={isDark ? '#64748b' : '#475569'}
                tick={{ fill: isDark ? '#94a3b8' : '#475569', fontSize: 11, fontFamily: 'Inter, sans-serif' }}
                tickFormatter={(val) => `${val}%`}
                tickLine={false}
                axisLine={false}
                className="font-sans tabular-nums"
              />
              <Tooltip content={renderComparisonTooltip} />
              <Legend
                verticalAlign="top"
                align="right"
                wrapperStyle={{ paddingBottom: 10, fontSize: 12, fontFamily: 'Inter, sans-serif' }}
              />
              <ReferenceLine y={0} stroke={isDark ? '#334155' : '#cbd5e1'} />

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
              <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#1e293b' : '#e2e8f0'} vertical={false} />
              <XAxis
                dataKey="period"
                stroke={isDark ? '#64748b' : '#475569'}
                tick={{ fill: isDark ? '#94a3b8' : '#475569', fontSize: 11, fontFamily: 'Inter, sans-serif' }}
                tickLine={false}
                axisLine={{ stroke: isDark ? '#334155' : '#cbd5e1' }}
                className="font-sans tabular-nums"
              />
              <YAxis
                stroke={isDark ? '#64748b' : '#475569'}
                tick={{ fill: isDark ? '#94a3b8' : '#475569', fontSize: 11, fontFamily: 'Inter, sans-serif' }}
                tickFormatter={(val) => `${val}%`}
                tickLine={false}
                axisLine={false}
                className="font-sans tabular-nums"
              />
              <Tooltip content={renderConeTooltip} />
              <Legend
                verticalAlign="top"
                align="right"
                wrapperStyle={{ paddingBottom: 10, fontSize: 12, fontFamily: 'Inter, sans-serif' }}
              />

              {/* 80% Percentile Spread (P10 - P90) */}
              <Area
                name="Rango 80% (P10 - P90)"
                dataKey="p90"
                stroke="transparent"
                fill={isDark ? 'rgba(59, 130, 246, 0.08)' : 'rgba(59, 130, 246, 0.12)'}
              />
              {/* Interquartile Range (P25 - P75) */}
              <Area
                name="Rango intercuartil (P25 - P75)"
                dataKey="p75"
                stroke="transparent"
                fill={isDark ? 'rgba(59, 130, 246, 0.16)' : 'rgba(59, 130, 246, 0.22)'}
              />

              {/* Consensus Median Line */}
              <Line
                name="Mediana proyectada (% m/m)"
                type="monotone"
                dataKey="mediana"
                stroke="#3b82f6"
                strokeWidth={3}
                dot={{ r: 4, fill: '#3b82f6' }}
                activeDot={{ r: 6, fill: '#60a5fa' }}
              />

              {/* Consensus Mean Line */}
              <Line
                name="Promedio participantes"
                type="monotone"
                dataKey="promedio"
                stroke={isDark ? '#93c5fd' : '#2563eb'}
                strokeWidth={1.5}
                strokeDasharray="3 3"
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Chart Footer Note */}
      <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
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
