import React from 'react'

export interface RiskBadgeProps {
  situacion: number
  showDescription?: boolean
  size?: 'sm' | 'md' | 'lg'
  variant?: 'solid' | 'subtle'
}

const SITUACION_CONFIG: Record<
  number,
  { label: string; desc: string; solidClass: string; subtleClass: string }
> = {
  1: {
    label: 'Sit. 1',
    desc: 'Normal',
    solidClass: 'bg-emerald-600 text-white border-emerald-600',
    subtleClass: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  },
  2: {
    label: 'Sit. 2',
    desc: 'Bajo observación',
    solidClass: 'bg-amber-500 text-slate-950 border-amber-500',
    subtleClass: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  },
  3: {
    label: 'Sit. 3',
    desc: 'Con problemas',
    solidClass: 'bg-orange-500 text-white border-orange-500',
    subtleClass: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  },
  4: {
    label: 'Sit. 4',
    desc: 'Alto riesgo',
    solidClass: 'bg-rose-600 text-white border-rose-600',
    subtleClass: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
  },
  5: {
    label: 'Sit. 5',
    desc: 'Irrecuperable',
    solidClass: 'bg-red-700 text-white border-red-700',
    subtleClass: 'bg-red-600/15 text-red-400 border-red-600/30',
  },
  6: {
    label: 'Sit. 6',
    desc: 'Disp. técnica',
    solidClass: 'bg-purple-800 text-white border-purple-800',
    subtleClass: 'bg-purple-600/15 text-purple-300 border-purple-600/30',
  },
}

export const RiskBadge: React.FC<RiskBadgeProps> = ({
  situacion,
  showDescription = false,
  size = 'md',
  variant = 'subtle',
}) => {
  const sit = Math.max(1, Math.min(6, Math.floor(situacion || 1)))
  const cfg = SITUACION_CONFIG[sit] || SITUACION_CONFIG[1]

  const sizeClass = {
    sm: 'text-[11px] px-1.5 py-0.5 font-mono',
    md: 'text-xs px-2 py-0.5 font-mono',
    lg: 'text-sm px-3 py-1 font-mono',
  }[size]

  const colorClass = variant === 'solid' ? cfg.solidClass : cfg.subtleClass

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded font-medium border tabular-nums ${sizeClass} ${colorClass}`}
      title={`BCRA situación ${sit}: ${cfg.desc}`}
    >
      <span className="font-semibold">{cfg.label}</span>
      {showDescription && <span className="opacity-90 font-sans">({cfg.desc})</span>}
    </span>
  )
}
