/**
 * Typed API client for the BCRA Economic & Credit Risk Dashboard backend.
 */

import type {
  BatchPortfolioResponse,
  DebtorReport,
  FxSpreadsResponse,
  IndicatorsSummaryResponse,
  MacroSeriesResponse,
  SystemStatusResponse,
  VariableCatalogItem,
} from '../types'

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
  getSystemStatus: () => request<SystemStatusResponse>('/system/status'),

  // Macro & FX Endpoints
  getMacroSummary: () => request<IndicatorsSummaryResponse>('/macro/summary'),

  getMacroSeries: (idVariable: number, desde?: string, hasta?: string) => {
    const params = new URLSearchParams()
    if (desde) params.append('desde', desde)
    if (hasta) params.append('hasta', hasta)
    const qs = params.toString() ? `?${params.toString()}` : ''
    return request<MacroSeriesResponse>(`/macro/series/${idVariable}${qs}`)
  },

  getMacroCatalog: (search?: string) => {
    const qs = search ? `?search=${encodeURIComponent(search)}` : ''
    return request<VariableCatalogItem[]>(`/macro/catalog${qs}`)
  },

  getFxSpreads: () => request<FxSpreadsResponse>('/macro/fx/spreads'),

  // Credit Risk & Central de Deudores Endpoints
  getDebtorReport: (cuit: string, bypassCache: boolean = false) => {
    const clean = cuit.replace(/\D/g, '')
    const qs = bypassCache ? '?bypass_cache=true' : ''
    return request<DebtorReport>(`/risk/deudores/${clean}${qs}`)
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
