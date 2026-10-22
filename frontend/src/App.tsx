
export function App() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="h-8 w-8 rounded bg-blue-600 flex items-center justify-center font-bold text-white shadow-sm">
            B
          </div>
          <div>
            <h1 className="text-base font-semibold text-slate-100 tracking-tight">
              BCRA Economic & Credit Risk Monitor
            </h1>
            <p className="text-xs text-slate-400">
              Banco Central de la República Argentina Intelligence Platform
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2 text-xs text-slate-400">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>System Operational</span>
        </div>
      </header>

      <main className="flex-1 p-6 max-w-7xl w-full mx-auto">
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-6">
          <h2 className="text-lg font-medium text-slate-200">Plataforma de Monitoreo Macro y Riesgo Crediticio</h2>
          <p className="mt-2 text-sm text-slate-400">
            Base scaffolding initialized. Ready for module integrations.
          </p>
        </div>
      </main>
    </div>
  )
}

export default App
