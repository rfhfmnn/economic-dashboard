import React, { useState, useMemo } from 'react'
import { Search, Layers } from 'lucide-react'
import type { VariableCatalogItem } from '../../types'

export interface VariablePickerProps {
  catalog: VariableCatalogItem[]
  selectedPrimaryId: number
  selectedSecondaryId?: number
  onSelectPrimary: (id: number) => void
  onSelectSecondary: (id: number | undefined) => void
}

export const VariablePicker: React.FC<VariablePickerProps> = ({
  catalog,
  selectedPrimaryId,
  selectedSecondaryId,
  onSelectPrimary,
  onSelectSecondary,
}) => {
  const [search, setSearch] = useState('')
  const [isOpen, setIsOpen] = useState(false)

  const filtered = useMemo(() => {
    if (!search.trim()) return catalog
    const q = search.toLowerCase()
    return catalog.filter(
      (item) =>
        item.descripcion.toLowerCase().includes(q) ||
        (item.categoria && item.categoria.toLowerCase().includes(q)) ||
        String(item.idVariable).includes(q)
    )
  }, [catalog, search])

  const primaryItem = catalog.find((c) => c.idVariable === selectedPrimaryId)
  const secondaryItem = selectedSecondaryId
    ? catalog.find((c) => c.idVariable === selectedSecondaryId)
    : undefined

  return (
    <div className="relative">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-slate-700 bg-slate-800 text-xs text-slate-200 hover:border-slate-600 transition-colors"
        >
          <Search className="w-3.5 h-3.5 text-slate-400" />
          <span>Variable: <strong className="text-white">{primaryItem?.descripcion || `Serie #${selectedPrimaryId}`}</strong></span>
        </button>

        {secondaryItem && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-indigo-950/40 border border-indigo-700/60 text-xs text-indigo-300">
            <Layers className="w-3 h-3 text-indigo-400" />
            <span>Dual: <strong>{secondaryItem.descripcion}</strong></span>
            <button
              onClick={() => onSelectSecondary(undefined)}
              className="ml-1 text-slate-400 hover:text-white"
              title="Quitar variable secundaria"
            >
              ×
            </button>
          </div>
        )}
      </div>

      {isOpen && (
        <div className="absolute left-0 top-full mt-2 w-full max-w-md bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-50 overflow-hidden">
          <div className="p-2 border-b border-slate-800 bg-slate-950/60 flex items-center gap-2">
            <Search className="w-4 h-4 text-slate-400 shrink-0 ml-1" />
            <input
              type="text"
              placeholder="Buscar variable BCRA por nombre o código..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-transparent text-xs text-slate-200 placeholder-slate-500 focus:outline-none"
              autoFocus
            />
          </div>

          <div className="max-h-64 overflow-y-auto divide-y divide-slate-800/60">
            {filtered.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-500">
                No se encontraron variables con ese criterio.
              </div>
            ) : (
              filtered.map((item) => {
                const isPrimary = item.idVariable === selectedPrimaryId
                const isSecondary = item.idVariable === selectedSecondaryId

                return (
                  <div
                    key={item.idVariable}
                    className="p-2.5 hover:bg-slate-800/60 flex items-center justify-between gap-3 text-xs transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[10px] text-slate-500 bg-slate-950 px-1.5 py-0.5 rounded">
                          #{item.idVariable}
                        </span>
                        <span className="text-slate-200 font-medium truncate">
                          {item.descripcion}
                        </span>
                      </div>
                      {item.categoria && (
                        <span className="text-[10px] text-slate-400 ml-1">
                          {item.categoria}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => {
                          onSelectPrimary(item.idVariable)
                          setIsOpen(false)
                        }}
                        className={`px-2 py-0.5 rounded font-mono text-[10px] border ${
                          isPrimary
                            ? 'bg-blue-600 text-white border-blue-500'
                            : 'bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-600'
                        }`}
                      >
                        {isPrimary ? 'Principal ✓' : 'Principal'}
                      </button>

                      <button
                        onClick={() => {
                          if (isSecondary) {
                            onSelectSecondary(undefined)
                          } else {
                            onSelectSecondary(item.idVariable)
                          }
                          setIsOpen(false)
                        }}
                        className={`px-2 py-0.5 rounded font-mono text-[10px] border ${
                          isSecondary
                            ? 'bg-indigo-600 text-white border-indigo-500'
                            : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-600'
                        }`}
                      >
                        {isSecondary ? 'Dual ✓' : '+ Dual'}
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
