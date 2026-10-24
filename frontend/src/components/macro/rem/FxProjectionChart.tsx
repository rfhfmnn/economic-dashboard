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

export interface FxProjectionChartProps {
  period?: string
  cohort?: RemCohort
}

export const FxProjectionChart: React.FC<FxProjectionChartProps> = ({
  period = 'ultimo',
  cohort = 'todos',
}) => {
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
      <div className="bg-slate-950/95 border border-slate-700/80 rounded-xl p-3.5 shadow-2xl backdrop-blur-md text-xs font-mono min-w-[240px]">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2">
          <span className="font-semibold text-slate-200">Periodo {pt.period}</span>
          <span className="text-[10px] text-slate-400 font-mono">{pt.participantes} entidades</span>
        </div>

        <div className="space-y-1.5 text-slate-300">
          <div className="flex items-center justify-between">
            <span className="text-blue-400 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
              Mediana proyectada:
            </span>
            <strong className="text-slate-100 tabular-nums">${pt.mediana.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</strong>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sky-300">Promedio:</span>
            <span className="text-slate-200 tabular-nums">${pt.promedio.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-slate-800/60 text-slate-400">
            <span>Rango P25 - P75:</span>
            <span className="text-slate-200 tabular-nums">${pt.p25.toFixed(0)} — ${pt.p75.toFixed(0)}</span>
          </div>

          <div className="flex items-center justify-between text-slate-400">
            <span>Rango P10 - P90:</span>
            <span className="text-slate-200 tabular-nums">${pt.p10.toFixed(0)} — ${pt.p90.toFixed(0)}</span>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-800/40">
            <span>Mínimo / Máximo:</span>
            <span className="tabular-nums">${pt.minimo.toFixed(0)} — ${pt.maximo.toFixed(0)}</span>
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
      className="bg-slate-900/70 border border-slate-800/80 rounded-xl p-5 shadow-xl backdrop-blur-sm space-y-4"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-emerald-400" />
            <h3 className="text-base font-semibold text-slate-100 tracking-tight">
              Trayectoria del Tipo de Cambio Nominal Oficial ($/USD)
            </h3>
            <span className="text-[10px] font-mono uppercase bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/30">
              {cohort === 'top_10' ? 'Top 10' : 'Consenso Total'}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Expectativas del tipo de cambio mayorista (A3500) para los próximos 6 meses y fin de período
          </p>
        </div>

        {/* Quick KPI stats */}
        <div className="flex items-center gap-3 text-xs font-mono">
          <div className="bg-slate-950/80 px-3 py-1.5 rounded-lg border border-slate-800 flex items-center gap-2">
            <span className="text-slate-400">Cierre horizonte:</span>
            <strong className="text-slate-100 tabular-nums">
              ${endPeriodFx.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
            </strong>
          </div>
          <div className="bg-slate-950/80 px-3 py-1.5 rounded-lg border border-slate-800 flex items-center gap-2">
            <TrendingUp className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-slate-400">Crawling peg prom.:</span>
            <strong className="text-blue-400 tabular-nums">+{avgCrawl.toFixed(1)}% m/m</strong>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-rose-950/40 border border-rose-800 text-rose-300 rounded-lg p-3 text-xs">
          {error}
        </div>
      )}

      {/* Chart */}
      <div className="w-full h-72 min-h-[280px]">
        {loading ? (
          <div className="w-full h-full flex items-center justify-center bg-slate-950/30 rounded-lg">
            <span className="text-xs font-mono text-slate-500 animate-pulse">Cargando proyección cambiaria...</span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={260}>
            <ComposedChart data={pointsWithCrawl} margin={{ top: 15, right: 15, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis
                dataKey="period"
                stroke="#64748b"
                tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }}
                tickLine={false}
              />
              <YAxis
                stroke="#64748b"
                domain={['auto', 'auto']}
                tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }}
                tickFormatter={(val) => `$${val}`}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={renderTooltip} />
              <Legend
                verticalAlign="top"
                align="right"
                wrapperStyle={{ paddingBottom: 10, fontSize: 12, fontFamily: 'monospace' }}
              />

              {/* 80% Confidence Band (P10 - P90) */}
              <Area
                name="Rango 80% (P10 - P90)"
                dataKey="p90"
                stroke="transparent"
                fill="rgba(16, 185, 129, 0.08)"
              />

              {/* Interquartile Band (P25 - P75) */}
              <Area
                name="Rango Intercuartil (P25 - P75)"
                dataKey="p75"
                stroke="transparent"
                fill="rgba(16, 185, 129, 0.16)"
              />

              {/* Nominal FX Median Line */}
              <Line
                name="Tipo de Cambio Mediana ($/USD)"
                type="monotone"
                dataKey="mediana"
                stroke="#10b981"
                strokeWidth={3}
                dot={{ r: 4, fill: '#10b981' }}
                activeDot={{ r: 6, fill: '#34d399' }}
              />

              {/* Average Line */}
              <Line
                name="Promedio Participantes"
                type="monotone"
                dataKey="promedio"
                stroke="#6ee7b7"
                strokeWidth={1.5}
                strokeDasharray="3 3"
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Note */}
      <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
        <Info className="w-3.5 h-3.5 flex-shrink-0 text-slate-400" />
        <span>
          Las cotizaciones corresponden a proyecciones del Tipo de Cambio Mayorista Comunicación "A" 3500 fin de período en pesos por dólar estadounidense.
        </span>
      </div>
    </div>
  )
}
