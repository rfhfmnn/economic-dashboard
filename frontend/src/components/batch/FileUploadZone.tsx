import React, { useState, useId } from 'react'
import { Upload, FileText, CheckCircle2, AlertCircle } from 'lucide-react'
import { cleanCuit, validateCuitModulo11 } from '../../utils/cuit'

export interface FileUploadZoneProps {
  onEvaluateCuits: (cuits: string[], portfolioName: string) => void
  onEvaluateFile: (file: File) => void
  loading?: boolean
}

export const FileUploadZone: React.FC<FileUploadZoneProps> = ({
  onEvaluateCuits,
  onEvaluateFile,
  loading = false,
}) => {
  const fileInputId = useId()
  const [mode, setMode] = useState<'file' | 'text'>('file')
  const [textInput, setTextInput] = useState('')
  const [dragActive, setDragActive] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  // Compute validation summary for text input
  const parsedCuits = textInput
    .split(/[\r\n,;\t]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.toLowerCase().startsWith('cuit'))

  const validCount = parsedCuits.filter((c) => validateCuitModulo11(cleanCuit(c)).valid).length
  const invalidCount = parsedCuits.length - validCount

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelected(e.dataTransfer.files[0])
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelected(e.target.files[0])
    }
  }

  const handleFileSelected = (file: File) => {
    setSelectedFile(file)
  }

  const handleEvaluate = () => {
    if (mode === 'file' && selectedFile) {
      onEvaluateFile(selectedFile)
    } else if (mode === 'text' && parsedCuits.length > 0) {
      onEvaluateCuits(parsedCuits, 'Lote Manual')
    }
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 sm:p-5 space-y-4">
      {/* Mode switcher tabs */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMode('file')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${mode === 'file'
              ? 'bg-blue-600 text-white'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Subir archivo (CSV/TXT)</span>
          </button>

          <button
            type="button"
            onClick={() => setMode('text')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${mode === 'text'
              ? 'bg-blue-600 text-white'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Pegar lista de CUITs</span>
          </button>
        </div>
      </div>

      {/* Mode 1: Drag & Drop Zone */}
      {mode === 'file' && (
        <div>
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all ${dragActive
              ? 'border-blue-500 bg-blue-500/10'
              : 'border-slate-700 hover:border-slate-600 bg-slate-950/40'
              }`}
          >
            <input
              id={fileInputId}
              type="file"
              accept=".csv,.txt"
              onChange={handleFileChange}
              className="hidden"
            />
            <label htmlFor={fileInputId} className="cursor-pointer space-y-2 block">
              <Upload className="w-8 h-8 text-slate-400 mx-auto" />
              <div className="text-xs text-slate-300">
                <span className="font-semibold text-blue-400">Haga clic para seleccionar</span> o arrastre un archivo CSV/TXT
              </div>
              <p className="text-[11px] text-slate-500 font-mono">
                Admite CUITs separados por salto de línea, coma o tabulación
              </p>
            </label>
          </div>

          {selectedFile && (
            <div className="mt-3 flex items-center justify-between p-2.5 rounded bg-slate-800/80 text-xs">
              <span className="font-mono text-slate-200">{selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)</span>
              <button
                type="button"
                onClick={() => setSelectedFile(null)}
                className="text-slate-400 hover:text-white"
              >
                ×
              </button>
            </div>
          )}
        </div>
      )}

      {/* Mode 2: Multi-line text area */}
      {mode === 'text' && (
        <div className="space-y-2">
          <textarea
            rows={5}
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="Pegue aquí los CUITs (uno por línea o separados por comas):&#10;20-30123456-3&#10;30-71234567-1&#10;27-40987654-9"
            className="w-full p-3 rounded-lg border border-slate-700 bg-slate-950 font-mono text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500"
          />

          {parsedCuits.length > 0 && (
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-400">Total detectados: <strong className="text-white">{parsedCuits.length}</strong></span>
              <div className="flex items-center gap-3">
                <span className="text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{validCount} Válidos</span>
                </span>
                {invalidCount > 0 && (
                  <span className="text-rose-400 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>{invalidCount} Inválidos</span>
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Evaluate button */}
      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={handleEvaluate}
          disabled={loading || (mode === 'file' && !selectedFile) || (mode === 'text' && parsedCuits.length === 0)}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-xs font-semibold text-white transition-all shadow-sm ${loading || (mode === 'file' && !selectedFile) || (mode === 'text' && parsedCuits.length === 0)
            ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
            : 'bg-blue-600 hover:bg-blue-500 cursor-pointer shadow-blue-500/10'
            }`}
        >
          <Upload className="w-4 h-4" />
          <span>{loading ? 'Evaluando cartera...' : 'Evaluar portafolio en BCRA'}</span>
        </button>
      </div>
    </div>
  )
}
