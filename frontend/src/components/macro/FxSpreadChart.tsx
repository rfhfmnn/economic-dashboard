import React from 'react'
import { TrendingUp } from 'lucide-react'
import type { FxSpreadsResponse } from '../../types'

export interface FxSpreadChartProps {
  fxData: FxSpreadsResponse | null
  loading?: boolean
}

export const FxSpreadChart: React.FC<FxSpreadChartProps> = ({ fxData, loading = false }) => {
  if (loading || !fxData) {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-5 animate-pulse">
        <div className="h-5 w-48 bg-slate-800 rounded mb-4"></div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 bg-slate-800/60 rounded"></div>
          ))}
        </div>
      </div>
    )
  }

  const oficial_base = fxData.oficial_base || 0
  const rates = fxData.rates || {}
  const spreads = fxData.spreads || {}
  const timestamp = fxData.timestamp

  let formattedTime = 'Reciente'
  try {
    if (timestamp) {
      const parsedDate = new Date(timestamp)
      if (!isNaN(parsedDate.getTime())) {
        formattedTime = parsedDate.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
      }
    }
  } catch {
    formattedTime = 'Reciente'
  }

  const fxCards = [
    { key: 'oficial', label: 'Oficial Mayorista', desc: 'A3500 BCRA' },
    { key: 'mep', label: 'Dólar MEP', desc: 'Mercado Electrónico' },
    { key: 'ccl', label: 'Dólar CCL', desc: 'Contado con Liquidación' },
    { key: 'blue', label: 'Dólar Blue', desc: 'Informal / Paralelo' },
  ]

  const getSpreadBadgeClass = (brecha: number) => {
    if (brecha > 40) return 'bg-rose-500/15 text-rose-400 border-rose-500/30'
    if (brecha > 20) return 'bg-amber-500/15 text-amber-400 border-amber-500/30'
    return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <span>Monitor Cambiario & Brecha Financiera</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Cotizaciones de tipos de cambio financieros y dispersión respecto al dólar mayorista oficial
          </p>
        </div>

        <span className="text-[11px] font-mono text-slate-500">
          Act: {formattedTime}
        </span>
      </div>

      {/* FX Rates Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {fxCards.map((card) => {
          const rate = rates[card.key]
          const spread = spreads[card.key]
          const venta = rate?.venta || (card.key === 'oficial' ? oficial_base : 0)
          const compra = rate?.compra || 0

          return (
            <div
              key={card.key}
              className="rounded-lg border border-slate-800 bg-slate-950/60 p-3.5 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-200">{card.label}</span>
                  {spread && (
                    <span
                      className={`text-[11px] font-mono px-1.5 py-0.5 rounded border ${getSpreadBadgeClass(
                        spread.brecha_porcentaje
                      )}`}
                    >
                      +{spread.brecha_porcentaje.toFixed(1)}%
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-slate-500">{card.desc}</p>
              </div>

              <div className="mt-3">
                <div className="flex items-baseline justify-between font-mono">
                  <div>
                    <span className="text-[10px] text-slate-500 block">Venta</span>
                    <span className="text-lg font-bold text-slate-100 tabular-nums">
                      ${venta.toFixed(2)}
                    </span>
                  </div>
                  {compra > 0 && (
                    <div className="text-right">
                      <span className="text-[10px] text-slate-500 block">Compra</span>
                      <span className="text-xs text-slate-400 tabular-nums">${compra.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Brecha Cambiaria Summary Bar */}
      <div className="mt-4 p-3 rounded-lg border border-slate-800 bg-slate-950/40 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-300">Brecha Cambiaria Máxima:</span>
          {spreads?.blue && (
            <span
              className={`font-mono font-bold px-2 py-0.5 rounded border ${getSpreadBadgeClass(
                Math.max(spreads?.mep?.brecha_porcentaje || 0, spreads?.ccl?.brecha_porcentaje || 0, spreads?.blue?.brecha_porcentaje || 0)
              )}`}
            >
              {Math.max(
                spreads?.mep?.brecha_porcentaje || 0,
                spreads?.ccl?.brecha_porcentaje || 0,
                spreads?.blue?.brecha_porcentaje || 0
              ).toFixed(2)}%
            </span>
          )}
        </div>

        <div className="flex items-center gap-4 text-slate-400 font-mono text-[11px]">
          <span>MEP Spread: <strong className="text-slate-200">+{spreads?.mep?.brecha_porcentaje?.toFixed(1) || '0.0'}%</strong></span>
          <span>CCL Spread: <strong className="text-slate-200">+{spreads?.ccl?.brecha_porcentaje?.toFixed(1) || '0.0'}%</strong></span>
          <span>Blue Spread: <strong className="text-slate-200">+{spreads?.blue?.brecha_porcentaje?.toFixed(1) || '0.0'}%</strong></span>
        </div>
      </div>
    </div>
  )
}
