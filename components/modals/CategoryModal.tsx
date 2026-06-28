'use client'
import { useState } from 'react'
import { X, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/Toast'
import { ICON_CATALOG, catEmoji } from '@/lib/icons'
import type { Category, CategoryGroup, AccentColor } from '@/lib/types'

const GROUPS: CategoryGroup[] = ['Fijos', 'Variables', 'Ahorro']

const COLORS: { key: AccentColor; hex: string }[] = [
  { key: 'emerald', hex: '#34c98a' },
  { key: 'blue', hex: '#4f93f5' },
  { key: 'violet', hex: '#9b8cf0' },
  { key: 'amber', hex: '#e6b25a' },
  { key: 'red', hex: '#ef7a63' },
]

interface CategoryModalProps {
  profileId: string
  month: string            // '2026-06-01'
  category?: Category      // si viene → modo edición
  defaultGroup?: CategoryGroup
  onClose: () => void
  onSaved: () => void
}

export default function CategoryModal({ profileId, month, category, defaultGroup, onClose, onSaved }: CategoryModalProps) {
  const isEdit = !!category
  const [name, setName] = useState(category?.name ?? '')
  const [group, setGroup] = useState<CategoryGroup>(category?.group_name ?? defaultGroup ?? 'Variables')
  const [icon, setIcon] = useState(category?.icon ?? 'tag')
  const validColor = (c?: string): AccentColor => (COLORS.some(x => x.key === c) ? c as AccentColor : 'emerald')
  const color = validColor(category?.color)
  const [assigned, setAssigned] = useState(category ? String(category.assigned) : '')
  const [saving, setSaving] = useState(false)
  const { showToast } = useToast()
  const supabase = createClient()

  const assignedN = parseInt(assigned.replace(/\D/g, '')) || 0
  const formattedAssigned = assignedN > 0 ? assignedN.toLocaleString('es-CL') : ''
  // Variables = gasto discrecional (cuenta para "disponible hoy"); Fijos/Ahorro = fijo
  const fixed = group !== 'Variables'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)

    const payload = {
      name: name.trim(),
      group_name: group,
      icon,
      color,
      assigned: assignedN,
      fixed,
    }

    const { error } = isEdit
      ? await supabase.from('categories').update(payload).eq('id', category!.id)
      : await supabase.from('categories').insert({ ...payload, profile_id: profileId, month, spent: 0 })

    setSaving(false)
    if (error) { showToast('Error al guardar'); return }
    showToast(isEdit ? '✓ Categoría actualizada' : '✓ Categoría creada')
    onSaved(); onClose()
  }

  async function handleDelete() {
    if (!category) return
    if (!confirm(`¿Eliminar la categoría "${category.name}"? Los movimientos asociados quedarán sin categoría.`)) return
    setSaving(true)
    const { error } = await supabase.from('categories').delete().eq('id', category.id)
    setSaving(false)
    if (error) { showToast('Error al eliminar'); return }
    showToast('✓ Categoría eliminada')
    onSaved(); onClose()
  }

  const accentHex = (COLORS.find(c => c.key === color) ?? COLORS[0]).hex

  return (
    <div className="modal-scrim" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ borderTop: `3px solid ${accentHex}` }}>
        <div className="modal-head">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>{catEmoji(icon)}</span>
            {isEdit ? 'Editar categoría' : 'Nueva categoría'}
          </h3>
          <button type="button" onClick={onClose} className="icon-btn ghost sm">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Nombre */}
          <label className="field-label">Nombre</label>
          <input
            className="text-input"
            type="text"
            placeholder="Ej: Supermercado, Arriendo…"
            value={name}
            onChange={e => setName(e.target.value)}
            autoFocus
            maxLength={40}
          />

          {/* Sección (grupo) */}
          <label className="field-label" style={{ marginTop: 16 }}>Sección</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {GROUPS.map(g => (
              <button
                key={g}
                type="button"
                onClick={() => setGroup(g)}
                style={{
                  flex: 1,
                  padding: '9px',
                  borderRadius: 'var(--radius-sm)',
                  border: group === g ? `1px solid ${accentHex}` : '1px solid var(--border)',
                  background: group === g ? `color-mix(in oklab, ${accentHex} 14%, var(--surface-2))` : 'var(--surface-2)',
                  color: group === g ? 'var(--text)' : 'var(--text-2)',
                  fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 13, cursor: 'pointer',
                  transition: '.15s',
                }}
              >
                {g}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 6 }}>
            {group === 'Variables'
              ? 'Gasto discrecional — cuenta para "Disponible para gastar hoy".'
              : 'Gasto fijo — se reserva y no afecta el disponible diario.'}
          </div>

          {/* Monto asignado */}
          <label className="field-label" style={{ marginTop: 16 }}>Monto asignado ($)</label>
          <div className="amount-field" style={{ marginBottom: 0 }}>
            <span className="amount-cur">$</span>
            <input
              className="amount-input"
              type="text"
              inputMode="numeric"
              placeholder="0"
              value={formattedAssigned}
              onChange={e => setAssigned(e.target.value.replace(/\D/g, ''))}
            />
          </div>

          {/* Ícono */}
          <label className="field-label" style={{ marginTop: 16 }}>Ícono</label>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 6,
            maxHeight: 168, overflowY: 'auto', padding: 4,
            background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
          }}>
            {ICON_CATALOG.map(opt => (
              <button
                key={opt.key}
                type="button"
                title={opt.label}
                onClick={() => setIcon(opt.key)}
                style={{
                  aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18, borderRadius: 9, cursor: 'pointer',
                  border: icon === opt.key ? `2px solid ${accentHex}` : '2px solid transparent',
                  background: icon === opt.key ? `color-mix(in oklab, ${accentHex} 16%, transparent)` : 'transparent',
                  transition: 'background .1s',
                }}
                onMouseEnter={e => { if (icon !== opt.key) e.currentTarget.style.background = 'var(--surface-3)' }}
                onMouseLeave={e => { if (icon !== opt.key) e.currentTarget.style.background = 'transparent' }}
              >
                {opt.emoji}
              </button>
            ))}
          </div>

          {/* Acciones */}
          <div style={{ display: 'flex', gap: 10, marginTop: 20, alignItems: 'center' }}>
            {isEdit && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving}
                title="Eliminar categoría"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 44, padding: '12px 0', borderRadius: 'var(--radius-sm)',
                  background: 'transparent', border: '1px solid var(--border)',
                  color: 'var(--danger)', cursor: 'pointer', flexShrink: 0,
                }}
              >
                <Trash2 size={16} />
              </button>
            )}
            <button
              type="submit"
              disabled={!name.trim() || saving}
              className="btn-primary block"
              style={{ background: accentHex, opacity: name.trim() ? 1 : 0.4, marginTop: 0 }}
            >
              {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear categoría'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
