'use client'
import { useEffect, useState, useCallback } from 'react'
import { Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useProfiles } from '@/contexts/ProfileContext'
import Topbar from '@/components/layout/Topbar'
import ProgressRing from '@/components/charts/ProgressRing'
import GoalModal from '@/components/modals/GoalModal'
import { clp, clpShort } from '@/lib/utils'
import type { Goal } from '@/lib/types'

const COLOR_HEX: Record<string, string> = {
  emerald: '#34c98a', blue: '#4f93f5', violet: '#9b8cf0', amber: '#e6b25a', red: '#ef7a63',
}

export default function MetasPage() {
  const { activeProfile } = useProfiles()
  const supabase = createClient()
  const [goals, setGoals] = useState<Goal[]>([])
  const [showModal, setShowModal] = useState(false)
  const [contributing, setContributing] = useState<string | null>(null)
  const [contributeVal, setContributeVal] = useState('')

  const load = useCallback(async () => {
    if (!activeProfile) return
    const { data } = await supabase.from('goals').select('*').eq('profile_id', activeProfile.id).order('created_at')
    setGoals((data || []) as Goal[])
  }, [activeProfile, supabase])

  useEffect(() => { load() }, [load])

  if (!activeProfile) return null

  const totalSaved = goals.reduce((s, g) => s + g.current, 0)
  const totalTarget = goals.reduce((s, g) => s + g.target, 0)
  const totalMonthly = goals.reduce((s, g) => s + g.monthly, 0)

  async function contribute(goal: Goal) {
    const n = parseInt(contributeVal.replace(/[^0-9]/g, ''))
    if (!n) return
    await supabase.from('goals').update({ current: goal.current + n }).eq('id', goal.id)
    setContributing(null); setContributeVal('')
    load()
  }

  return (
    <div>
      <Topbar title="Metas" action={{ label: 'Nueva meta', onClick: () => setShowModal(true) }} />

      <div style={{ padding: 'var(--pad)', display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 'var(--gap)' }}>
          {[['Ahorrado', totalSaved, 'var(--ok)'], ['Objetivo total', totalTarget, 'var(--text)'], ['Aporte mensual', totalMonthly, 'var(--accent)']].map(([l, v, c]) => (
            <div key={l as string} className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-ui)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6 }}>{l as string}</div>
              <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-ui)', color: c as string }}>{clp(v as number)}</div>
            </div>
          ))}
        </div>

        {/* Goal cards grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 'var(--gap)' }}>
          {goals.map(g => {
            const pct = g.target > 0 ? g.current / g.target : 0
            const remaining = g.target - g.current
            const monthsLeft = g.monthly > 0 ? Math.ceil(remaining / g.monthly) : null
            const color = COLOR_HEX[g.color] || '#34c98a'

            return (
              <div key={g.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <ProgressRing pct={pct} size={72} stroke={7} color={color}
                    label={`${Math.round(pct * 100)}%`}
                  />
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-ui)', color: 'var(--text)', marginBottom: 3 }}>{g.name}</div>
                    {g.due && <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>Fecha: {g.due}</div>}
                    {monthsLeft !== null && (
                      <div style={{ fontSize: 12, color, fontWeight: 600 }}>Lista en {monthsLeft} {monthsLeft === 1 ? 'mes' : 'meses'}</div>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${Math.min(100, pct * 100)}%`, background: color }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-2)' }}>
                    <span>{clpShort(g.current)} ahorrado</span>
                    <span>Meta: {clpShort(g.target)}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 6, fontSize: 12, color: 'var(--text-faint)', borderTop: '1px solid var(--hairline)', paddingTop: 10 }}>
                  <span style={{ flex: 1 }}>Aporte mensual: <strong style={{ color: 'var(--text)' }}>{clpShort(g.monthly)}</strong></span>
                  <span>Falta: <strong style={{ color: 'var(--danger)' }}>{clpShort(remaining)}</strong></span>
                </div>

                {contributing === g.id ? (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      type="text" inputMode="numeric" autoFocus
                      placeholder="Monto ($)"
                      value={contributeVal}
                      onChange={e => setContributeVal(e.target.value.replace(/[^0-9]/g, ''))}
                      onKeyDown={e => { if (e.key === 'Enter') contribute(g); if (e.key === 'Escape') setContributing(null) }}
                      style={{ flex: 1, padding: '8px 12px', fontSize: 13, outline: 'none' }}
                    />
                    <button onClick={() => contribute(g)}
                      style={{ padding: '8px 14px', borderRadius: 'var(--radius-sm)', background: color, color: '#06140e', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                      Aportar
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => { setContributing(g.id); setContributeVal('') }}
                      style={{ flex: 1, padding: '9px', borderRadius: 'var(--radius-sm)', background: color + '15', color, border: `1px solid ${color}30`, fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                      Aportar
                    </button>
                    <button style={{ flex: 1, padding: '9px', borderRadius: 'var(--radius-sm)', background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)', fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                      Ajustar
                    </button>
                  </div>
                )}
              </div>
            )
          })}

          {/* Create new card */}
          <button onClick={() => setShowModal(true)}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10,
              padding: 32, borderRadius: 'var(--radius)', border: '2px dashed var(--border)',
              background: 'transparent', cursor: 'pointer', transition: 'all .15s', minHeight: 200,
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'rgba(52,201,138,.05)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'transparent' }}
          >
            <Plus size={24} color="var(--text-faint)" />
            <span style={{ fontSize: 14, color: 'var(--text-faint)', fontFamily: 'var(--font-ui)' }}>Crear nueva meta</span>
          </button>
        </div>
      </div>

      {showModal && (
        <GoalModal profileId={activeProfile.id} onClose={() => setShowModal(false)} onSaved={load} />
      )}
    </div>
  )
}
