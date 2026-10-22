import { useState } from 'react'
import { Header } from './components/layout/Header'
import { Navbar } from './components/layout/Navbar'
import { MacroView } from './components/macro/MacroView'
import { ScreenerView } from './components/risk/ScreenerView'
import { BatchView } from './components/batch/BatchView'
import type { TabType } from './types'

export function App() {
  const [activeTab, setActiveTab] = useState<TabType>('macro')

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      {/* Institutional Header */}
      <Header />

      {/* Navigation Bar */}
      <Navbar activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Main Content Area */}
      <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto">
        {activeTab === 'macro' && <MacroView />}

        {activeTab === 'screener' && <ScreenerView />}

        {activeTab === 'batch' && <BatchView />}
      </main>

      {/* Minimal Institutional Footer */}
      <footer className="border-t border-slate-800/80 py-4 px-6 text-center text-xs text-slate-500 bg-slate-950/80">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>Banco Central de la República Argentina (BCRA) — Sistema de Inteligencia Financiera</span>
          <span className="font-mono text-[11px]">Diseño Institucional • Módulo 11 Validado</span>
        </div>
      </footer>
    </div>
  )
}

export default App
