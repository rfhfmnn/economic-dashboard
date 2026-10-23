/**
 * Typed API client for the BCRA Economic & Credit Risk Dashboard backend.
 */

import type {
  BatchPortfolioResponse,
  DebtorReport,
  FxHistoryResponse,
  FxSpreadsResponse,
  IndicatorsSummaryResponse,
  MacroIndicator,
  MacroSeriesResponse,
  SystemStatusResponse,
  VariableCatalogItem,
} from '../types'
import { KNOWN_BCRA_VARIABLES } from '../types'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${BASE_URL}${endpoint}`
  const headers = new Headers(options.headers || {})

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(url, {
    ...options,
    headers,
  })

  if (!response.ok) {
    let errorDetail = response.statusText
    try {
      const errJson = await response.json()
      if (errJson && errJson.detail) {
        errorDetail = typeof errJson.detail === 'string' ? errJson.detail : JSON.stringify(errJson.detail)
      }
    } catch {
      // Body not JSON
    }
    throw new Error(errorDetail || `HTTP Error ${response.status}`)
  }

  return response.json() as Promise<T>
}

export const api = {
  // System Health & Connectivity
  getSystemStatus: async (): Promise<SystemStatusResponse> => {
    const res: any = await request<any>('/system/status')
    return {
      status: res?.status || 'ok',
      system: res?.system || 'BCRA Monitor',
      bcra_connected: res?.bcra_connected ?? (res?.services?.bcra_api === 'active'),
      dolarapi_connected: res?.dolarapi_connected ?? (res?.services?.fx_api === 'active'),
      offline_mode: res?.offline_mode ?? res?.mock_mode ?? false,
      cached_records: res?.cached_records,
      timestamp: res?.timestamp || new Date().toISOString(),
    }
  },

  // Macro & FX Endpoints
  getMacroSummary: async (): Promise<IndicatorsSummaryResponse> => {
    const res: any = await request<any>('/macro/summary')
    const rawIndicators = res?.indicators || {}
    const indicatorsList: MacroIndicator[] = Array.isArray(rawIndicators)
      ? rawIndicators.map((ind: any) => ({
          idVariable: ind.idVariable ?? ind.variable_id ?? 0,
          descripcion: ind.descripcion ?? ind.name ?? '',
          valor: ind.valor ?? ind.value ?? 0,
          fecha: ind.fecha ?? ind.date ?? '',
          categoria: ind.categoria ?? ind.category ?? 'General',
          unit: ind.unit ?? ind.unidad ?? '',
        }))
      : Object.values(rawIndicators).map((ind: any) => ({
          idVariable: ind.variable_id ?? ind.idVariable ?? 0,
          descripcion: ind.name ?? ind.descripcion ?? '',
          valor: ind.value ?? ind.valor ?? 0,
          fecha: ind.date ?? ind.fecha ?? '',
          categoria: ind.category ?? ind.categoria ?? 'General',
          unit: ind.unit ?? ind.unidad ?? '',
        }))

    return {
      indicators: indicatorsList,
      fx_summary: res?.fx_summary || res?.fx_spreads || {},
      timestamp: res?.timestamp || res?.last_updated || new Date().toISOString(),
    }
  },

  getMacroSeries: async (idVariable: number, desde?: string, hasta?: string): Promise<MacroSeriesResponse> => {
    const params = new URLSearchParams()
    if (desde) params.append('desde', desde)
    if (hasta) params.append('hasta', hasta)
    const qs = params.toString() ? `?${params.toString()}` : ''
    const res: any = await request<any>(`/macro/series/${idVariable}${qs}`)

    const rawData = Array.isArray(res) ? res : (res?.data || [])
    const knownName = KNOWN_BCRA_VARIABLES[idVariable]?.name
    return {
      id_variable: res?.id_variable ?? idVariable,
      variable_name: (res?.variable_name && !res.variable_name.startsWith('Serie #')) ? res.variable_name : (knownName ?? `Serie #${idVariable}`),
      count: rawData.length,
      data: rawData.map((pt: any) => ({
        fecha: pt.fecha ?? pt.date ?? '',
        valor: pt.valor ?? pt.value ?? 0,
      })),
    }
  },

  getMacroCatalog: async (search?: string): Promise<VariableCatalogItem[]> => {
    const qs = search ? `?search=${encodeURIComponent(search)}` : ''
    const res: any = await request<any>(`/macro/catalog${qs}`)
    const list = Array.isArray(res) ? res : []
    return list.map((item: any) => ({
      idVariable: item.idVariable ?? item.variable_id ?? 0,
      descripcion: item.descripcion ?? item.name ?? '',
      categoria: item.categoria ?? item.category ?? '',
      unit: item.unit ?? item.unidad ?? '',
    }))
  },

  getFxSpreads: async (): Promise<FxSpreadsResponse> => {
    const res: any = await request<any>('/macro/fx/spreads')
    const oficialVenta = res?.oficial_base ?? res?.base?.venta ?? 0
    const oficialCompra = res?.base?.compra ?? 0
    const timestamp = res?.timestamp ?? res?.base?.fechaActualizacion ?? new Date().toISOString()

    const rates: Record<string, any> = { ...(res?.rates || {}) }
    if (!rates.oficial && res?.base) {
      rates.oficial = {
        moneda: 'USD',
        nombre: res.base.nombre || 'Oficial Mayorista',
        compra: oficialCompra,
        venta: oficialVenta,
        fechaActualizacion: timestamp,
      }
    }

    const spreads: Record<string, any> = {}
    if (res?.spreads) {
      for (const [k, v] of Object.entries(res.spreads as Record<string, any>)) {
        rates[k] = rates[k] || {
          moneda: 'USD',
          nombre: v.nombre || k.toUpperCase(),
          compra: v.compra || 0,
          venta: v.venta || 0,
          fechaActualizacion: v.fechaActualizacion || timestamp,
        }
        spreads[k] = {
          tipo: k,
          oficial_venta: oficialVenta,
          paralelo_venta: v.venta || 0,
          brecha_porcentaje: v.brecha_porcentaje ?? v.brecha_pct ?? 0,
          timestamp: v.fechaActualizacion || timestamp,
        }
      }
    }

    if (!rates.ccl && (rates.contadoconliqui || rates.contadoconliquidacion)) {
      rates.ccl = rates.contadoconliqui || rates.contadoconliquidacion
    }
    if (!rates.mep && rates.bolsa) {
      rates.mep = rates.bolsa
    }

    return {
      oficial_base: oficialVenta,
      rates,
      spreads,
      timestamp,
    }
  },

  getFxHistory: async (desde?: string, hasta?: string): Promise<FxHistoryResponse> => {
    const params = new URLSearchParams()
    if (desde) params.append('desde', desde)
    if (hasta) params.append('hasta', hasta)
    const qs = params.toString() ? `?${params.toString()}` : ''
    const res: any = await request<any>(`/macro/fx/history${qs}`)
    return {
      rates: {
        oficial: res?.rates?.oficial || [],
        mep: res?.rates?.mep || [],
        ccl: res?.rates?.ccl || [],
        blue: res?.rates?.blue || [],
      },
      last_updated: res?.last_updated || new Date().toISOString(),
      source: res?.source || 'api',
    }
  },

  // Credit Risk & Central de Deudores Endpoints
  getDebtorReport: async (cuit: string, bypassCache: boolean = false): Promise<DebtorReport> => {
    const clean = cuit.replace(/\D/g, '')
    const qs = bypassCache ? '?bypass_cache=true' : ''
    const res: any = await request<any>(`/risk/deudores/${clean}${qs}`)

    return {
      ...res,
      periodo: res.periodo ?? res.periodo_reciente,
      historia_24m: (res.historia_24m ?? res.historial_24m ?? []).map((h: any) => ({
        periodo: h.periodo,
        situacion: h.situacion ?? h.peor_situacion ?? 1,
      })),
      cheques_rechazados: Array.isArray(res.cheques_rechazados)
        ? {
            cantidad: res.total_cheques_rechazados ?? res.cheques_rechazados.length,
            total_monto: res.monto_total_cheques ?? 0,
            detalles: res.cheques_rechazados.map((c: any) => ({
              numeroCheque: c.numero_cheque ?? c.numeroCheque,
              fechaRechazo: c.fecha_rechazo ?? c.fechaRechazo,
              monto: c.monto ?? 0,
              causal: c.causal,
            })),
          }
        : res.cheques_rechazados || { cantidad: 0, total_monto: 0, detalles: [] },
    }
  },

  evaluateBatch: (cuits: string[], portfolioName: string = 'Portafolio') =>
    request<BatchPortfolioResponse>('/risk/batch', {
      method: 'POST',
      body: JSON.stringify({ cuits, portfolio_name: portfolioName }),
    }),

  uploadBatchFile: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return request<BatchPortfolioResponse>('/risk/batch', {
      method: 'POST',
      body: formData,
    })
  },

  // Export URLs & Download Utilities
  getExportPdfUrl: (cuit: string) => {
    const clean = cuit.replace(/\D/g, '')
    return `${BASE_URL}/export/cuit-dossier/${clean}`
  },

  downloadBatchExcel: async (data: { cuits?: string[]; results?: any[]; metrics?: any }): Promise<Blob> => {
    const url = `${BASE_URL}/export/batch-excel`
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!response.ok) {
      throw new Error(`Failed to generate Excel export: ${response.statusText}`)
    }
    return response.blob()
  },
}
