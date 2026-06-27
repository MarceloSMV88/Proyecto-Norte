'use client'
import { useState, useRef, useEffect } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const DAYS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do']
const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

function isoToDisplay(iso: string, withYear = true): string {
  const today = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  if (iso === today) return 'Hoy'
  if (iso === yesterday) return 'Ayer'
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) })
}

interface BaseProps {
  placeholder?: string
  clearable?: boolean
  dropUp?: boolean
}

interface SingleProps extends BaseProps {
  range?: false
  value: string
  onChange: (v: string) => void
}

interface RangeProps extends BaseProps {
  range: true
  from: string
  to: string
  onRangeChange: (from: string, to: string) => void
}

type DatePickerProps = SingleProps | RangeProps

export default function DatePicker(props: DatePickerProps) {
  const { placeholder, clearable, dropUp = true } = props
  const isRange = props.range === true

  const [open, setOpen] = useState(false)
  const anchorIso = (isRange ? props.from : props.value) || new Date().toISOString().slice(0, 10)
  const [viewYear, setViewYear] = useState(() => new Date(anchorIso + 'T12:00:00').getFullYear())
  const [viewMonth, setViewMonth] = useState(() => new Date(anchorIso + 'T12:00:00').getMonth())
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) }
    else setViewMonth(m => m - 1)
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) }
    else setViewMonth(m => m + 1)
  }

  const firstDay = new Date(viewYear, viewMonth, 1).getDay()
  const startOffset = firstDay === 0 ? 6 : firstDay - 1
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const today = new Date().toISOString().slice(0, 10)

  const cells: (number | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  function isoFor(day: number): string {
    return `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  function selectDay(day: number) {
    const iso = isoFor(day)
    if (!isRange) {
      props.onChange(iso)
      setOpen(false)
      return
    }
    // Range logic: first pick = from (reset to); second pick completes range
    const { from, to, onRangeChange } = props
    if (!from || (from && to)) {
      onRangeChange(iso, '')
    } else {
      if (iso >= from) { onRangeChange(from, iso); setOpen(false) }
      else onRangeChange(iso, '')
    }
  }

  // Trigger label
  let label = ''
  let hasValue = false
  if (isRange) {
    const { from, to } = props
    hasValue = !!from
    if (from && to) {
      label = from === to ? isoToDisplay(from) : `${isoToDisplay(from, false)} – ${isoToDisplay(to, false)}`
    } else if (from) {
      label = `Desde ${isoToDisplay(from, false)}…`
    }
  } else {
    hasValue = !!props.value
    if (props.value) label = isoToDisplay(props.value)
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation()
    if (isRange) props.onRangeChange('', '')
    else props.onChange('')
  }

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%',
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          borderRadius: 11,
          padding: '11px 12px',
          color: 'var(--text)',
          fontFamily: 'var(--font-body)',
          fontSize: 13.5,
          cursor: 'pointer',
          textAlign: 'left',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          transition: 'border-color .15s',
        }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border-strong)')}
        onMouseLeave={e => (e.currentTarget.style.borderColor = open ? 'var(--accent)' : 'var(--border)')}
      >
        <span style={{ color: hasValue ? 'var(--text)' : 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {hasValue ? label : (placeholder ?? 'Seleccionar fecha')}
        </span>
        {clearable && hasValue ? (
          <span
            role="button"
            tabIndex={0}
            onClick={clear}
            style={{ color: 'var(--text-faint)', fontSize: 14, display: 'flex', alignItems: 'center', padding: '0 2px', flexShrink: 0 }}
            title="Quitar filtro"
          >
            ✕
          </span>
        ) : (
          <span style={{ color: 'var(--text-faint)', fontSize: 12, flexShrink: 0 }}>📅</span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          ...(dropUp ? { bottom: '110%' } : { top: '110%' }),
          right: 0,
          left: 'auto',
          zIndex: 200,
          background: 'var(--surface)',
          border: '1px solid var(--border-strong)',
          borderRadius: 16,
          padding: 16,
          boxShadow: 'var(--shadow)',
          width: 260,
          animation: 'fadeIn .15s ease',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <button type="button" onClick={prevMonth} style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', padding: 4, borderRadius: 8, display: 'flex' }}>
              <ChevronLeft size={16} />
            </button>
            <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>
              {MONTHS[viewMonth]} {viewYear}
            </span>
            <button type="button" onClick={nextMonth} style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', padding: 4, borderRadius: 8, display: 'flex' }}>
              <ChevronRight size={16} />
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
            {DAYS.map(d => (
              <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', fontFamily: 'var(--font-ui)', padding: '4px 0' }}>
                {d}
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
            {cells.map((day, i) => {
              if (!day) return <div key={i} />
              const iso = isoFor(day)
              const isToday = iso === today

              let isSelected = false
              let inRange = false
              if (isRange) {
                const { from, to } = props
                isSelected = iso === from || iso === to
                inRange = !!(from && to && iso > from && iso < to)
              } else {
                isSelected = iso === props.value
              }

              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => selectDay(day)}
                  style={{
                    width: '100%',
                    aspectRatio: '1',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 8,
                    border: isToday && !isSelected ? '1px solid var(--border-strong)' : '1px solid transparent',
                    background: isSelected ? 'var(--accent)' : inRange ? 'color-mix(in oklab, var(--accent) 18%, transparent)' : 'transparent',
                    color: isSelected ? '#06140e' : isToday ? 'var(--accent)' : 'var(--text)',
                    fontFamily: 'var(--font-ui)',
                    fontWeight: isSelected || isToday ? 700 : 400,
                    fontSize: 13,
                    cursor: 'pointer',
                    transition: 'background .1s',
                  }}
                  onMouseEnter={e => { if (!isSelected && !inRange) e.currentTarget.style.background = 'var(--surface-2)' }}
                  onMouseLeave={e => { if (!isSelected && !inRange) e.currentTarget.style.background = 'transparent' }}
                >
                  {day}
                </button>
              )
            })}
          </div>

          {isRange && props.from && !props.to && (
            <div style={{ marginTop: 10, fontSize: 11.5, color: 'var(--text-faint)', textAlign: 'center', fontFamily: 'var(--font-ui)' }}>
              Selecciona la fecha de término
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              const now = new Date()
              setViewYear(now.getFullYear())
              setViewMonth(now.getMonth())
              if (isRange) props.onRangeChange(today, today)
              else props.onChange(today)
              setOpen(false)
            }}
            style={{
              marginTop: 10,
              width: '100%',
              padding: '7px',
              borderRadius: 9,
              border: '1px solid var(--border)',
              background: 'var(--surface-2)',
              color: 'var(--accent)',
              fontFamily: 'var(--font-ui)',
              fontWeight: 600,
              fontSize: 12.5,
              cursor: 'pointer',
            }}
          >
            Ir a hoy
          </button>
        </div>
      )}
    </div>
  )
}
