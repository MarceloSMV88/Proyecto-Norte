'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useProfiles } from '@/contexts/ProfileContext'
import Topbar from '@/components/layout/Topbar'
import { clp, computeSummary } from '@/lib/utils'
import type { Category, Account } from '@/lib/types'

type CategoryGroup = 'Fijos' | 'Variables' | 'Ahorro'
const GROUPS: CategoryGroup[] = ['Fijos', 'Variables', 'Ahorro']

export default function PresupuestoPage() {
  const { activeProfile } = useProfiles()
  const supabase = createClient()
  const [categories, setCategories] = useState<Category[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [editing, setEditing] = useState<string | null>(null)
  const [editVal, setEditVal] = useState('')

  const load = useCallback(async () => {
    if (!activeProfile) return
    const month = new Date().toISOString().slice(0, 7) + '-01'
    const [cats, accs] = await Promise.all([
      supabase.from('categories').select('*').eq('profile_id', activeProfile.id).eq('month', month).order('created_at'),
      supabase.from('accounts').select('*').eq('profile_id', activeProfile.id),
    ])
    setCategories((cats.data || []) as Category[])
    setAccounts((accs.data || []) as Account[])
  }, [activeProfile, supabase])

  useEffect(() => { load() }, [load])

  if (!activeProfile) return null
  const summary = computeSummary(categories, accounts, activeProfile.income)
  const unassigned = summary.unassigned

  async function updateAssigned(id: string, val: string) {
    const n = parseInt(val.replace(/\./g, ''))
    if (isNaN(n)) return
    await supabase.from('categories').update({ assigned: n }).eq('id', id)
    setEditing(null)
    load()
  }

  return (
    <div>
      <Topbar title="Presupuesto" subtitle={new Date().toLocaleString('es-CL', { month: 'long', year: 'numeric' })} />

      <div className="scroll">

        {/* Banner listo para asignar */}
        <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-faint)', fontFamily: 'var(--font-ui)', marginBottom: 4 }}>
              {unassigned === 0 ? '✓ Todo asignado' : unassigned > 0 ? 'Listo para asignar' : 'Asignado de más'}
            </div>
            <div style={{ fontSize: 36, fontWeight: 700, fontFamily: 'var(--font-ui)', letterSpacing: '-1.5px', color: unassigned < 0 ? 'var(--danger)' : unassigned === 0 ? 'var(--ok)' : 'var(--text)' }}>
              {clp(unassigned)}
            </div>
          </div>
          <div style={{ flex: 1, maxWidth: 340 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 6, fontSize: 12, color: 'var(--text-faint)', fontFamily: 'var(--font-ui)' }}>
              <span>Ingreso <b style={{ color: 'var(--text)' }}>{clp(summary.income)}</b></span>
              <span>Asignado <b style={{ color: 'var(--text)' }}>{clp(summary.assignedTotal)}</b></span>
            </div>
            <div className="progress-track" style={{ height: 8 }}>
              <div className="progress-fill" style={{
                width: `${Math.min(100, (summary.assignedTotal / summary.income) * 100)}%`,
                background: unassigned < 0 ? 'var(--danger)' : 'var(--accent)',
              }} />
            </div>
          </div>
        </div>

        {/* Mini stats */}
        {(() => {
          const spentPct = summary.assignedTotal > 0 ? summary.spentTotal / summary.assignedTotal : 0
          const dispTotal = summary.assignedTotal - summary.spentTotal
          const spentColor = summary.spentTotal > summary.assignedTotal ? 'var(--danger)' : spentPct > 0.88 ? 'var(--warn)' : 'var(--text)'
          const dispColor  = dispTotal < 0 ? 'var(--danger)' : spentPct > 0.88 ? 'var(--warn)' : 'var(--ok)'
          return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 'var(--gap)' }}>
          {[
            ['Ingreso', summary.income, 'var(--text)'],
            ['Asignado', summary.assignedTotal, 'var(--text-2)'],
            ['Gastado', summary.spentTotal, spentColor],
            ['Disponible total', dispTotal, dispColor],
          ].map(([l, v, c]) => (
            <div key={l as string} className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-ui)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.5px' }}>{l as string}</div>
              <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-ui)', color: c as string }}>{clp(v as number)}</div>
            </div>
          ))}
        </div>
          )
        })()}

        {/* Groups */}
        {GROUPS.map(group => {
          const cats = categories.filter(c => c.group_name === group)
          if (cats.length === 0) return null
          const subtotalAssigned = cats.reduce((s, c) => s + c.assigned, 0)
          const subtotalSpent = cats.reduce((s, c) => s + c.spent, 0)

          return (
            <div key={group} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, paddingBottom: 12, borderBottom: '1px solid var(--hairline)' }}>
                <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 14 }}>{group}</span>
                <div style={{ display: 'flex', gap: 20, fontSize: 12, color: 'var(--text-faint)', fontFamily: 'var(--font-ui)' }}>
                  <span>Asignado {clp(subtotalAssigned)}</span>
                  <span>Gastado {clp(subtotalSpent)}</span>
                  <span style={{ color: subtotalAssigned - subtotalSpent < 0 ? 'var(--danger)' : subtotalAssigned > 0 && subtotalSpent / subtotalAssigned > 0.88 ? 'var(--warn)' : 'var(--ok)' }}>
                    Disp. {clp(subtotalAssigned - subtotalSpent)}
                  </span>
                </div>
              </div>

              {/* Header row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 1fr 90px 36px', gap: 12, padding: '0 8px 8px', borderBottom: '1px solid var(--hairline)' }}>
                {['Categoría', 'Asignado', 'Gastado / Disponible', 'Disponible', ''].map(h => (
                  <span key={h} style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-ui)', textTransform: 'uppercase', letterSpacing: '.4px' }}>{h}</span>
                ))}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4 }}>
                {cats.map(cat => {
                  const pct = cat.assigned > 0 ? cat.spent / cat.assigned : 0
                  const status = pct > 1 ? 'var(--danger)' : pct > 0.88 ? 'var(--warn)' : 'var(--ok)'
                  const disp = cat.assigned - cat.spent

                  return (
                    <div key={cat.id} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 1fr 90px 36px', gap: 12, padding: '10px 8px', borderRadius: 10, alignItems: 'center', transition: 'background .15s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span>{cat.icon === 'home' ? '🏠' : cat.icon === 'cart' ? '🛒' : cat.icon === 'car' ? '🚗' : cat.icon === 'zap' ? '⚡' : cat.icon === 'heart' ? '❤️' : cat.icon === 'film' ? '🎬' : cat.icon === 'bag' ? '👜' : cat.icon === 'target' ? '🎯' : cat.icon === 'repeat' ? '🔄' : cat.icon === 'utensils' ? '🍽️' : '📌'}</span>
                        <div>
                          <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--font-ui)' }}>{cat.name}</div>
                          {cat.fixed && <span style={{ fontSize: 10, color: 'var(--text-faint)', background: 'var(--surface-3)', padding: '1px 5px', borderRadius: 999 }}>Fijo</span>}
                        </div>
                      </div>

                      {/* Editable assigned */}
                      {editing === cat.id ? (
                        <input
                          type="text" inputMode="numeric" autoFocus
                          value={editVal}
                          onChange={e => setEditVal(e.target.value.replace(/[^0-9]/g, ''))}
                          onBlur={() => updateAssigned(cat.id, editVal)}
                          onKeyDown={e => { if (e.key === 'Enter') updateAssigned(cat.id, editVal); if (e.key === 'Escape') setEditing(null) }}
                          style={{ padding: '5px 10px', fontSize: 13, fontFamily: 'var(--font-ui)', outline: 'none', width: '100%' }}
                        />
                      ) : (
                        <button onClick={() => { setEditing(cat.id); setEditVal(String(cat.assigned)) }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-ui)', fontWeight: 500, color: 'var(--text)', textAlign: 'left', padding: '5px 10px', borderRadius: 8, transition: 'background .15s' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-3)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          {clp(cat.assigned)}
                        </button>
                      )}

                      <div>
                        <div className="progress-track" style={{ marginBottom: 3 }}>
                          <div className="progress-fill" style={{ width: `${Math.min(100, pct * 100)}%`, background: status }} />
                        </div>
                        <div style={{ fontSize: 11, color: status }}>{clp(cat.spent)}</div>
                      </div>

                      <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-ui)', color: status }}>
                        {clp(disp)}
                      </span>

                      <button title="Mover dinero" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 16, padding: 4 }}>⇄</button>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
