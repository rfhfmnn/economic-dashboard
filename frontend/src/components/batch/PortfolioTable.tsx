import React, { useState, useMemo } from 'react'
import { Search, ArrowUpDown, FileDown, Layers, ChevronDown, ChevronRight, Users, Building2 } from 'lucide-react'
import type { BatchDebtorItem } from '../../types'
import { RiskBadge } from '../common/RiskBadge'
import { api } from '../../services/api'

export interface PortfolioTableProps {
  debtors: BatchDebtorItem[]
  portfolioName?: string
}

export interface PortfolioEntityRow {
  rowId: string
  cuit: string
  cuit_formateado: string
  denominacion: string
  entidad: string
  situacion: number
  monto: number
  participacionPct: number
  diasAtraso?: number
  total_cheques_rechazados: number
}

type SortField = 'situacion' | 'monto' | 'denominacion' | 'entidad' | 'cuit'

export const PortfolioTable: React.FC<PortfolioTableProps> = ({ debtors, portfolioName = 'Portafolio' }) => {
  const [viewMode, setViewMode] = useState<'flat' | 'grouped'>('flat')
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<SortField>('situacion')
  const [sortAsc, setSortAsc] = useState(false) // Default: worst situation first
  const [expandedCuits, setExpandedCuits] = useState<Record<string, boolean>>({})

  const toggleExpand = (cuit: string) => {
    setExpandedCuits((prev) => ({ ...prev, [cuit]: !prev[cuit] }))
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc)
    } else {
      setSortField(field)
      setSortAsc(field === 'denominacion' || field === 'entidad')
    }
  }

  // Flatten debtors into individual rows per Entidad Financiera
  const entityRows = useMemo<PortfolioEntityRow[]>(() => {
    const rows: PortfolioEntityRow[] = []

    for (const d of debtors) {
      const debtorTotal = d.deuda_total || 0
      if (d.entidades && d.entidades.length > 0) {
        d.entidades.forEach((ent, idx) => {
          const participacion = debtorTotal > 0 ? (ent.monto / debtorTotal) * 100 : 100
          rows.push({
            rowId: `${d.cuit}-${ent.entidad}-${idx}`,
            cuit: d.cuit,
            cuit_formateado: d.cuit_formateado || d.cuit,
            denominacion: d.denominacion,
            entidad: ent.entidad,
            situacion: ent.situacion,
            monto: ent.monto,
            participacionPct: Math.min(100, Math.max(0, participacion)),
            diasAtraso: ent.diasAtraso,
            total_cheques_rechazados: d.total_cheques_rechazados || 0,
          })
        })
      } else {
        rows.push({
          rowId: `${d.cuit}-sin-deuda`,
          cuit: d.cuit,
          cuit_formateado: d.cuit_formateado || d.cuit,
          denominacion: d.denominacion,
          entidad: 'Sin deuda bancaria informada',
          situacion: d.peor_situacion || 1,
          monto: d.deuda_total || 0,
          participacionPct: 100,
          diasAtraso: 0,
          total_cheques_rechazados: d.total_cheques_rechazados || 0,
        })
      }
    }

    return rows
  }, [debtors])

  // Filtered and sorted flat entity rows
  const filteredAndSortedFlat = useMemo(() => {
    let list = [...entityRows]

    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (r) =>
          r.denominacion.toLowerCase().includes(q) ||
          r.cuit.includes(q) ||
          r.cuit_formateado.includes(q) ||
          r.entidad.toLowerCase().includes(q)
      )
    }

    list.sort((a, b) => {
      let comp = 0
      if (sortField === 'situacion') {
        comp = a.situacion - b.situacion
      } else if (sortField === 'monto') {
        comp = a.monto - b.monto
      } else if (sortField === 'denominacion') {
        comp = a.denominacion.localeCompare(b.denominacion)
      } else if (sortField === 'entidad') {
        comp = a.entidad.localeCompare(b.entidad)
      } else if (sortField === 'cuit') {
        comp = a.cuit.localeCompare(b.cuit)
      }
      return sortAsc ? comp : -comp
    })

    return list
  }, [entityRows, search, sortField, sortAsc])

  // Filtered and sorted grouped debtor rows
  const filteredAndSortedGrouped = useMemo(() => {
    let list = [...debtors]

    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (d) =>
          d.denominacion.toLowerCase().includes(q) ||
          d.cuit.includes(q) ||
          (d.cuit_formateado && d.cuit_formateado.includes(q)) ||
          d.entidades?.some((e) => e.entidad.toLowerCase().includes(q))
      )
    }

    list.sort((a, b) => {
      let comp = 0
      if (sortField === 'situacion') {
        comp = (a.peor_situacion || 1) - (b.peor_situacion || 1)
      } else if (sortField === 'monto') {
        comp = (a.deuda_total || 0) - (b.deuda_total || 0)
      } else if (sortField === 'denominacion') {
        comp = a.denominacion.localeCompare(b.denominacion)
      } else if (sortField === 'cuit') {
        comp = a.cuit.localeCompare(b.cuit)
      }
      return sortAsc ? comp : -comp
    })

    return list
  }, [debtors, search, sortField, sortAsc])

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 overflow-hidden">
      {/* Table header bar */}
      <div className="p-4 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-semibold text-slate-100">
              {portfolioName} — Detalle Comparativo
            </h3>
          </div>

          {/* Segmented view mode toggle */}
          <div className="inline-flex items-center rounded-lg border border-slate-800 bg-slate-950 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setViewMode('flat')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium transition-colors ${
                viewMode === 'flat'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Building2 className="w-3 h-3" />
              <span>Detalle por Entidad ({entityRows.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grouped')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium transition-colors ${
                viewMode === 'grouped'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Users className="w-3 h-3" />
              <span>Consolidado por Deudor ({debtors.length})</span>
            </button>
          </div>
        </div>

        <div className="relative w-full md:w-72">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar por CUIT, Entidad o Razón Social..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-700 bg-slate-950 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Table grid */}
      <div className="overflow-x-auto">
        {viewMode === 'flat' ? (
          /* Flat Entity Table */
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-mono text-[11px] bg-slate-950/40">
                <th
                  onClick={() => handleSort('cuit')}
                  className="py-2.5 px-3 cursor-pointer hover:text-slate-200 select-none"
                >
                  <div className="flex items-center gap-1">
                    <span>CUIT / CUIL</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('denominacion')}
                  className="py-2.5 px-3 cursor-pointer hover:text-slate-200 select-none"
                >
                  <div className="flex items-center gap-1">
                    <span>Titular / Razón Social</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('entidad')}
                  className="py-2.5 px-3 cursor-pointer hover:text-slate-200 select-none"
                >
                  <div className="flex items-center gap-1">
                    <span>Entidad Financiera</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('situacion')}
                  className="py-2.5 px-3 text-center cursor-pointer hover:text-slate-200 select-none"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>Situación</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('monto')}
                  className="py-2.5 px-3 text-right cursor-pointer hover:text-slate-200 select-none"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Monto en Entidad (ARS)</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-2.5 px-3 text-right">Part. %</th>
                <th className="py-2.5 px-3 text-center">Días atraso</th>
                <th className="py-2.5 px-3 text-center">Cheques</th>
                <th className="py-2.5 px-3 text-right">Dossier</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {filteredAndSortedFlat.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-xs text-slate-500 font-sans">
                    No se encontraron deudores ni entidades en el portafolio con ese criterio de búsqueda.
                  </td>
                </tr>
              ) : (
                filteredAndSortedFlat.map((r) => (
                  <tr key={r.rowId} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-slate-300">
                      {r.cuit_formateado}
                    </td>
                    <td className="py-2.5 px-3 font-sans font-medium text-slate-100 max-w-xs truncate" title={r.denominacion}>
                      {r.denominacion}
                    </td>
                    <td className="py-2.5 px-3 font-sans font-medium text-slate-200 max-w-xs truncate" title={r.entidad}>
                      {r.entidad}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <RiskBadge situacion={r.situacion} size="sm" variant="solid" />
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-slate-100 tabular-nums">
                      ${r.monto?.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) || '0'}
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-slate-300">
                      <span className={r.participacionPct >= 50 ? 'text-amber-400 font-semibold' : ''}>
                        {r.participacionPct.toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center tabular-nums text-slate-400">
                      {r.diasAtraso && r.diasAtraso > 0 ? (
                        <span className="text-amber-400 font-bold">{r.diasAtraso} d</span>
                      ) : (
                        <span>0 d</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center tabular-nums">
                      <span className={r.total_cheques_rechazados > 0 ? 'text-rose-400 font-bold' : 'text-slate-500'}>
                        {r.total_cheques_rechazados || 0}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => window.open(api.getExportPdfUrl(r.cuit), '_blank')}
                        className="p-1.5 rounded text-slate-400 hover:text-blue-400 hover:bg-slate-800 transition-colors"
                        title={`Descargar dossier PDF de ${r.denominacion}`}
                      >
                        <FileDown className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        ) : (
          /* Consolidated Debtor Table */
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-mono text-[11px] bg-slate-950/40">
                <th className="py-2.5 px-3 w-8"></th>
                <th
                  onClick={() => handleSort('cuit')}
                  className="py-2.5 px-3 cursor-pointer hover:text-slate-200 select-none"
                >
                  <div className="flex items-center gap-1">
                    <span>CUIT / CUIL</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('denominacion')}
                  className="py-2.5 px-3 cursor-pointer hover:text-slate-200 select-none"
                >
                  <div className="flex items-center gap-1">
                    <span>Titular / Razón Social</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('situacion')}
                  className="py-2.5 px-3 text-center cursor-pointer hover:text-slate-200 select-none"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>Peor Situación</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('monto')}
                  className="py-2.5 px-3 text-right cursor-pointer hover:text-slate-200 select-none"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Deuda Total (ARS)</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-2.5 px-3 text-center">Entidades</th>
                <th className="py-2.5 px-3 text-center">Cheques Rech.</th>
                <th className="py-2.5 px-3 text-right">Dossier</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {filteredAndSortedGrouped.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-xs text-slate-500 font-sans">
                    No se encontraron deudores en el portafolio con ese criterio de búsqueda.
                  </td>
                </tr>
              ) : (
                filteredAndSortedGrouped.map((d) => {
                  const isExpanded = !!expandedCuits[d.cuit]
                  return (
                    <React.Fragment key={d.cuit}>
                      <tr className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-2.5 px-2 text-center">
                          {d.entidades && d.entidades.length > 0 && (
                            <button
                              type="button"
                              onClick={() => toggleExpand(d.cuit)}
                              className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
                              title={isExpanded ? 'Ocultar entidades' : 'Ver entidades'}
                            >
                              {isExpanded ? (
                                <ChevronDown className="w-3.5 h-3.5" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5" />
                              )}
                            </button>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-slate-300">
                          {d.cuit_formateado || d.cuit}
                        </td>
                        <td className="py-2.5 px-3 font-sans font-medium text-slate-100 max-w-xs truncate" title={d.denominacion}>
                          {d.denominacion}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <RiskBadge situacion={d.peor_situacion || 1} size="sm" variant="solid" />
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-100 tabular-nums">
                          ${d.deuda_total?.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) || '0'}
                        </td>
                        <td className="py-2.5 px-3 text-center tabular-nums text-slate-400">
                          <span className="font-semibold text-slate-200">{d.cantidad_entidades || d.entidades?.length || 0}</span> bancos
                        </td>
                        <td className="py-2.5 px-3 text-center tabular-nums">
                          <span className={d.total_cheques_rechazados > 0 ? 'text-rose-400 font-bold' : 'text-slate-500'}>
                            {d.total_cheques_rechazados || 0}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => window.open(api.getExportPdfUrl(d.cuit), '_blank')}
                            className="p-1.5 rounded text-slate-400 hover:text-blue-400 hover:bg-slate-800 transition-colors"
                            title={`Descargar dossier PDF de ${d.denominacion}`}
                          >
                            <FileDown className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>

                      {/* Expandable subtable of entities for this debtor */}
                      {isExpanded && d.entidades && d.entidades.length > 0 && (
                        <tr className="bg-slate-950/70 border-b border-slate-800/80">
                          <td colSpan={8} className="py-2 px-6">
                            <div className="pl-6 border-l-2 border-blue-500/50 py-1 space-y-1.5 font-sans">
                              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                                Desglose de Entidades Financieras ({d.entidades.length})
                              </span>
                              <div className="space-y-1">
                                {d.entidades.map((ent, idx) => {
                                  const part = d.deuda_total && d.deuda_total > 0 ? (ent.monto / d.deuda_total) * 100 : 100
                                  return (
                                    <div
                                      key={`${ent.entidad}-${idx}`}
                                      className="flex items-center justify-between text-xs py-1 px-2.5 rounded bg-slate-900/60 border border-slate-800/60 font-mono"
                                    >
                                      <div className="flex items-center gap-2">
                                        <RiskBadge situacion={ent.situacion} size="sm" variant="solid" />
                                        <span className="text-slate-200 font-sans font-medium">{ent.entidad}</span>
                                        {ent.diasAtraso && ent.diasAtraso > 0 ? (
                                          <span className="text-[10px] text-amber-400 font-mono">({ent.diasAtraso} d atraso)</span>
                                        ) : null}
                                      </div>
                                      <div className="flex items-center gap-3">
                                        <span className="text-slate-400 text-[11px]">
                                          {part.toFixed(1)}% part.
                                        </span>
                                        <span className="font-bold text-slate-100 tabular-nums">
                                          ${ent.monto?.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                                        </span>
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

