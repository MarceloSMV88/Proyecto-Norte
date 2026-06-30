'use client'
import { useState } from 'react'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/Toast'
import { useEscapeClose } from '@/lib/useEscapeClose'
import type { AccentColor, ProfileRole } from '@/lib/types'

const COLORS: AccentColor[] = ['emerald', 'blue', 'violet', 'amber', 'red']
const COLOR_HEX: Record<AccentColor, string> = {
  emerald: '#34c98a', blue: '#4f93f5', violet: '#9b8cf0', amber: '#e6b25a', red: '#ef7a63',
}

export default function ProfileModal({ createdBy, onClose, onSaved }: {
  createdBy: string; onClose: () => void; onSaved: () => void
}) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<ProfileRole>('Pro')
  const [income, setIncome] = useState('')
  const [color, setColor] = useState<AccentColor>('blue')
  const [saving, setSaving] = useState(false)
  const { showToast } = useToast()
  const supabase = createClient()
  useEscapeClose(onClose)

  const name = fullName.trim().split(/\s+/)[0] || ''
  const initials = fullName.trim().split(/\s+/).map(p => p[0]).join('').toUpperCase().slice(0, 2)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!fullName) return
    setSaving(true)

    const { error } = await supabase.from('profiles').insert({
      user_id: null,
      name,
      full_name: fullName,
      initials: initials || name.slice(0, 2).toUpperCase(),
      color,
      role,
      income: income ? parseInt(income.replace(/\./g, '')) : 0,
      created_by: createdBy,
    })

    setSaving(false)
    if (error) { showToast('Error al crear perfil'); return }
    showToast('✓ Perfil agregado')
    onSaved(); onClose()
  }

  return (
    <div className="modal-scrim" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ borderTop: '3px solid var(--accent)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontFamily: 'var(--font-ui)', fontSize: 17, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
            Agregar integrante
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        {/* Avatar preview */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <div style={{
            width: 60, height: 60, borderRadius: '50%',
            background: COLOR_HEX[color] + '22',
            border: `2px solid ${COLOR_HEX[color]}44`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-ui)', color: COLOR_HEX[color],
          }}>
            {initials || '?'}
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <input
            className="text-input"
            type="text" placeholder="Nombre completo"
            value={fullName} onChange={e => setFullName(e.target.value)}
            autoFocus
          />
          <input
            className="text-input"
            type="email" placeholder="Email (opcional, para vincular login Google)"
            value={email} onChange={e => setEmail(e.target.value)}
          />
          <input
            className="text-input"
            type="text" inputMode="numeric" placeholder="Ingreso mensual (CLP)"
            value={income ? parseInt(income).toLocaleString('es-CL') : ''} onChange={e => setIncome(e.target.value.replace(/[^0-9]/g, ''))}
          />

          <div style={{ display: 'flex', gap: 8 }}>
            {(['Pro', 'Admin'] as ProfileRole[]).map(r => (
              <button key={r} type="button" onClick={() => setRole(r)}
                style={{
                  flex: 1, padding: '9px', borderRadius: 'var(--radius-sm)',
                  border: `1px solid ${role === r ? 'var(--accent)' : 'var(--border)'}`,
                  background: role === r ? 'rgba(52,201,138,.1)' : 'var(--surface-2)',
                  color: role === r ? 'var(--accent)' : 'var(--text-2)',
                  fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 13, cursor: 'pointer',
                  transition: 'all .15s',
                }}
              >
                {r}
              </button>
            ))}
          </div>

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
            type="submit" disabled={!fullName || saving}
            style={{
              padding: '12px', borderRadius: 'var(--radius-sm)',
              background: 'var(--accent)', color: '#06140e',
              fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 15,
              border: 'none', cursor: saving ? 'wait' : 'pointer',
              opacity: !fullName ? 0.5 : 1, marginTop: 4,
            }}
          >
            {saving ? 'Guardando...' : 'Agregar integrante'}
          </button>
        </form>
      </div>
    </div>
  )
}
