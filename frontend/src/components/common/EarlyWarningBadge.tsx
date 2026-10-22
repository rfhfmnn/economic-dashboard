import React from 'react'
import {
  TrendingDown,
  Building2,
  FileWarning,
  Activity,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react'
import type { AlertBadge } from '../../types'

export interface EarlyWarningBadgeProps {
  badge: AlertBadge
  size?: 'sm' | 'md'
}

export const EarlyWarningBadge: React.FC<EarlyWarningBadgeProps> = ({ badge, size = 'md' }) => {
  const getIcon = () => {
    const id = badge.id.toUpperCase()
    if (id.includes('DETERIORATION') || id.includes('DETERIORO')) {
      return <TrendingDown className="w-3.5 h-3.5 shrink-0" />
    }
    if (id.includes('NON_BANK') || id.includes('NO_BANCARIA')) {
      return <Building2 className="w-3.5 h-3.5 shrink-0" />
    }
    if (id.includes('BOUNCED') || id.includes('CHEQUE')) {
      return <FileWarning className="w-3.5 h-3.5 shrink-0" />
    }
    if (id.includes('ACCELERATION') || id.includes('ACELERACION')) {
      return <Activity className="w-3.5 h-3.5 shrink-0" />
    }
    if (id.includes('CLEAN') || id.includes('LIMPIO')) {
      return <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
    }
    return <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
  }

  const getThemeClass = () => {
    switch (badge.severity.toLowerCase()) {
      case 'critical':
      case 'high':
        return 'bg-rose-950/50 text-rose-300 border-rose-800/70 hover:border-rose-700'
      case 'medium':
        return 'bg-amber-950/50 text-amber-300 border-amber-800/70 hover:border-amber-700'
      case 'low':
        return 'bg-orange-950/50 text-orange-300 border-orange-800/70 hover:border-orange-700'
      case 'normal':
      default:
        return 'bg-emerald-950/50 text-emerald-300 border-emerald-800/70 hover:border-emerald-700'
    }
  }

  const sizeClass = size === 'sm' ? 'text-[11px] py-0.5 px-2' : 'text-xs py-1 px-2.5'

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-md border transition-colors ${sizeClass} ${getThemeClass()}`}
      title={badge.description}
    >
      {getIcon()}
      <span className="font-medium tracking-tight">{badge.name}</span>
    </div>
  )
}
