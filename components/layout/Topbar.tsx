'use client'
import { ChevronLeft, ChevronRight, Calendar, Plus } from 'lucide-react'

interface TopbarProps {
  title: string
  subtitle?: string
  action?: { label: string; onClick: () => void; icon?: React.ReactNode }
  month?: string          // format: '2026-06-01'
  onMonthChange?: (m: string) => void
}

function fmtMonth(month: string): string {
  return new Date(month + 'T12:00:00')
    .toLocaleString('es-CL', { month: 'long', year: 'numeric' })
    .replace(/^./, c => c.toUpperCase())
}

function shiftMonth(month: string, delta: number): string {
  const d = new Date(month + 'T12:00:00')
  d.setMonth(d.getMonth() + delta)
  return d.toISOString().slice(0, 7) + '-01'
}

export default function Topbar({ title, subtitle, action, month, onMonthChange }: TopbarProps) {
  return (
    <header className="topbar">
      <div>
        <h1 className="greet">{title}</h1>
        {subtitle && <p className="greet-sub">{subtitle}</p>}
      </div>

      <div className="topbar-r">
        {/* Month picker — only when parent provides month state */}
        {month && onMonthChange && (
          <div className="month-pick">
            <button className="icon-btn" onClick={() => onMonthChange(shiftMonth(month, -1))} aria-label="Mes anterior">
              <ChevronLeft size={18} />
            </button>
            <span className="month-label">
              <Calendar size={15} />
              {fmtMonth(month)}
            </span>
            <button className="icon-btn" onClick={() => onMonthChange(shiftMonth(month, 1))} aria-label="Mes siguiente">
              <ChevronRight size={18} />
            </button>
          </div>
        )}

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
