import React, { useState, useMemo } from 'react'
import { Search, ArrowUpDown, FileDown, Layers } from 'lucide-react'
import type { BatchDebtorItem } from '../../types'
import { RiskBadge } from '../common/RiskBadge'
import { EarlyWarningBadge } from '../common/EarlyWarningBadge'
import { api } from '../../services/api'

export interface PortfolioTableProps {
  debtors: BatchDebtorItem[]
  portfolioName?: string
}

type SortField = 'peor_situacion' | 'deuda_total' | 'alertas' | 'denominacion'

export const PortfolioTable: React.FC<PortfolioTableProps> = ({ debtors, portfolioName = 'Portafolio' }) => {
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<SortField>('peor_situacion')
  const [sortAsc, setSortAsc] = useState(false) // Default: descending (worst first)

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc)
    } else {
      setSortField(field)
      setSortAsc(field === 'denominacion')
    }
  }

  const filteredAndSorted = useMemo(() => {
    let list = [...debtors]

    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (d) =>
          d.denominacion.toLowerCase().includes(q) ||
          d.cuit.includes(q) ||
          (d.cuit_formateado && d.cuit_formateado.includes(q))
      )
    }

    list.sort((a, b) => {
      let comp = 0
      if (sortField === 'peor_situacion') {
        comp = a.peor_situacion - b.peor_situacion
      } else if (sortField === 'deuda_total') {
        comp = a.deuda_total - b.deuda_total
      } else if (sortField === 'alertas') {
        comp = (a.alertas_tempranas?.length || 0) - (b.alertas_tempranas?.length || 0)
      } else if (sortField === 'denominacion') {
        comp = a.denominacion.localeCompare(b.denominacion)
      }
      return sortAsc ? comp : -comp
    })

    return list
  }, [debtors, search, sortField, sortAsc])

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 overflow-hidden">
      {/* Table header bar */}
      <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-semibold text-slate-100">
            {portfolioName} — Detalle Comparativo ({filteredAndSorted.length} de {debtors.length})
          </h3>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar por CUIT o Razón Social..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-700 bg-slate-950 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Table grid */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400 font-mono text-[11px] bg-slate-950/40">
              <th className="py-2.5 px-3">CUIT / CUIL</th>
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
                onClick={() => handleSort('peor_situacion')}
                className="py-2.5 px-3 text-center cursor-pointer hover:text-slate-200 select-none"
              >
                <div className="flex items-center justify-center gap-1">
                  <span>Peor Sit.</span>
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th
                onClick={() => handleSort('deuda_total')}
                className="py-2.5 px-3 text-right cursor-pointer hover:text-slate-200 select-none"
              >
                <div className="flex items-center justify-end gap-1">
                  <span>Deuda Total (ARS)</span>
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th className="py-2.5 px-3 text-center">Entidades</th>
              <th className="py-2.5 px-3 text-center">Cheques</th>
              <th
                onClick={() => handleSort('alertas')}
                className="py-2.5 px-3 cursor-pointer hover:text-slate-200 select-none"
              >
                <div className="flex items-center gap-1">
                  <span>Alertas Tempranas</span>
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th className="py-2.5 px-3 text-right">Dossier</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-mono">
            {filteredAndSorted.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-xs text-slate-500 font-sans">
                  No se encontraron deudores en el portafolio con ese criterio de búsqueda.
                </td>
              </tr>
            ) : (
              filteredAndSorted.map((d) => (
                <tr key={d.cuit} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-2.5 px-3 font-semibold text-slate-300">
                    {d.cuit_formateado || d.cuit}
                  </td>
                  <td className="py-2.5 px-3 font-sans font-medium text-slate-100 max-w-xs truncate" title={d.denominacion}>
                    {d.denominacion}
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <RiskBadge situacion={d.peor_situacion} size="sm" variant="solid" />
                  </td>
                  <td className="py-2.5 px-3 text-right font-bold text-slate-100 tabular-nums">
                    ${d.deuda_total?.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) || '0'}
                  </td>
                  <td className="py-2.5 px-3 text-center text-slate-300 tabular-nums">
                    {d.cantidad_entidades || 0}
                  </td>
                  <td className="py-2.5 px-3 text-center tabular-nums">
                    <span className={d.total_cheques_rechazados > 0 ? 'text-rose-400 font-bold' : 'text-slate-500'}>
                      {d.total_cheques_rechazados || 0}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 font-sans">
                    {d.alertas_tempranas && d.alertas_tempranas.length > 0 ? (
                      <div className="flex flex-wrap gap-1 max-w-sm">
                        {d.alertas_tempranas.map((b) => (
                          <EarlyWarningBadge key={b.id} badge={b} size="sm" />
                        ))}
                      </div>
                    ) : (
                      <span className="text-[11px] text-emerald-400 font-mono">Sin alertas</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <button
                      type="button"
                      onClick={() => window.open(api.getExportPdfUrl(d.cuit), '_blank')}
                      className="p-1.5 rounded text-slate-400 hover:text-blue-400 hover:bg-slate-800 transition-colors"
                      title="Descargar Dossier PDF de este deudor"
                    >
                      <FileDown className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
