import React, { useState, useMemo } from 'react'
import { Search, ArrowUpDown, FileDown, Layers } from 'lucide-react'
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
  diasAtraso?: number
  total_cheques_rechazados: number
}

type SortField = 'situacion' | 'monto' | 'denominacion' | 'entidad'

export const PortfolioTable: React.FC<PortfolioTableProps> = ({ debtors, portfolioName = 'Portafolio' }) => {
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<SortField>('situacion')
  const [sortAsc, setSortAsc] = useState(false) // Default: worst situation first

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
      if (d.entidades && d.entidades.length > 0) {
        d.entidades.forEach((ent, idx) => {
          rows.push({
            rowId: `${d.cuit}-${ent.entidad}-${idx}`,
            cuit: d.cuit,
            cuit_formateado: d.cuit_formateado || d.cuit,
            denominacion: d.denominacion,
            entidad: ent.entidad,
            situacion: ent.situacion,
            monto: ent.monto,
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
          diasAtraso: 0,
          total_cheques_rechazados: d.total_cheques_rechazados || 0,
        })
      }
    }

    return rows
  }, [debtors])

  const filteredAndSorted = useMemo(() => {
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
      }
      return sortAsc ? comp : -comp
    })

    return list
  }, [entityRows, search, sortField, sortAsc])

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 overflow-hidden">
      {/* Table header bar */}
      <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-semibold text-slate-100">
            {portfolioName} — Detalle Comparativo por Entidad ({filteredAndSorted.length} registros)
          </h3>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar por CUIT, entidad o razón Social..."
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
              <th className="py-2.5 px-3 text-center">Días atraso</th>
              <th className="py-2.5 px-3 text-center">Cheques</th>
              <th className="py-2.5 px-3 text-right">Dossier</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-mono">
            {filteredAndSorted.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-xs text-slate-500 font-sans">
                  No se encontraron deudores ni entidades en el portafolio con ese criterio de búsqueda.
                </td>
              </tr>
            ) : (
              filteredAndSorted.map((r) => (
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
      </div>
    </div>
  )
}
