import React, { useState, useMemo, useRef, useEffect } from 'react'
import { Search, Layers, X, Filter, Check } from 'lucide-react'
import { VariableCatalogItem, KNOWN_BCRA_VARIABLES } from '../../types'

export interface VariablePickerProps {
  catalog: VariableCatalogItem[]
  selectedPrimaryIds: number[]
  selectedSecondaryIds: number[]
  onTogglePrimary: (id: number) => void
  onToggleSecondary: (id: number) => void
  onRemovePrimary?: (id: number) => void
  onRemoveSecondary?: (id: number) => void
  // Backward compatibility props
  selectedPrimaryId?: number
  selectedSecondaryId?: number
  onSelectPrimary?: (id: number) => void
  onSelectSecondary?: (id: number | undefined) => void
}

export const VariablePicker: React.FC<VariablePickerProps> = ({
  catalog,
  selectedPrimaryIds,
  selectedSecondaryIds,
  onTogglePrimary,
  onToggleSecondary,
  onRemovePrimary,
  onRemoveSecondary,
  selectedPrimaryId,
  selectedSecondaryId,
  onSelectPrimary,
  onSelectSecondary,
}) => {
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('Todas')
  const [isOpen, setIsOpen] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

  // Normalize active arrays (supporting both new multi-id props and legacy single-id props)
  const activePrimaryIds = useMemo(() => {
    if (selectedPrimaryIds && selectedPrimaryIds.length > 0) return selectedPrimaryIds
    if (selectedPrimaryId !== undefined) return [selectedPrimaryId]
    return [1]
  }, [selectedPrimaryIds, selectedPrimaryId])

  const activeSecondaryIds = useMemo(() => {
    if (selectedSecondaryIds) return selectedSecondaryIds
    if (selectedSecondaryId !== undefined) return [selectedSecondaryId]
    return []
  }, [selectedSecondaryIds, selectedSecondaryId])

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Extract unique categories
  const categories = useMemo(() => {
    const set = new Set<string>()
    catalog.forEach((item) => {
      if (item.categoria) set.add(item.categoria)
    })
    return ['Todas', ...Array.from(set).sort()]
  }, [catalog])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return catalog.filter((item) => {
      const matchesSearch =
        !q ||
        (item.descripcion || '').toLowerCase().includes(q) ||
        (item.categoria && item.categoria.toLowerCase().includes(q)) ||
        String(item.idVariable).includes(q)

      const matchesCat = selectedCategory === 'Todas' || item.categoria === selectedCategory

      return matchesSearch && matchesCat
    })
  }, [catalog, search, selectedCategory])

  const handleToggleP = (id: number) => {
    if (onTogglePrimary) {
      onTogglePrimary(id)
    } else if (onSelectPrimary) {
      onSelectPrimary(id)
    }
  }

  const handleToggleS = (id: number) => {
    if (onToggleSecondary) {
      onToggleSecondary(id)
    } else if (onSelectSecondary) {
      if (activeSecondaryIds.includes(id)) {
        onSelectSecondary(undefined)
      } else {
        onSelectSecondary(id)
      }
    }
  }

  const handleRemoveP = (id: number) => {
    if (onRemovePrimary) {
      onRemovePrimary(id)
    } else {
      handleToggleP(id)
    }
  }

  const handleRemoveS = (id: number) => {
    if (onRemoveSecondary) {
      onRemoveSecondary(id)
    } else {
      handleToggleS(id)
    }
  }

  return (
    <div className="relative" ref={popoverRef}>
      {/* Selected Variables Summary Bar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Principal Active Badges */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-mono font-semibold text-blue-400 uppercase tracking-wider mr-0.5">
            Principal:
          </span>
          {activePrimaryIds.map((id) => {
            const item = catalog.find((c) => c.idVariable === id)
            const title = item?.descripcion || KNOWN_BCRA_VARIABLES[id]?.name || `Serie #${id}`
            const unit = item?.unit || KNOWN_BCRA_VARIABLES[id]?.unit
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-950/50 border border-blue-700/60 text-xs text-blue-200 shadow-sm"
              >
                <span className="font-mono text-[10px] text-blue-400 font-semibold">#{id}</span>
                <span className="font-medium truncate max-w-[140px] sm:max-w-[200px]">
                  {title}
                </span>
                {unit && (
                  <span className="text-[10px] font-mono text-blue-300 bg-blue-900/40 px-1 rounded">
                    {unit}
                  </span>
                )}
                {activePrimaryIds.length > 1 && (
                  <button
                    onClick={() => handleRemoveP(id)}
                    className="text-blue-400 hover:text-white transition-colors ml-0.5"
                    title="Quitar de eje principal"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </span>
            )
          })}
        </div>

        {/* Dual Active Badges */}
        {activeSecondaryIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-mono font-semibold text-indigo-400 uppercase tracking-wider ml-1 mr-0.5">
              Dual:
            </span>
            {activeSecondaryIds.map((id) => {
              const item = catalog.find((c) => c.idVariable === id)
              const title = item?.descripcion || KNOWN_BCRA_VARIABLES[id]?.name || `Serie #${id}`
              const unit = item?.unit || KNOWN_BCRA_VARIABLES[id]?.unit
              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-indigo-950/50 border border-indigo-700/60 text-xs text-indigo-200 shadow-sm"
                >
                  <span className="font-mono text-[10px] text-indigo-400 font-semibold">#{id}</span>
                  <span className="font-medium truncate max-w-[140px] sm:max-w-[200px]">
                    {title}
                  </span>
                  {unit && (
                    <span className="text-[10px] font-mono text-indigo-300 bg-indigo-900/40 px-1 rounded">
                      {unit}
                    </span>
                  )}
                  <button
                    onClick={() => handleRemoveS(id)}
                    className="text-indigo-400 hover:text-white transition-colors ml-0.5"
                    title="Quitar de eje dual"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )
            })}
          </div>
        )}

        {/* Manage / Add button */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-md border text-xs font-medium transition-all cursor-pointer ${
            isOpen
              ? 'bg-blue-600 border-blue-500 text-white shadow-sm shadow-blue-500/20'
              : 'border-slate-700 bg-slate-800/80 text-slate-300 hover:text-white hover:border-slate-600'
          }`}
        >
          <Search className="w-3.5 h-3.5 text-slate-400" />
          <span>{isOpen ? 'Cerrar Selector' : 'Seleccionar Variables'}</span>
          <span className="ml-1 text-[10px] font-mono bg-slate-900 px-1.5 py-0.5 rounded text-slate-400 border border-slate-700">
            {activePrimaryIds.length + activeSecondaryIds.length}
          </span>
        </button>
      </div>

      {/* Multi-Select Popover Modal */}
      {isOpen && (
        <div className="absolute left-0 top-full mt-2 w-full sm:w-[540px] bg-slate-900 border border-slate-700 rounded-lg shadow-2xl z-50 overflow-hidden flex flex-col">
          {/* Popover Header */}
          <div className="p-3 border-b border-slate-800 bg-slate-950/80 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-400" />
                <h4 className="text-xs font-semibold text-slate-200">
                  Selector Multi-Variable BCRA
                </h4>
              </div>
              <div className="flex items-center gap-2 text-[11px] font-mono">
                <span className="text-blue-400 bg-blue-950/60 px-1.5 py-0.5 rounded border border-blue-800/40">
                  {activePrimaryIds.length} Principal
                </span>
                <span className="text-indigo-400 bg-indigo-950/60 px-1.5 py-0.5 rounded border border-indigo-800/40">
                  {activeSecondaryIds.length} Dual
                </span>
              </div>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Buscar variable BCRA por nombre o número de serie..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-md text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono transition-colors"
                autoFocus
              />
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[10px]">
              <Filter className="w-3 h-3 text-slate-500 shrink-0" />
              {categories.slice(0, 6).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2 py-0.5 rounded whitespace-nowrap transition-colors ${
                    selectedCategory === cat
                      ? 'bg-blue-600 text-white font-medium'
                      : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Variables Scroll List */}
          <div className="max-h-72 overflow-y-auto divide-y divide-slate-800/60 p-1">
            {filtered.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                No se encontraron variables con ese criterio.
              </div>
            ) : (
              filtered.map((item) => {
                const isPrimary = activePrimaryIds.includes(item.idVariable)
                const isSecondary = activeSecondaryIds.includes(item.idVariable)

                return (
                  <div
                    key={item.idVariable}
                    className={`p-2 rounded-md hover:bg-slate-800/50 flex items-center justify-between gap-3 text-xs transition-colors ${
                      isPrimary ? 'bg-blue-950/20' : isSecondary ? 'bg-indigo-950/20' : ''
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono text-[10px] text-slate-400 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                          #{item.idVariable}
                        </span>
                        <span className="text-slate-200 font-medium truncate">
                          {item.descripcion}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {item.categoria && (
                          <span className="text-[10px] text-slate-400">
                            {item.categoria}
                          </span>
                        )}
                        {item.unit && (
                          <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800/40">
                            {item.unit}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Principal Button */}
                      <button
                        onClick={() => handleToggleP(item.idVariable)}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-mono border transition-all cursor-pointer ${
                          isPrimary
                            ? 'bg-blue-600 text-white border-blue-500 font-medium shadow-sm'
                            : 'bg-slate-800 text-slate-300 border-slate-700 hover:border-blue-500/60 hover:text-white'
                        }`}
                        title="Asignar al eje izquierdo (Principal)"
                      >
                        {isPrimary && <Check className="w-3 h-3" />}
                        <span>Principal</span>
                      </button>

                      {/* Dual Button */}
                      <button
                        onClick={() => handleToggleS(item.idVariable)}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-mono border transition-all cursor-pointer ${
                          isSecondary
                            ? 'bg-indigo-600 text-white border-indigo-500 font-medium shadow-sm'
                            : 'bg-slate-800 text-slate-300 border-slate-700 hover:border-indigo-500/60 hover:text-white'
                        }`}
                        title="Asignar al eje derecho (Dual)"
                      >
                        {isSecondary && <Check className="w-3 h-3" />}
                        <span>Dual</span>
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Popover Footer */}
          <div className="p-2.5 bg-slate-950/90 border-t border-slate-800 flex items-center justify-between text-xs">
            <span className="text-[11px] text-slate-400 font-mono">
              Puede seleccionar varias en Principal y Dual simultáneamente.
            </span>
            <button
              onClick={() => setIsOpen(false)}
              className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors cursor-pointer border border-slate-700"
            >
              Listo
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
