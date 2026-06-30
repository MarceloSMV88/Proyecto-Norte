'use client'
import { ChevronLeft, ChevronRight, Calendar, Plus } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { getCurrentMonth } from '@/lib/utils'

interface TopbarProps {
  title: string
  subtitle?: string
  action?: { label: string; onClick: () => void; icon?: React.ReactNode }
  month?: string          // format: '2026-06-01'
  onMonthChange?: (m: string) => void
}

const MONTHS_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

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

function MonthPicker({ month, onMonthChange }: { month: string; onMonthChange: (m: string) => void }) {
  const [open, setOpen] = useState(false)
  const [viewYear, setViewYear] = useState(() => new Date(month + 'T12:00:00').getFullYear())
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const selYear = Number(month.slice(0, 4))
  const selMonth = Number(month.slice(5, 7)) - 1  // 0-index
  const nowYear = new Date().getFullYear()
  const nowMonth = new Date().getMonth()

  function pick(m: number) {
    onMonthChange(`${viewYear}-${String(m + 1).padStart(2, '0')}-01`)
    setOpen(false)
  }

  return (
    <div className="month-pick" ref={ref} style={{ position: 'relative' }}>
      <button className="icon-btn" onClick={() => onMonthChange(shiftMonth(month, -1))} aria-label="Mes anterior">
        <ChevronLeft size={18} />
      </button>
      <button
        className="month-label"
        onClick={() => { setViewYear(selYear); setOpen(o => !o) }}
        style={{ background: 'none', border: 'none', cursor: 'pointer' }}
      >
        <Calendar size={15} />
        {fmtMonth(month)}
      </button>
      <button className="icon-btn" onClick={() => onMonthChange(shiftMonth(month, 1))} aria-label="Mes siguiente">
        <ChevronRight size={18} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '110%', right: 0, zIndex: 200,
          background: 'var(--surface)', border: '1px solid var(--border-strong)',
          borderRadius: 16, padding: 14, boxShadow: 'var(--shadow)', width: 252,
          animation: 'fadeIn .15s ease',
        }}>
          {/* Year nav */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <button type="button" onClick={() => setViewYear(y => y - 1)} style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', padding: 4, display: 'flex' }}>
              <ChevronLeft size={16} />
            </button>
            <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>{viewYear}</span>
            <button type="button" onClick={() => setViewYear(y => y + 1)} style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', padding: 4, display: 'flex' }}>
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Months grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {MONTHS_SHORT.map((mLabel, i) => {
              const isSelected = viewYear === selYear && i === selMonth
              const isCurrent = viewYear === nowYear && i === nowMonth
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => pick(i)}
                  style={{
                    padding: '9px 0', borderRadius: 9, cursor: 'pointer',
                    fontFamily: 'var(--font-ui)', fontSize: 13,
                    fontWeight: isSelected || isCurrent ? 700 : 500,
                    border: isCurrent && !isSelected ? '1px solid var(--border-strong)' : '1px solid transparent',
                    background: isSelected ? 'var(--accent)' : 'transparent',
                    color: isSelected ? '#06140e' : isCurrent ? 'var(--accent)' : 'var(--text)',
                    transition: 'background .1s',
                  }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--surface-2)' }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
                >
                  {mLabel}
                </button>
              )
            })}
          </div>

          {/* Ir al mes actual */}
          <button
            type="button"
            onClick={() => { onMonthChange(getCurrentMonth()); setOpen(false) }}
            style={{
              marginTop: 12, width: '100%', padding: '8px', borderRadius: 9,
              border: '1px solid var(--border)', background: 'var(--surface-2)',
              color: 'var(--accent)', fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 12.5, cursor: 'pointer',
            }}
          >
            Mes actual
          </button>
        </div>
      )}
    </div>
  )
}

export default function Topbar({ title, subtitle, action, month, onMonthChange }: TopbarProps) {
  return (
    <header className="topbar">
      <div>
        <h1 className="greet">{title}</h1>
        {subtitle && <p className="greet-sub">{subtitle}</p>}
      </div>

      <div className="topbar-r">
        {month && onMonthChange && <MonthPicker month={month} onMonthChange={onMonthChange} />}

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
