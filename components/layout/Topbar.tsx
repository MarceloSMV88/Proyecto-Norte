'use client'
import { ChevronLeft, ChevronRight, Calendar, Search, Bell, Plus } from 'lucide-react'
import { useState } from 'react'

interface TopbarProps {
  title: string
  subtitle?: string
  action?: { label: string; onClick: () => void; icon?: React.ReactNode }
}

function getMonthLabel(offset: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() + offset)
  return d.toLocaleString('es-CL', { month: 'long', year: 'numeric' })
    .replace(/^./, c => c.toUpperCase())
}

export default function Topbar({ title, subtitle, action }: TopbarProps) {
  const [monthOffset, setMonthOffset] = useState(0)
  const monthLabel = getMonthLabel(monthOffset)

  return (
    <header className="topbar">
      <div>
        <h1 className="greet">{title}</h1>
        {subtitle && <p className="greet-sub">{subtitle}</p>}
      </div>

      <div className="topbar-r">
        {/* Month picker */}
        <div className="month-pick">
          <button className="icon-btn" onClick={() => setMonthOffset(o => o - 1)} aria-label="Mes anterior">
            <ChevronLeft size={18} />
          </button>
          <span className="month-label">
            <Calendar size={15} />
            {monthLabel}
          </span>
          <button className="icon-btn" onClick={() => setMonthOffset(o => o + 1)} aria-label="Mes siguiente">
            <ChevronRight size={18} />
          </button>
        </div>

        {/* Search */}
        <button className="icon-btn ghost" aria-label="Buscar">
          <Search size={18} />
        </button>

        {/* Bell */}
        <button className="icon-btn ghost bell" aria-label="Alertas" style={{ position: 'relative' }}>
          <Bell size={18} />
          <span className="ping" />
        </button>

        {/* Action button */}
        {action && (
          <button className="btn-primary" onClick={action.onClick}>
            {action.icon ?? <Plus size={17} />}
            {action.label}
          </button>
        )}
      </div>
    </header>
  )
}
