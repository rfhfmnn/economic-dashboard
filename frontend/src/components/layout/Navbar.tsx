import React from 'react'
import { TrendingUp, ShieldAlert, Layers } from 'lucide-react'
import type { TabType } from '../../types'

export interface NavbarProps {
  activeTab: TabType
  onTabChange: (tab: TabType) => void
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, onTabChange }) => {
  const tabs = [
    {
      id: 'macro' as TabType,
      label: 'Monitor Macro & FX',
      icon: TrendingUp,
      badge: 'Series BCRA',
    },
    {
      id: 'screener' as TabType,
      label: 'Central de Deudores',
      icon: ShieldAlert,
      badge: 'CUIT Screener',
    },
    {
      id: 'batch' as TabType,
      label: 'Portafolio Batch',
      icon: Layers,
      badge: 'Multi-Deudor',
    },
  ]

  return (
    <nav className="border-b border-slate-800 bg-slate-900/40 px-6 backdrop-blur">
      <div className="max-w-7xl mx-auto flex space-x-1 sm:space-x-2 overflow-x-auto no-scrollbar">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
                isActive
                  ? 'border-blue-500 text-blue-400 bg-blue-500/10'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700 hover:bg-slate-800/40'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-blue-400' : 'text-slate-400'}`} />
              <span>{tab.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                  isActive
                    ? 'bg-blue-500/20 text-blue-300'
                    : 'bg-slate-800 text-slate-500'
                }`}
              >
                {tab.badge}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
