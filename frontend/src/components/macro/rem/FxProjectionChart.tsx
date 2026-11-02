import React, { useEffect, useState, useMemo } from 'react'
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts'
import { DollarSign, TrendingUp, Info } from 'lucide-react'
import { api } from '../../../services/api'
import { RemCohort, RemForecastConePoint, RemForecastConeResponse } from '../../../types'
import { useTheme } from '../../../context/ThemeContext'

export interface FxProjectionChartProps {
  period?: string
  cohort?: RemCohort
}

export const FxProjectionChart: React.FC<FxProjectionChartProps> = ({
  period = 'ultimo',
  cohort = 'todos',
}) => {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const [data, setData] = useState<RemForecastConeResponse | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true
    const fetchFxCone = async () => {
      try {
        setLoading(true)
        const res = await api.getRemForecastCone('tipo_de_cambio', period, cohort)
        if (isMounted) setData(res)
      } catch (err: any) {
        if (isMounted) setError(err?.message || 'Error al obtener proyección cambiaria')
      } finally {
        if (isMounted) setLoading(false)
      }
    }
    fetchFxCone()
    return () => {
      isMounted = false
    }
  }, [period, cohort])

  // Custom Tooltip formatting currency and implied monthly crawl
  const renderTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null
    const pt: RemForecastConePoint = payload[0]?.payload
    if (!pt) return null

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
          <span className="font-semibold">Periodo {pt.period}</span>
          <span className={`text-[10px] font-sans tabular-nums ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            {pt.participantes} entidades
          </span>
        </div>

        <div className={`space-y-1.5 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
          <div className="flex items-center justify-between">
            <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
              Mediana proyectada:
            </span>
            <strong className={`${isDark ? 'text-slate-100' : 'text-slate-900'} tabular-nums`}>
              ${pt.mediana.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
            </strong>
          </div>

          <div className="flex items-center justify-between">
            <span className={isDark ? 'text-sky-300' : 'text-sky-700'}>Promedio:</span>
            <span className={`${isDark ? 'text-slate-200' : 'text-slate-800'} tabular-nums`}>
              ${pt.promedio.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
            </span>
          </div>

          <div className={`flex items-center justify-between pt-1 border-t ${isDark ? 'border-slate-800/60 text-slate-400' : 'border-slate-200 text-slate-500'}`}>
            <span>Rango P25 - P75:</span>
            <span className={`${isDark ? 'text-slate-200' : 'text-slate-800'} tabular-nums`}>
              ${pt.p25.toFixed(0)} — ${pt.p75.toFixed(0)}
            </span>
          </div>

          <div className={`flex items-center justify-between ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            <span>Rango P10 - P90:</span>
            <span className={`${isDark ? 'text-slate-200' : 'text-slate-800'} tabular-nums`}>
              ${pt.p10.toFixed(0)} — ${pt.p90.toFixed(0)}
            </span>
          </div>

          <div className={`flex items-center justify-between text-[11px] pt-1 border-t ${isDark ? 'border-slate-800/40 text-slate-500' : 'border-slate-200 text-slate-400'}`}>
            <span>Mínimo/máximo:</span>
            <span className="tabular-nums">
              ${pt.minimo.toFixed(0)} — ${pt.maximo.toFixed(0)}
            </span>
          </div>
        </div>
      </div>
    )
  }

  // Calculate implied crawl rates between consecutive months
  const pointsWithCrawl = useMemo(() => {
    if (!data?.points || data.points.length === 0) return []
    return data.points.map((pt, idx, arr) => {
      let crawlPct = 0
      if (idx > 0 && arr[idx - 1].mediana > 0) {
        crawlPct = ((pt.mediana - arr[idx - 1].mediana) / arr[idx - 1].mediana) * 100
      }
      return {
        ...pt,
        crawlPct: Number(crawlPct.toFixed(2)),
      }
    })
  }, [data])

  const avgCrawl = useMemo(() => {
    if (pointsWithCrawl.length < 2) return 0
    const diffs = pointsWithCrawl.slice(1).map((p) => p.crawlPct)
    return diffs.reduce((a, b) => a + b, 0) / diffs.length
  }, [pointsWithCrawl])

  const endPeriodFx = pointsWithCrawl[pointsWithCrawl.length - 1]?.mediana || 0

  return (
    <div
      data-testid="fx-projection-chart"
      className="bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800/80 rounded-xl p-5 shadow-sm dark:shadow-xl backdrop-blur-sm space-y-4"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 tracking-tight">
              Trayectoria del tipo de cambio nominal oficial ($/USD)
            </h3>
            <span className="text-[10px] font-sans tabular-nums uppercase bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-500/30">
              {cohort === 'top_10' ? 'Top 10' : 'Consenso total'}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Expectativas del tipo de cambio mayorista (A3500) para los próximos 6 meses y fin de período
          </p>
        </div>

        {/* Quick KPI stats */}
        <div className="flex items-center gap-3 text-xs font-sans">
          <div className="bg-slate-50 dark:bg-slate-950/80 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center gap-2 shadow-xs">
            <span className="text-slate-600 dark:text-slate-400">Cierre horizonte:</span>
            <strong className="text-slate-900 dark:text-slate-100 tabular-nums">
              ${endPeriodFx.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
            </strong>
          </div>
          <div className="bg-slate-50 dark:bg-slate-950/80 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center gap-2 shadow-xs">
            <TrendingUp className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
            <span className="text-slate-600 dark:text-slate-400">Crawling peg prom.:</span>
            <strong className="text-blue-600 dark:text-blue-400 tabular-nums">+{avgCrawl.toFixed(1)}% m/m</strong>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 rounded-lg p-3 text-xs">
          {error}
        </div>
      )}

      {/* Chart */}
      <div className="w-full h-72 min-h-[280px]">
        {loading ? (
          <div className="w-full h-full flex items-center justify-center bg-slate-100 dark:bg-slate-950/30 rounded-lg">
            <span className="text-xs font-sans text-slate-500 animate-pulse">Cargando proyección cambiaria...</span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={260}>
            <ComposedChart data={pointsWithCrawl} margin={{ top: 15, right: 15, left: 10, bottom: 5 }}>
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
                domain={['auto', 'auto']}
                tick={{ fill: isDark ? '#94a3b8' : '#475569', fontSize: 11, fontFamily: 'Inter, sans-serif' }}
                tickFormatter={(val) => `$${val}`}
                tickLine={false}
                axisLine={false}
                className="font-sans tabular-nums"
              />
              <Tooltip content={renderTooltip} />
              <Legend
                verticalAlign="top"
                align="right"
                wrapperStyle={{ paddingBottom: 10, fontSize: 12, fontFamily: 'Inter, sans-serif' }}
              />

              {/* 80% Confidence Band (P10 - P90) */}
              <Area
                name="Rango 80% (P10 - P90)"
                dataKey="p90"
                stroke="transparent"
                fill={isDark ? 'rgba(16, 185, 129, 0.08)' : 'rgba(16, 185, 129, 0.12)'}
              />

              {/* Interquartile Band (P25 - P75) */}
              <Area
                name="Rango intercuartil (P25 - P75)"
                dataKey="p75"
                stroke="transparent"
                fill={isDark ? 'rgba(16, 185, 129, 0.16)' : 'rgba(16, 185, 129, 0.22)'}
              />

              {/* Nominal FX Median Line */}
              <Line
                name="Tipo de cambio mediana ($/USD)"
                type="monotone"
                dataKey="mediana"
                stroke="#10b981"
                strokeWidth={3}
                dot={{ r: 4, fill: '#10b981' }}
                activeDot={{ r: 6, fill: '#34d399' }}
              />

              {/* Average Line */}
              <Line
                name="Promedio participantes"
                type="monotone"
                dataKey="promedio"
                stroke={isDark ? '#6ee7b7' : '#059669'}
                strokeWidth={1.5}
                strokeDasharray="3 3"
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Note */}
      <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
        <Info className="w-3.5 h-3.5 flex-shrink-0 text-slate-400" />
        <span>
          Las cotizaciones corresponden a proyecciones del tipo de cambio mayorista Comunicación "A" 3500 fin de período en pesos por dólar estadounidense.
        </span>
      </div>
    </div>
  )
}
