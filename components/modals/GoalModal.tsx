'use client'
import { useState } from 'react'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/Toast'
import type { AccentColor } from '@/lib/types'

const COLORS: AccentColor[] = ['emerald', 'blue', 'violet', 'amber', 'red']
const COLOR_HEX: Record<AccentColor, string> = {
  emerald: '#34c98a', blue: '#4f93f5', violet: '#9b8cf0', amber: '#e6b25a', red: '#ef7a63',
}

export default function GoalModal({ profileId, onClose, onSaved }: {
  profileId: string; onClose: () => void; onSaved: () => void
}) {
  const [name, setName] = useState('')
  const [target, setTarget] = useState('')
  const [monthly, setMonthly] = useState('')
  const [due, setDue] = useState('')
  const [color, setColor] = useState<AccentColor>('emerald')
  const [saving, setSaving] = useState(false)
  const { showToast } = useToast()
  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name || !target) return
    setSaving(true)

    const { error } = await supabase.from('goals').insert({
      profile_id: profileId,
      name,
      target: Math.round(parseFloat(target.replace(/\./g, '').replace(',', '.'))),
      current: 0,
      monthly: monthly ? Math.round(parseFloat(monthly.replace(/\./g, '').replace(',', '.'))) : 0,
      due: due || null,
      color,
    })

    setSaving(false)
    if (error) { showToast('Error al guardar'); return }
    showToast('✓ Meta creada')
    onSaved(); onClose()
  }

  return (
    <div className="modal-scrim" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ borderTop: '3px solid var(--c-violet)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontFamily: 'var(--font-ui)', fontSize: 17, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
            Crear nueva meta
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <input
            type="text" placeholder="Nombre de la meta"
            value={name} onChange={e => setName(e.target.value)}
            autoFocus style={{ padding: '10px 14px', fontSize: 14, outline: 'none' }}
          />
          <input
            type="text" inputMode="numeric" placeholder="Objetivo ($)"
            value={target} onChange={e => setTarget(e.target.value.replace(/[^0-9]/g, ''))}
            style={{ padding: '10px 14px', fontSize: 14, outline: 'none' }}
          />
          <input
            type="text" inputMode="numeric" placeholder="Aporte mensual ($) — opcional"
            value={monthly} onChange={e => setMonthly(e.target.value.replace(/[^0-9]/g, ''))}
            style={{ padding: '10px 14px', fontSize: 14, outline: 'none' }}
          />
          <input
            type="text" placeholder="Fecha límite (ej: Dic 2026) — opcional"
            value={due} onChange={e => setDue(e.target.value)}
            style={{ padding: '10px 14px', fontSize: 14, outline: 'none' }}
          />

          <div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 8, fontFamily: 'var(--font-ui)' }}>Color</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {COLORS.map(c => (
                <button key={c} type="button" onClick={() => setColor(c)}
                  style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: COLOR_HEX[c], border: color === c ? `3px solid var(--text)` : '3px solid transparent',
                    cursor: 'pointer', transition: 'border .15s',
                  }}
                />
              ))}
            </div>
          </div>

          <button
            type="submit" disabled={!name || !target || saving}
            style={{
              padding: '12px', borderRadius: 'var(--radius-sm)',
              background: 'var(--c-violet)', color: 'white',
              fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 15,
              border: 'none', cursor: saving ? 'wait' : 'pointer',
              opacity: !name || !target ? 0.5 : 1, marginTop: 4,
            }}
          >
            {saving ? 'Guardando...' : 'Crear meta'}
          </button>
        </form>
      </div>
    </div>
  )
}
