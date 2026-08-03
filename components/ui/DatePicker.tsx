'use client'
import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useAnimatedClose } from '@/lib/useAnimatedClose'

const DAYS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do']
const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

/** Fecha YYYY-MM-DD en hora de Chile (no UTC). */
function todayCL(offsetDays = 0): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(Date.now() + offsetDays * 86400000))
}

function isoToDisplay(iso: string, withYear = true): string {
  const today = todayCL(0)
  const yesterday = todayCL(-1)
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
  const { placeholder, clearable } = props
  const isRange = props.range === true

  const [open, setOpen] = useState(false)
  const { closing, close } = useAnimatedClose(() => setOpen(false), 130)
  const anchorIso = (isRange ? props.from : props.value) || todayCL(0)
  const [viewYear, setViewYear] = useState(() => new Date(anchorIso + 'T12:00:00').getFullYear())
  const [viewMonth, setViewMonth] = useState(() => new Date(anchorIso + 'T12:00:00').getMonth())
  const ref = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [coords, setCoords] = useState<{ top: number; left: number; openUp: boolean } | null>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const t = e.target as Node
      // El panel vive en un portal (fuera de `ref`): hay que contemplar ambos para el click-fuera.
      if (ref.current?.contains(t) || panelRef.current?.contains(t)) return
      close()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [close])

  // El panel se renderiza en un portal a document.body con position:fixed, posicionado según
  // el rect del trigger. Antes iba como position:absolute DENTRO del modal, pero `.modal` tiene
  // `overflow-y:auto` (para scrollear modales largos) y recortaba la parte de arriba del
  // calendario (encabezado con mes + flechas ◄ ►) cuando abría hacia arriba → no se veía el
  // encabezado ni se podía cambiar de mes. El portal lo saca de ese overflow. Elige arriba o
  // abajo según el espacio disponible, y reposiciona ante scroll/resize.
  useLayoutEffect(() => {
    if (!open) { setCoords(null); return }
    const place = () => {
      const el = ref.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const PANEL_H = 340, PANEL_W = 260, GAP = 6
      const spaceBelow = window.innerHeight - r.bottom
      const openUp = spaceBelow < PANEL_H + GAP && r.top > spaceBelow
      const top = openUp ? Math.max(8, r.top - PANEL_H - GAP) : r.bottom + GAP
      const left = Math.min(Math.max(8, r.right - PANEL_W), window.innerWidth - PANEL_W - 8)
      setCoords({ top, left, openUp })
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => { window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place) }
  }, [open])

  // ESC cierra el calendario (no el modal que lo contiene): se escucha en fase de captura
  // y se detiene la propagación para que el listener de ESC del modal (bubble) no se dispare
  // en la misma tecla. Con el calendario cerrado, este effect no corre → ESC llega al modal.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.stopPropagation(); close() }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [open, close])

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
  const today = todayCL(0)

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
      close()
      return
    }
    // Range logic: first pick = from (reset to); second pick completes range
    const { from, to, onRangeChange } = props
    if (!from || (from && to)) {
      onRangeChange(iso, '')
    } else {
      if (iso >= from) { onRangeChange(from, iso); close() }
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

      {open && coords && typeof document !== 'undefined' && createPortal(
        <div ref={panelRef} style={{
          position: 'fixed',
          top: coords.top,
          left: coords.left,
          zIndex: 1200,
          background: 'var(--surface)',
          border: '1px solid var(--border-strong)',
          borderRadius: 16,
          padding: 16,
          boxShadow: 'var(--shadow)',
          width: 260,
          transformOrigin: coords.openUp ? 'bottom right' : 'top right',
          animation: closing ? 'dpPopOut .13s ease forwards' : 'fadeIn .15s ease',
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
              close()
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
        </div>,
        document.body
      )}
    </div>
  )
}
