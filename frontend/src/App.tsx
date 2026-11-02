import { useState } from 'react'
import { Header } from './components/layout/Header'
import { Navbar } from './components/layout/Navbar'
import { MacroView } from './components/macro/MacroView'
import { ScreenerView } from './components/risk/ScreenerView'
import { ErrorBoundary } from './components/common/ErrorBoundary'
import { ThemeProvider } from './context/ThemeContext'
import type { TabType } from './types'

export function App() {
  const [activeTab, setActiveTab] = useState<TabType>('macro')

  return (
    <ThemeProvider>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white transition-colors">
        {/* Institutional Header */}
        <Header />

        {/* Navigation Bar */}
        <Navbar activeTab={activeTab} onTabChange={setActiveTab} />

        {/* Main Content Area */}
        <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto">
          <ErrorBoundary>
            {activeTab === 'macro' && <MacroView />}

            {(activeTab === 'screener' || activeTab === 'batch') && (
              <ScreenerView initialSubTab={activeTab === 'batch' ? 'batch' : 'individual'} />
            )}
          </ErrorBoundary>
        </main>

        {/* Minimal Institutional Footer */}
        <footer className="border-t border-slate-200 dark:border-slate-800/80 py-4 px-6 text-center text-xs text-slate-500 bg-white/80 dark:bg-slate-950/80">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
            <span>Banco Central de la República Argentina (BCRA) — Sistema de inteligencia financiera</span>
            <span className="font-sans text-[11px]">Diseño institucional • Módulo 11 validado</span>
          </div>
        </footer>
      </div>
    </ThemeProvider>
  )
}

export default App
