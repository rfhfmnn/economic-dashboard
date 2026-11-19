import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Search, X, AlertCircle, Loader2 } from 'lucide-react'
import { api } from '../../services/api'
import type { WorkbenchCatalogItem, WorkbenchSource } from '../../types'

export interface UniversalSearchBarProps {
  catalog?: WorkbenchCatalogItem[]
  activeSeriesIds: string[]
  onSelectSeries: (item: WorkbenchCatalogItem) => void
  maxSeriesReached: boolean
}

const SOURCE_BADGES: Record<WorkbenchSource, { label: string; className: string }> = {
  BCRA: { label: 'BCRA', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300' },
  INDEC: { label: 'INDEC', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300' },
  FX: { label: 'FX', className: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300' },
  REM: { label: 'REM', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300' },
}

export const UniversalSearchBar: React.FC<UniversalSearchBarProps> = ({
  catalog,
  activeSeriesIds,
  onSelectSeries,
  maxSeriesReached,
}) => {
  const [query, setQuery] = useState('')
  const [selectedSource, setSelectedSource] = useState<string>('all')
  const [isOpen, setIsOpen] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [results, setResults] = useState<WorkbenchCatalogItem[]>(catalog || [])
  const containerRef = useRef<HTMLDivElement>(null)
  const requestIdRef = useRef(0)
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Sync initial catalog prop if results are empty
  useEffect(() => {
    if (catalog && catalog.length > 0 && results.length === 0 && !query) {
      setResults(catalog)
    }
  }, [catalog, results.length, query])

  // Asynchronous performSearch with race condition prevention
  const performSearch = useCallback(
    async (qText: string, sourceFilter: string) => {
      const currentRequestId = ++requestIdRef.current
      setIsSearching(true)
      try {
        const sourceParam = sourceFilter === 'all' ? undefined : sourceFilter
        const queryParam = qText.trim() ? qText.trim() : undefined
        const data = await api.getWorkbenchCatalog(queryParam, sourceParam, 50)
        // Race condition guard: only update if this is still the most recent request
        if (requestIdRef.current === currentRequestId) {
          setResults(data)
        }
      } catch (err) {
        if (requestIdRef.current === currentRequestId) {
          console.error('Failed to search workbench catalog:', err)
        }
      } finally {
        if (requestIdRef.current === currentRequestId) {
          setIsSearching(false)
        }
      }
    },
    []
  )

  // Debounced search trigger (300 ms)
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    searchTimeoutRef.current = setTimeout(() => {
      performSearch(query, selectedSource)
    }, 300)

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [query, selectedSource, performSearch])

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Source pill filters */}
      <div className="flex items-center gap-1.5 mb-2 overflow-x-auto no-scrollbar py-0.5">
        <span className="text-xs text-slate-500 dark:text-slate-400 font-medium mr-1 whitespace-nowrap">
          Filtrar por origen:
        </span>
        {[
          { id: 'all', label: 'Todas' },
          { id: 'BCRA', label: 'BCRA' },
          { id: 'INDEC', label: 'INDEC' },
          { id: 'FX', label: 'FX' },
          { id: 'REM', label: 'REM' },
        ].map((src) => (
          <button
            key={src.id}
            type="button"
            onClick={() => {
              setSelectedSource(src.id)
              setIsOpen(true)
            }}
            className={`px-2.5 py-1 text-xs rounded-full transition-colors whitespace-nowrap ${
              selectedSource === src.id
                ? 'bg-blue-600 text-white font-medium shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
            }`}
          >
            {src.label}
          </button>
        ))}
      </div>

      {/* Input row */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
          <Search className="w-4 h-4" />
        </div>
        <input
          type="text"
          value={query}
          onFocus={() => setIsOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value)
            setIsOpen(true)
          }}
          placeholder="Buscar serie en BCRA, INDEC, FX y REM..."
          className="w-full pl-9 pr-16 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
        />
        <div className="absolute inset-y-0 right-0 pr-3 flex items-center gap-1.5">
          {isSearching && (
            <Loader2 className="w-4 h-4 text-blue-500 animate-spin flex-shrink-0" data-testid="search-spinner" />
          )}
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('')
              }}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              aria-label="Limpiar búsqueda"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Limit notice */}
      {maxSeriesReached && (
        <div className="flex items-center gap-1.5 mt-1.5 text-xs text-amber-600 dark:text-amber-400">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          <span>Se ha alcanzado el límite máximo de 5 series simultáneas. Remueva una serie para agregar otra.</span>
        </div>
      )}

      {/* Dropdown results */}
      {isOpen && (
        <div className="absolute z-30 mt-1.5 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-xl max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
          {isSearching && results.length === 0 ? (
            <div className="p-4 text-center text-sm text-slate-500 dark:text-slate-400 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
              <span>Buscando series...</span>
            </div>
          ) : results.length === 0 ? (
            <div className="p-4 text-center text-sm text-slate-500 dark:text-slate-400">
              No se encontraron series que coincidan con la búsqueda.
            </div>
          ) : (
            results.map((item) => {
              const isAlreadyActive = activeSeriesIds.includes(item.id)
              const isDisabled = isAlreadyActive || maxSeriesReached
              const badge = SOURCE_BADGES[item.source] || {
                label: item.source,
                className: 'bg-slate-100 text-slate-800',
              }

              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => {
                    if (!isDisabled) {
                      onSelectSeries(item)
                      setIsOpen(false)
                      setQuery('')
                    }
                  }}
                  className={`w-full text-left px-3.5 py-2.5 flex items-center justify-between transition-colors ${
                    isDisabled
                      ? 'opacity-50 cursor-not-allowed bg-slate-50 dark:bg-slate-800/30'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 pr-2">
                    <span
                      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wider flex-shrink-0 ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                    <div className="truncate">
                      <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                        {item.name}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {item.category} • {item.unit || 'Sin unidad'} • {item.frequency || 'diaria'}
                      </div>
                    </div>
                  </div>

                  {isAlreadyActive && (
                    <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500 whitespace-nowrap flex-shrink-0">
                      En bandeja
                    </span>
                  )}
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
