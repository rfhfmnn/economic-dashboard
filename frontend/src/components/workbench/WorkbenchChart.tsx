import React from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts'
import type { WorkbenchSeriesData, RollingCorrelationPoint } from '../../types'
import type { AlignedPoint } from '../../utils/alignment'
import type { ExpressionMode } from '../../utils/transforms'

export interface WorkbenchChartProps {
  viewMode: 'normalized' | 'correlation'
  expressionMode?: ExpressionMode
  normalization?: 'base100' | 'percent' | ExpressionMode
  alignedData: AlignedPoint[]
  activeSeries: WorkbenchSeriesData[]
  // Correlation mode data
  correlationPoints: RollingCorrelationPoint[]
  seriesAName?: string
  seriesBName?: string
}

export const WorkbenchChart: React.FC<WorkbenchChartProps> = ({
  viewMode,
  expressionMode,
  normalization,
  alignedData,
  activeSeries,
  correlationPoints,
  seriesAName,
  seriesBName,
}) => {
  const mode: ExpressionMode =
    expressionMode ??
    (normalization === 'percent'
      ? 'mom'
      : normalization === 'original' ||
        normalization === 'base100' ||
        normalization === 'mom' ||
        normalization === 'yoy'
      ? normalization
      : 'base100')
  if (activeSeries.length === 0) {
    return (
      <div className="flex items-center justify-center h-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-400 text-sm">
        No hay series activas seleccionadas en la mesa de trabajo.
      </div>
    )
  }

  if (viewMode === 'correlation') {
    // Rolling correlation chart
    const validPoints = correlationPoints.filter((p) => p.r !== null)
    if (correlationPoints.length === 0 || validPoints.length === 0) {
      return (
        <div className="flex items-center justify-center h-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-400 text-sm">
          No hay suficientes observaciones coincidentes para calcular la correlación móvil en la ventana seleccionada.
        </div>
      )
    }

    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
        <div className="mb-3 flex items-center justify-between text-xs text-slate-500">
          <span>
            Correlación móvil de Pearson ({seriesAName || 'Serie A'} vs. {seriesBName || 'Serie B'})
          </span>
          <span className="font-mono text-[11px]">Rango: [-1.00, +1.00]</span>
        </div>

        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={correlationPoints} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.2} />
              <XAxis
                dataKey="fecha"
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickLine={false}
                axisLine={{ stroke: '#cbd5e1' }}
              />
              <YAxis
                domain={[-1.0, 1.0]}
                ticks={[-1.0, -0.5, 0, 0.5, 1.0]}
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickFormatter={(val) => val.toFixed(2)}
                tickLine={false}
                axisLine={{ stroke: '#cbd5e1' }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(15, 23, 42, 0.95)',
                  borderColor: '#334155',
                  borderRadius: '0.375rem',
                  fontSize: '12px',
                  color: '#f8fafc',
                }}
                formatter={(value: any) => [
                  value !== null && value !== undefined ? Number(value).toFixed(4) : 'N/A',
                  'Coeficiente r',
                ]}
                labelFormatter={(label) => `Fecha: ${label}`}
              />
              <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3" />
              <ReferenceLine y={0.5} stroke="#10b981" strokeDasharray="2 2" opacity={0.5} />
              <ReferenceLine y={-0.5} stroke="#f43f5e" strokeDasharray="2 2" opacity={0.5} />
              <Line
                type="monotone"
                dataKey="r"
                stroke="#2563eb"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    )
  }

  // Normalized / analytical expression time-series mode
  const getModeTitle = () => {
    switch (mode) {
      case 'original':
        return 'Valores en unidad original'
      case 'base100':
        return 'Índice de base 100 dinámico (t₀ = 100)'
      case 'mom':
        return 'Variación intermensual (MoM %)'
      case 'yoy':
        return 'Variación interanual (YoY %)'
    }
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
      <div className="mb-3 flex items-center justify-between text-xs text-slate-500">
        <span>{getModeTitle()}</span>
        <span className="font-mono text-[11px]">
          {alignedData.length} observaciones cronológicas
        </span>
      </div>

      <div className="h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={alignedData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.2} />
            <XAxis
              dataKey="fecha"
              tick={{ fontSize: 11, fill: '#64748b' }}
              tickLine={false}
              axisLine={{ stroke: '#cbd5e1' }}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#64748b' }}
              tickFormatter={(val) => {
                if (mode === 'mom' || mode === 'yoy') {
                  return `${val > 0 ? '+' : ''}${Number(val).toFixed(1)}%`
                }
                if (mode === 'base100') {
                  return Number(val).toFixed(1)
                }
                return Number(val).toLocaleString('es-AR', { maximumFractionDigits: 1 })
              }}
              tickLine={false}
              axisLine={{ stroke: '#cbd5e1' }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(15, 23, 42, 0.95)',
                borderColor: '#334155',
                borderRadius: '0.375rem',
                fontSize: '12px',
                color: '#f8fafc',
              }}
              formatter={(value: any, name: any) => {
                const s = activeSeries.find((x) => x.id === name)
                const label = s ? `[${s.source}] ${s.name}` : name
                if (value === null || value === undefined || isNaN(value)) {
                  return ['N/A', label]
                }
                const num = Number(value)
                let formatted = ''
                if (mode === 'mom' || mode === 'yoy') {
                  formatted = `${num > 0 ? '+' : ''}${num.toFixed(2)}%`
                } else if (mode === 'base100') {
                  formatted = num.toFixed(2)
                } else {
                  const unitStr = s?.unit ? ` ${s.unit}` : ''
                  formatted = `${num.toLocaleString('es-AR', { maximumFractionDigits: 2 })}${unitStr}`
                }
                return [formatted, label]
              }}
              labelFormatter={(label) => `Fecha: ${label}`}
            />
            {(mode === 'mom' || mode === 'yoy') && (
              <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3" />
            )}
            {mode === 'base100' && (
              <ReferenceLine y={100} stroke="#94a3b8" strokeDasharray="3 3" />
            )}
            {activeSeries.map((s) => (
              <Line
                key={s.id}
                type={s.frequency === 'mensual' || s.frequency === 'trimestral' ? 'stepAfter' : 'monotone'}
                dataKey={s.id}
                name={s.id}
                stroke={s.color}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                connectNulls={true}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
