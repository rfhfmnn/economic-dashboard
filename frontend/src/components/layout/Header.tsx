import React, { useEffect, useState } from 'react'
import { Radio, ServerCog, WifiOff, RefreshCw } from 'lucide-react'
import { api } from '../../services/api'
import type { SystemStatusResponse } from '../../types'

export const Header: React.FC = () => {
  const [status, setStatus] = useState<SystemStatusResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  const fetchStatus = async () => {
    try {
      setLoading(true)
      const data = await api.getSystemStatus()
      setStatus(data)
      setError(false)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 30000)
    return () => clearInterval(interval)
  }, [])

  return (
    <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-40 px-6 py-3.5 transition-colors">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        {/* Brand identity */}
        <div className="flex items-center space-x-3.5">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold text-slate-100 tracking-tight">
                Monitor de coyuntura y riesgo
              </h1>
              <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                v0.1.0
              </span>
            </div>
            <p className="text-xs text-slate-400">
              BCRA, INDEC, argentina.gob, etc
            </p>
          </div>
        </div>

        {/* System telemetry status pill */}
        <div className="flex items-center space-x-3 text-xs">
          {error ? (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/30 font-medium">
              <WifiOff className="w-3.5 h-3.5" />
              <span>Offline/Conexión interrumpida</span>
            </div>
          ) : status?.offline_mode || !status?.bcra_connected ? (
            <div
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 font-medium"
              title="Respaldo sintético activo. Operatividad completa sin conexión externa."
            >
              <ServerCog className="w-3.5 h-3.5" />
              <span>Modo mock sintético activo</span>
            </div>
          ) : (
            <div
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-medium"
              title="Conectado exitosamente a BCRA y DolarApi"
            >
              <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
              <span>BCRA API en línea</span>
            </div>
          )}


          <button
            onClick={fetchStatus}
            disabled={loading}
            className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            title="Refrescar estado del sistema"
            aria-label="Refrescar estado"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
    </header>
  )
}
