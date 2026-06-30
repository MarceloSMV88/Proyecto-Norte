'use client'
import { useState } from 'react'
import { X, Flag } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/Toast'
import { useEscapeClose } from '@/lib/useEscapeClose'
import type { AccentColor, Goal } from '@/lib/types'

const COLORS: { key: AccentColor; hex: string; label: string }[] = [
  { key: 'emerald', hex: '#34c98a', label: 'Verde' },
  { key: 'blue',    hex: '#4f93f5', label: 'Azul' },
  { key: 'violet',  hex: '#9b8cf0', label: 'Violeta' },
  { key: 'amber',   hex: '#e6b25a', label: 'Ámbar' },
  { key: 'red',     hex: '#ef7a63', label: 'Rojo' },
]

interface GoalModalProps {
  profileId: string
  goal?: Goal        // if provided → edit mode
  onClose: () => void
  onSaved: () => void
}

export default function GoalModal({ profileId, goal, onClose, onSaved }: GoalModalProps) {
  const isEdit = !!goal
  const [name, setName]       = useState(goal?.name ?? '')
  const [target, setTarget]   = useState(goal ? String(goal.target) : '')
  const [monthly, setMonthly] = useState(goal ? String(goal.monthly) : '')
  const [due, setDue]         = useState(goal?.due ?? '')
  const [color, setColor]     = useState<AccentColor>(goal?.color ?? 'violet')
  const [saving, setSaving]   = useState(false)
  const { showToast } = useToast()
  const supabase = createClient()
  useEscapeClose(onClose)

  const selectedColor = COLORS.find(c => c.key === color)!
  const n = parseInt(target.replace(/\D/g, '')) || 0
  const formattedTarget = n > 0 ? n.toLocaleString('es-CL') : ''

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name || !n) return
    setSaving(true)

    const payload = {
      name: name.trim(),
      target: n,
      monthly: parseInt(monthly.replace(/\D/g, '')) || 0,
      due: due.trim() || null,
      color,
    }

    const { error } = isEdit
      ? await supabase.from('goals').update(payload).eq('id', goal!.id)
      : await supabase.from('goals').insert({ ...payload, profile_id: profileId, current: 0 })

    setSaving(false)
    if (error) { showToast('Error al guardar'); return }
    showToast(isEdit ? '✓ Meta actualizada' : '✓ Meta creada')
    onSaved(); onClose()
  }

  return (
    <div className="modal-scrim" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ borderTop: `3px solid ${selectedColor.hex}` }}>
        <div className="modal-head">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Flag size={17} style={{ color: selectedColor.hex }} />
            {isEdit ? 'Editar meta' : 'Nueva meta'}
          </h3>
          <button type="button" onClick={onClose} className="icon-btn ghost sm">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <label className="field-label">Nombre</label>
          <input
            className="text-input"
            type="text"
            placeholder="Ej: Fondo de emergencia, Vacaciones…"
            value={name}
            onChange={e => setName(e.target.value)}
            autoFocus
            maxLength={60}
          />

          <label className="field-label" style={{ marginTop: 16 }}>Objetivo ($)</label>
          <div className="amount-field">
            <span className="amount-cur">$</span>
            <input
              className="amount-input"
              type="text"
              inputMode="numeric"
              placeholder="0"
              value={formattedTarget}
              onChange={e => setTarget(e.target.value.replace(/\D/g, ''))}
            />
          </div>

          <div className="row-2" style={{ marginTop: 4 }}>
            <div>
              <label className="field-label">Aporte mensual ($)</label>
              <input
                className="text-input"
                type="text"
                inputMode="numeric"
                placeholder="Opcional"
                value={monthly ? parseInt(monthly).toLocaleString('es-CL') : ''}
                onChange={e => setMonthly(e.target.value.replace(/\D/g, ''))}
              />
            </div>
            <div>
              <label className="field-label">Fecha límite</label>
              <input
                className="text-input"
                type="text"
                placeholder="Ej: Dic 2026"
                value={due}
                onChange={e => setDue(e.target.value)}
              />
            </div>
          </div>

          <label className="field-label" style={{ marginTop: 16 }}>Color</label>
          <div style={{ display: 'flex', gap: 10 }}>
            {COLORS.map(c => (
              <button
                key={c.key}
                type="button"
                onClick={() => setColor(c.key)}
                title={c.label}
                style={{
                  width: 30, height: 30, borderRadius: '50%',
                  background: c.hex,
                  border: color === c.key ? '3px solid var(--text)' : '3px solid transparent',
                  cursor: 'pointer', transition: 'border .15s, transform .1s',
                  transform: color === c.key ? 'scale(1.15)' : 'scale(1)',
                }}
              />
            ))}
          </div>

          <button
            type="submit"
            disabled={!name || !n || saving}
            className="btn-primary block"
            style={{ background: selectedColor.hex, opacity: name && n ? 1 : 0.4 }}
          >
            {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear meta'}
          </button>
        </form>
      </div>
    </div>
  )
}
