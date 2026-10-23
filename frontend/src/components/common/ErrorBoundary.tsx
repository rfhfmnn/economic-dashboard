import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertOctagon, RotateCcw } from 'lucide-react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in React Component Tree:', error, errorInfo)
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null })
    window.location.reload()
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[400px] flex items-center justify-center p-6">
          <div className="max-w-lg w-full rounded-xl border border-rose-800/60 bg-slate-900/90 p-6 text-center shadow-2xl backdrop-blur-md">
            <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-400 mx-auto flex items-center justify-center mb-4 border border-rose-500/30">
              <AlertOctagon className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-100 tracking-tight">
              Error Inesperado en la Interfaz
            </h3>
            <p className="text-xs text-slate-400 mt-2">
              Se produjo un error al procesar los datos recibidos. La aplicación ha protegido el estado del sistema.
            </p>
            {this.state.error?.message && (
              <div className="mt-3 p-3 rounded-lg bg-slate-950/80 border border-slate-800 text-left font-mono text-xs text-rose-300 break-words">
                {this.state.error.message}
              </div>
            )}
            <button
              onClick={this.handleReset}
              className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors shadow-md"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reiniciar Vista</span>
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
