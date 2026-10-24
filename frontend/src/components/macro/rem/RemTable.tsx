import React, { useEffect, useState, useMemo } from 'react'
import {
  Table,
  Search,
  Filter,
  AlertTriangle,
  Download,
} from 'lucide-react'
import { api } from '../../../services/api'
import { RemCohort, RemTableResponse } from '../../../types'

export interface RemTableProps {
  period?: string
  cohort?: RemCohort
}

const CATEGORY_STYLES: Record<string, string> = {
  Precios: 'bg-amber-950/40 text-amber-400 border-amber-800/50',
  'Tipo de Cambio': 'bg-emerald-950/40 text-emerald-400 border-emerald-800/50',
  Tasas: 'bg-purple-950/40 text-purple-400 border-purple-800/50',
  Actividad: 'bg-blue-950/40 text-blue-400 border-blue-800/50',
  Otros: 'bg-slate-800/60 text-slate-400 border-slate-700/50',
}

export const RemTable: React.FC<RemTableProps> = ({
  period = 'ultimo',
  cohort = 'todos',
}) => {
  const [data, setData] = useState<RemTableResponse | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true
    const fetchTable = async () => {
      try {
        setLoading(true)
        const res = await api.getRemTable(period, cohort, selectedCategory)
        if (isMounted) setData(res)
      } catch (err: any) {
        if (isMounted) setError(err?.message || 'Error al cargar tabla de consenso REM')
      } finally {
        if (isMounted) setLoading(false)
      }
    }
    fetchTable()
    return () => {
      isMounted = false
    }
  }, [period, cohort, selectedCategory])

  // Filter rows by client search query
  const filteredRows = useMemo(() => {
    if (!data?.rows) return []
    if (!searchQuery.trim()) return data.rows
    const q = searchQuery.toLowerCase()
    return data.rows.filter(
      (r) =>
        r.indicador.toLowerCase().includes(q) ||
        r.periodo.toLowerCase().includes(q) ||
        r.categoria.toLowerCase().includes(q)
    )
  }, [data, searchQuery])

  // Export table rows to CSV
  const handleExportCsv = () => {
    if (!filteredRows || filteredRows.length === 0) return
    const headers = [
      'Categoría',
      'Indicador',
      'Periodo',
      'Tipo Periodo',
      'Unidad',
      'Mediana',
      'Promedio',
      'Desvío',
      'P10',
      'P25',
      'P75',
      'P90',
      'Mínimo',
      'Máximo',
      'Participantes',
      'Divergencia Top 10',
    ]

    const csvContent = [
      headers.join(';'),
      ...filteredRows.map((r) =>
        [
          r.categoria,
          `"${r.indicador}"`,
          r.periodo,
          r.periodoTipo,
          r.unidad,
          r.mediana,
          r.promedio,
          r.desvio,
          r.p10,
          r.p25,
          r.p75,
          r.p90,
          r.minimo,
          r.maximo,
          r.participantes,
          r.top10_divergence,
        ].join(';')
      ),
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `rem_consenso_${period}_${cohort}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const formatNumber = (val: number, unit: string) => {
    const isCurrency = unit.includes('$') || unit.toLowerCase().includes('usd')
    if (isCurrency) {
      return `$${val.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`
    }
    return val.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })
  }

  return (
    <div
      data-testid="rem-table-container"
      className="bg-slate-900/70 border border-slate-800/80 rounded-xl p-5 shadow-xl backdrop-blur-sm space-y-4"
    >
      {/* Table Header and Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Table className="w-4 h-4 text-blue-400" />
            <h3 className="text-base font-semibold text-slate-100 tracking-tight">
              Tabla Integral de Consenso del Relevamiento (REM)
            </h3>
            <span className="text-[10px] font-mono uppercase bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700">
              {filteredRows.length} indicadores
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Distribución completa de pronósticos de mercado, percentiles y desvíos estandarizados
          </p>
        </div>

        {/* Action Controls: Search & CSV Export */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Search Input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              data-testid="rem-table-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar indicador o periodo..."
              className="bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 w-52 font-mono"
            />
          </div>

          {/* Export CSV Button */}
          <button
            type="button"
            data-testid="rem-table-export-csv"
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700/80 text-slate-200 border border-slate-700 text-xs font-medium transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Exportar CSV</span>
          </button>
        </div>
      </div>

      {/* Category Filter Pills */}
      <div className="flex flex-wrap items-center gap-1.5" data-testid="rem-category-filters">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 mr-1 flex items-center gap-1">
          <Filter className="w-3 h-3 text-slate-400" />
          Categoría:
        </span>
        {['all', 'Precios', 'Tipo de Cambio', 'Tasas', 'Actividad'].map((cat) => (
          <button
            key={cat}
            type="button"
            data-testid={`category-filter-${cat}`}
            onClick={() => setSelectedCategory(cat)}
            className={`px-3 py-1 text-xs font-medium rounded-lg border transition-all ${
              selectedCategory === cat
                ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                : 'bg-slate-950/80 text-slate-400 hover:text-slate-200 border-slate-800 hover:border-slate-700'
            }`}
          >
            {cat === 'all' ? 'Todas' : cat}
          </button>
        ))}
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-rose-950/40 border border-rose-800 text-rose-300 rounded-lg p-3 text-xs">
          {error}
        </div>
      )}

      {/* Table Element */}
      <div className="overflow-x-auto border border-slate-800/80 rounded-xl bg-slate-950/40">
        <table className="w-full text-left border-collapse" data-testid="rem-breakdown-table">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-900/80 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              <th className="py-3 px-4">Indicador / Variable</th>
              <th className="py-3 px-3">Horizonte</th>
              <th className="py-3 px-3 text-right">Mediana</th>
              <th className="py-3 px-3 text-right">Promedio</th>
              <th className="py-3 px-3 text-right">Desvío</th>
              <th className="py-3 px-3 text-center">Rango (P25 — P75)</th>
              <th className="py-3 px-3 text-center">Rango (P10 — P90)</th>
              <th className="py-3 px-2 text-center">Resp.</th>
              <th className="py-3 px-3 text-right">Div. Top 10</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50 text-xs">
            {loading ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-slate-500 font-mono animate-pulse">
                  Cargando distribución de pronósticos...
                </td>
              </tr>
            ) : filteredRows.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-slate-500 font-mono">
                  No se encontraron indicadores con los filtros seleccionados.
                </td>
              </tr>
            ) : (
              filteredRows.map((row, i) => {
                const catClass = CATEGORY_STYLES[row.categoria] || CATEGORY_STYLES.Otros
                return (
                  <tr
                    key={`${row.indicador}-${row.periodo}-${i}`}
                    className="hover:bg-slate-900/60 transition-colors"
                  >
                    {/* Indicador & Category Tag */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border ${catClass}`}
                        >
                          {row.categoria}
                        </span>
                        <span className="font-medium text-slate-200">{row.indicador}</span>
                      </div>
                    </td>

                    {/* Periodo & Unit */}
                    <td className="py-3 px-3 font-mono">
                      <div className="flex flex-col">
                        <span className="text-slate-200">{row.periodo}</span>
                        <span className="text-[10px] text-slate-400">{row.unidad}</span>
                      </div>
                    </td>

                    {/* Mediana */}
                    <td className="py-3 px-3 text-right font-mono tabular-nums font-bold text-slate-100">
                      {formatNumber(row.mediana, row.unidad)}
                    </td>

                    {/* Promedio */}
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-300">
                      {formatNumber(row.promedio, row.unidad)}
                    </td>

                    {/* Desvío */}
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-400">
                      {row.desvio.toFixed(2)}
                    </td>

                    {/* Interquartile Range P25 - P75 */}
                    <td className="py-3 px-3 text-center font-mono tabular-nums text-slate-300">
                      <span className="bg-slate-900 px-2 py-0.5 rounded border border-slate-800 text-[11px]">
                        {formatNumber(row.p25, row.unidad)} — {formatNumber(row.p75, row.unidad)}
                      </span>
                    </td>

                    {/* 80% Percentile Range P10 - P90 */}
                    <td className="py-3 px-3 text-center font-mono tabular-nums text-slate-400 text-[11px]">
                      {formatNumber(row.p10, row.unidad)} — {formatNumber(row.p90, row.unidad)}
                    </td>

                    {/* Participantes */}
                    <td className="py-3 px-2 text-center font-mono tabular-nums text-slate-400">
                      {row.participantes}
                    </td>

                    {/* Top 10 Divergence Flag */}
                    <td className="py-3 px-3 text-right font-mono tabular-nums">
                      {row.divergence_flag ? (
                        <div
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-950/60 text-amber-400 border border-amber-800/60 font-bold text-[11px]"
                          title="Divergencia significativa (>= 0.3 pp) frente al Top 10"
                        >
                          <AlertTriangle className="w-3 h-3 text-amber-400" />
                          <span>{row.top10_divergence.toFixed(2)}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-[11px]">{row.top10_divergence.toFixed(2)}</span>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
