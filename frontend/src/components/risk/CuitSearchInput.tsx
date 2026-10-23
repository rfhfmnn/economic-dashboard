import React, { useState } from 'react'
import { Search, CheckCircle2, AlertCircle, Sparkles } from 'lucide-react'
import { formatCuit, validateCuitModulo11 } from '../../utils/cuit'

export interface CuitSearchInputProps {
  onSearch: (cuit: string, bypassCache: boolean) => void
  loading?: boolean
  initialCuit?: string
}

const PRESETS = [
  { label: 'Banco Galicia', cuit: '30-50000173-5', desc: 'Entidad financiera real en BCRA' },
  { label: 'YPF S.A.', cuit: '30-54668997-9', desc: 'Gran corporativo en BCRA' },
  { label: 'Distressed (Dellepiane)', cuit: '30-71234567-1', desc: 'Sociedad Anónima real con endeudamiento' },
  { label: 'Rafael Hofmann', cuit: '20-42382181-8', desc: 'Persona física con deuda bancaria activa' },
  { label: 'Clean (Sin Deuda)', cuit: '20-30123456-3', desc: 'Perfil limpio sin deudas informadas en BCRA' },
]

export const CuitSearchInput: React.FC<CuitSearchInputProps> = ({ onSearch, loading = false, initialCuit = '30-50000173-5' }) => {
  const [cuit, setCuit] = useState(initialCuit)
  const [bypassCache, setBypassCache] = useState(false)

  React.useEffect(() => {
    if (initialCuit) {
      setCuit(initialCuit)
    }
  }, [initialCuit])

  const validation = validateCuitModulo11(cuit)
  const isValid = validation.valid

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    // If user enters 11 continuous digits, auto-format
    const digitsOnly = raw.replace(/\D/g, '')
    if (digitsOnly.length === 11) {
      setCuit(formatCuit(digitsOnly))
    } else {
      setCuit(raw)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (isValid && !loading) {
      onSearch(cuit, bypassCache)
    }
  }

  const handlePreset = (presetCuit: string) => {
    setCuit(presetCuit)
    onSearch(presetCuit, bypassCache)
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 sm:p-5 space-y-4">
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500 font-mono text-xs">
            CUIT
          </div>
          <input
            type="text"
            value={cuit}
            onChange={handleInputChange}
            placeholder="Ej: 20-30123456-3"
            maxLength={13}
            className={`w-full pl-14 pr-10 py-2.5 rounded-lg border font-mono text-sm tracking-wide bg-slate-950 text-slate-100 placeholder-slate-600 focus:outline-none transition-colors ${
              cuit.length > 0
                ? isValid
                  ? 'border-emerald-500/50 focus:border-emerald-500 ring-1 ring-emerald-500/20'
                  : 'border-rose-500/50 focus:border-rose-500 ring-1 ring-rose-500/20'
                : 'border-slate-700 focus:border-blue-500'
            }`}
          />
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
            {cuit.length > 0 && (
              isValid ? (
                <span title="Checksum Módulo 11 Válido">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                </span>
              ) : (
                <span title={validation.error}>
                  <AlertCircle className="w-4 h-4 text-rose-400" />
                </span>
              )
            )}
          </div>
        </div>

        <button
          type="submit"
          disabled={!isValid || loading}
          className={`flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg font-medium text-xs text-white transition-all shadow-sm ${
            isValid && !loading
              ? 'bg-blue-600 hover:bg-blue-500 cursor-pointer shadow-blue-500/10'
              : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
          }`}
        >
          <Search className="w-4 h-4" />
          <span>{loading ? 'Consultando...' : 'Consultar BCRA'}</span>
        </button>
      </form>

      {/* Real-time validation warning message */}
      {!isValid && cuit.length > 0 && (
        <div className="text-xs text-rose-400 flex items-center gap-1.5 font-mono">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{validation.error}</span>
        </div>
      )}

      {/* Preset CUIT test chips & cache toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 border-t border-slate-800/60">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-mono text-slate-500 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-amber-400" />
            <span>Vectores de Prueba:</span>
          </span>
          {PRESETS.map((p) => (
            <button
              key={p.cuit}
              type="button"
              onClick={() => handlePreset(p.cuit)}
              className="text-[11px] font-mono px-2 py-0.5 rounded border border-slate-700/80 bg-slate-800/60 text-slate-300 hover:text-white hover:border-slate-600 transition-colors"
              title={`${p.label} - ${p.desc}`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={bypassCache}
            onChange={(e) => setBypassCache(e.target.checked)}
            className="rounded border-slate-700 bg-slate-950 text-blue-600 focus:ring-0 w-3.5 h-3.5"
          />
          <span className="font-mono text-[11px]">Bypass Cache (Forzar consulta en vivo)</span>
        </label>
      </div>
    </div>
  )
}
