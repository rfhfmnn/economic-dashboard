import React, { useEffect, useState, useCallback } from 'react'
import {
  Calendar,
  Users,
  AlertTriangle,
  RefreshCw,
  RotateCcw,
  Layers,
  TrendingUp,
  Percent,
  DollarSign,
  Activity,
} from 'lucide-react'
import { api } from '../../../services/api'
import { RemCohort, RemModularKpisResponse, RemSummaryResponse } from '../../../types'
import { RemModularKpiCard } from './RemModularKpiCard'
import { RemMetricCard } from './RemMetricCard'
import { CpiExpectationChart } from './CpiExpectationChart'
import { FxProjectionChart } from './FxProjectionChart'
import { RemTable } from './RemTable'

export interface RemViewProps {
  onRefresh?: () => void
}

interface CardConfig {
  variableId: string
  horizonId: string
}

const DEFAULT_CARDS: CardConfig[] = [
  { variableId: 'cpi_general', horizonId: 'next_month' },
  { variableId: 'cpi_general', horizonId: '12m' },
  { variableId: 'exchange_rate', horizonId: 'year_end_current' },
  { variableId: 'interest_rate', horizonId: '12m' },
  { variableId: 'pib', horizonId: 'year_end_current' },
  { variableId: 'exports', horizonId: 'year_end_current' },
]

export const RemView: React.FC<RemViewProps> = () => {
  const [reports, setReports] = useState<string[]>([])
  const [selectedPeriod, setSelectedPeriod] = useState<string>('ultimo')
  const [cohort, setCohort] = useState<RemCohort>('todos')
  const [summary, setSummary] = useState<RemSummaryResponse | null>(null)
  const [modularKpis, setModularKpis] = useState<RemModularKpisResponse | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  const [cardsCount, setCardsCount] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('rem_cards_count')
      return saved === '6' ? 6 : 4
    } catch {
      return 4
    }
  })

  const [cardsConfig, setCardsConfig] = useState<CardConfig[]>(() => {
    try {
      const saved = localStorage.getItem('rem_cards_config')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length >= 4) {
          return parsed
        }
      }
    } catch {}
    return DEFAULT_CARDS
  })

  // 1. Fetch available reports catalog
  useEffect(() => {
    let isMounted = true
    const loadReports = async () => {
      try {
        const list = await api.getRemReports()
        if (isMounted && list && list.length > 0) {
          setReports(list)
        }
      } catch (err: any) {
        console.warn('Failed loading REM reports catalog:', err)
      }
    }
    loadReports()
    return () => {
      isMounted = false
    }
  }, [])

  // 2. Fetch summary & modular KPIs when period or cohort changes
  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const [sumData, modData] = await Promise.all([
        api.getRemSummary(selectedPeriod, cohort).catch(() => null),
        api.getRemModularKpis(selectedPeriod, cohort).catch(() => null),
      ])
      if (sumData) setSummary(sumData)
      if (modData) setModularKpis(modData)
      if (!sumData && !modData) {
        throw new Error('Error al obtener informe REM de ArgentinaDatos / BCRA')
      }
    } catch (err: any) {
      setError(err?.message || 'Error al obtener informe REM de ArgentinaDatos / BCRA')
    } finally {
      setLoading(false)
    }
  }, [selectedPeriod, cohort])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleVariableChange = (cardIndex: number, newVarId: string) => {
    setCardsConfig((prev) => {
      const next = [...prev]
      const defaultH = modularKpis?.variables[newVarId]?.default_horizon || '12m'
      next[cardIndex] = {
        variableId: newVarId,
        horizonId: defaultH,
      }
      try {
        localStorage.setItem('rem_cards_config', JSON.stringify(next))
      } catch {}
      return next
    })
  }

  const handleHorizonChange = (cardIndex: number, newHorizonId: string) => {
    setCardsConfig((prev) => {
      const next = [...prev]
      next[cardIndex] = {
        ...next[cardIndex],
        horizonId: newHorizonId,
      }
      try {
        localStorage.setItem('rem_cards_config', JSON.stringify(next))
      } catch {}
      return next
    })
  }

  const handleResetConfig = () => {
    setCardsConfig(DEFAULT_CARDS)
    try {
      localStorage.setItem('rem_cards_config', JSON.stringify(DEFAULT_CARDS))
    } catch {}
  }

  const visibleCards = cardsConfig.slice(0, cardsCount)

  return (
    <div className="space-y-6" data-testid="rem-view-container">
      {/* Control Bar: Report Period, Cohort Switcher & Card Controls */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 backdrop-blur-sm">
        {/* Left: Report Period Dropdown */}
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="rem-period-select" className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-blue-400" />
            <span>Informe REM:</span>
          </label>
          <select
            id="rem-period-select"
            data-testid="rem-period-select"
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className="bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-1.5 text-sm font-mono text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          >
            <option value="ultimo">Último informe disponible</option>
            {reports.map((p) => (
              <option key={p} value={p}>
                Relevamiento {p}
              </option>
            ))}
          </select>
        </div>

        {/* Right Controls: Cohort Toggle + Density Switcher + Reset + Refresh */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Cohort Pill Toggle */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Muestra:</span>
            <div className="bg-slate-950 p-1 rounded-lg border border-slate-800 flex items-center gap-1">
              <button
                type="button"
                data-testid="cohort-toggle-todos"
                onClick={() => setCohort('todos')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                  cohort === 'todos'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                Todos los participantes
              </button>
              <button
                type="button"
                data-testid="cohort-toggle-top10"
                onClick={() => setCohort('top_10')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                  cohort === 'top_10'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                Top 10 Más Precisos
              </button>
            </div>
          </div>

          {/* Density Switcher: 4 vs 6 Cards */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
            <span className="text-[11px] text-slate-400 font-medium px-1">Tarjetas:</span>
            <button
              type="button"
              data-testid="cards-count-4"
              onClick={() => {
                setCardsCount(4)
                try { localStorage.setItem('rem_cards_count', '4') } catch {}
              }}
              className={`px-2 py-0.5 rounded text-xs font-mono transition-all ${
                cardsCount === 4
                  ? 'bg-blue-600 text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              4 KPIs
            </button>
            <button
              type="button"
              data-testid="cards-count-6"
              onClick={() => {
                setCardsCount(6)
                try { localStorage.setItem('rem_cards_count', '6') } catch {}
              }}
              className={`px-2 py-0.5 rounded text-xs font-mono transition-all ${
                cardsCount === 6
                  ? 'bg-blue-600 text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              6 KPIs
            </button>
          </div>

          {/* Reset Configuration Button */}
          <button
            type="button"
            data-testid="rem-reset-cards-button"
            onClick={handleResetConfig}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg border border-slate-800 transition-colors"
            title="Restablecer configuración predeterminada de tarjetas"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* Refresh Button */}
          <button
            type="button"
            data-testid="rem-refresh-button"
            onClick={fetchData}
            disabled={loading}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg border border-slate-800 transition-colors disabled:opacity-50"
            title="Actualizar datos REM"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Informative Context Banner */}
      {summary && (
        <div className="bg-slate-950/60 border border-slate-800/70 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-2 text-slate-300">
              <Calendar className="w-3.5 h-3.5 text-blue-400" />
              <span>Publicación: <strong className="font-mono text-slate-100">{summary.report_date}</strong></span>
            </div>
            <div className="flex items-center gap-2 text-slate-300">
              <Users className="w-3.5 h-3.5 text-emerald-400" />
              <span>Participantes en muestra: <strong className="font-mono text-slate-100">{summary.total_participants} entidades</strong></span>
            </div>
            <div className="flex items-center gap-2 text-slate-400">
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
              <span>Fuente: <strong className="text-slate-300">BCRA / ArgentinaDatos API</strong></span>
            </div>
          </div>

          {summary.divergence_alerts && summary.divergence_alerts.length > 0 && (
            <div className="flex items-center gap-1.5 text-amber-400 bg-amber-950/30 border border-amber-800/50 px-2.5 py-1 rounded-md font-mono">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>{summary.divergence_alerts.length} alertas de divergencia Top 10</span>
            </div>
          )}
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="bg-rose-950/40 border border-rose-800 text-rose-300 rounded-xl p-4 text-sm flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-400 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Executive KPI Grid */}
      <div
        className={`grid grid-cols-1 sm:grid-cols-2 ${cardsCount === 6 ? 'lg:grid-cols-3' : 'lg:grid-cols-4'} gap-4`}
        data-testid="rem-kpi-grid"
      >
        {modularKpis?.variables ? (
          visibleCards.map((cfg, idx) => (
            <RemModularKpiCard
              key={`${idx}-${cfg.variableId}-${cfg.horizonId}`}
              cardIndex={idx}
              selectedVariableId={cfg.variableId}
              selectedHorizonId={cfg.horizonId}
              variablesData={modularKpis.variables}
              cohort={cohort}
              onVariableChange={(newVarId) => handleVariableChange(idx, newVarId)}
              onHorizonChange={(newHId) => handleHorizonChange(idx, newHId)}
            />
          ))
        ) : summary ? (
          // Fallback to legacy summary cards if modular dataset is not present
          <>
            <RemMetricCard
              title="IPC Próximo Mes"
              period={summary.kpis.cpi_next_month.period}
              value={summary.kpis.cpi_next_month.value}
              unit={summary.kpis.cpi_next_month.unit}
              p25={summary.kpis.cpi_next_month.p25}
              p75={summary.kpis.cpi_next_month.p75}
              top10Divergence={summary.kpis.cpi_next_month.top10_divergence}
              divergenceFlag={summary.kpis.cpi_next_month.divergence_flag}
              cohort={cohort}
              icon={<TrendingUp className="w-4 h-4 text-emerald-400" />}
            />
            <RemMetricCard
              title="IPC Próximos 12M"
              period={summary.kpis.cpi_12m.period}
              value={summary.kpis.cpi_12m.value}
              unit={summary.kpis.cpi_12m.unit}
              p25={summary.kpis.cpi_12m.p25}
              p75={summary.kpis.cpi_12m.p75}
              top10Divergence={summary.kpis.cpi_12m.top10_divergence}
              divergenceFlag={summary.kpis.cpi_12m.divergence_flag}
              cohort={cohort}
              icon={<Percent className="w-4 h-4 text-blue-400" />}
            />
            <RemMetricCard
              title="Tipo de Cambio Fin de Año"
              period={summary.kpis.fx_year_end.period}
              value={summary.kpis.fx_year_end.value}
              unit={summary.kpis.fx_year_end.unit}
              p25={summary.kpis.fx_year_end.p25}
              p75={summary.kpis.fx_year_end.p75}
              top10Divergence={summary.kpis.fx_year_end.top10_divergence}
              divergenceFlag={summary.kpis.fx_year_end.divergence_flag}
              cohort={cohort}
              icon={<DollarSign className="w-4 h-4 text-amber-400" />}
            />
            <RemMetricCard
              title="Tasa Política Monetaria"
              period={summary.kpis.policy_rate.period}
              value={summary.kpis.policy_rate.value}
              unit={summary.kpis.policy_rate.unit}
              p25={summary.kpis.policy_rate.p25}
              p75={summary.kpis.policy_rate.p75}
              top10Divergence={summary.kpis.policy_rate.top10_divergence}
              divergenceFlag={summary.kpis.policy_rate.divergence_flag}
              cohort={cohort}
              icon={<Activity className="w-4 h-4 text-purple-400" />}
            />
          </>
        ) : (
          Array.from({ length: cardsCount }).map((_, i) => (
            <div
              key={i}
              className="bg-slate-900/40 border border-slate-800 rounded-xl p-5 h-44 animate-pulse"
            />
          ))
        )}
      </div>

      {/* Analytical Visualizations Section */}
      <div id="rem-visualizations-section" className="space-y-6">
        {/* Expectation vs Reality & Forecast Cone */}
        <CpiExpectationChart period={selectedPeriod} cohort={cohort} />

        {/* Nominal FX Trajectory */}
        <FxProjectionChart period={selectedPeriod} cohort={cohort} />

        {/* Multi-Indicator Detailed Consensus Breakdown Table */}
        <RemTable period={selectedPeriod} cohort={cohort} />
      </div>
    </div>
  )
}
