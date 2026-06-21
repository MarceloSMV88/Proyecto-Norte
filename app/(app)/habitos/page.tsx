'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useProfiles } from '@/contexts/ProfileContext'
import Topbar from '@/components/layout/Topbar'
import BarPairs from '@/components/charts/BarPairs'
import { clp, clpShort } from '@/lib/utils'
import type { Category, Subscription, Transaction, MonthlyBar } from '@/lib/types'

const USAGE_COLOR = { alto: 'var(--ok)', medio: 'var(--warn)', bajo: 'var(--danger)' } as const
const USAGE_LABEL = { alto: 'Alto uso', medio: 'Uso medio', bajo: 'Bajo uso' } as const

export default function HabitosPage() {
  const { activeProfile } = useProfiles()
  const supabase = createClient()
  const [categories, setCategories] = useState<Category[]>([])
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [months, setMonths] = useState<MonthlyBar[]>([])

  const load = useCallback(async () => {
    if (!activeProfile) return
    const pid = activeProfile.id
    const month = new Date().toISOString().slice(0, 7) + '-01'
    const [cats, subs, txs] = await Promise.all([
      supabase.from('categories').select('*').eq('profile_id', pid).eq('month', month),
      supabase.from('subscriptions').select('*').eq('profile_id', pid).order('amount', { ascending: false }),
      supabase.from('transactions').select('date,amount,type').eq('profile_id', pid).order('date'),
    ])
    setCategories((cats.data || []) as Category[])
    setSubscriptions((subs.data || []) as Subscription[])

    // Build monthly bars
    const byMonth: Record<string, { income: number; expense: number }> = {}
    for (const tx of (txs.data || []) as Transaction[]) {
      const m = tx.date.slice(0, 7)
      if (!byMonth[m]) byMonth[m] = { income: 0, expense: 0 }
      if (tx.amount > 0) byMonth[m].income += tx.amount
      else if (tx.type === 'gasto') byMonth[m].expense += Math.abs(tx.amount)
    }
    const bars = Object.entries(byMonth).slice(-6).map(([m, v]) => ({
      m: new Date(m + '-01').toLocaleString('es-CL', { month: 'short' }),
      income: v.income, expense: v.expense,
      partial: m === month.slice(0, 7),
    }))
    setMonths(bars)
  }, [activeProfile, supabase])

  useEffect(() => { load() }, [load])

  if (!activeProfile) return null

  const spentTotal = categories.reduce((s, c) => s + c.spent, 0)
  const subsTotal = subscriptions.reduce((s, s2) => s + s2.amount, 0)
  const unusedSubs = subscriptions.filter(s => s.used === 'bajo')
  const unusedAmount = unusedSubs.reduce((s, s2) => s + s2.amount, 0)
  const topCats = [...categories].sort((a, b) => b.spent - a.spent).slice(0, 6)
  const avgDaily = categories.length > 0 ? Math.round(spentTotal / new Date().getDate()) : 0
  const projectedEnd = Math.round(spentTotal * (30 / new Date().getDate()))

  const leaks = [
    ...categories.filter(c => c.spent > c.assigned && c.assigned > 0).map(c => ({
      label: `${c.name} superó su presupuesto`,
      amount: c.spent - c.assigned,
      color: 'red' as const,
    })),
    ...unusedSubs.map(s => ({
      label: `${s.name} con bajo uso este mes`,
      amount: s.amount,
      color: 'violet' as const,
    })),
  ].slice(0, 5)

  const leaksTotal = leaks.reduce((s, l) => s + l.amount, 0)
  const maxCatSpent = topCats[0]?.spent || 1

  const COLOR_HEX: Record<string, string> = {
    emerald: '#34c98a', blue: '#4f93f5', violet: '#9b8cf0', amber: '#e6b25a', red: '#ef7a63', slate: '#7c8893',
  }

  return (
    <div>
      <Topbar title="Hábitos" subtitle="Insights de tu comportamiento financiero" />

      <div className="scroll">

        {/* Insight cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 'var(--gap)' }}>
          <div className="card" style={{ borderLeft: '3px solid var(--accent)' }}>
            <div style={{ fontSize: 12, color: 'var(--text-faint)', fontFamily: 'var(--font-ui)', marginBottom: 8 }}>Resumen del mes</div>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-ui)', color: 'var(--text)', marginBottom: 4 }}>{clp(spentTotal)}</div>
            <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
              Promedio diario: <strong style={{ color: 'var(--text)' }}>{clp(avgDaily)}</strong>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4 }}>
              Proyección fin de mes: <strong style={{ color: projectedEnd > activeProfile.income ? 'var(--danger)' : 'var(--ok)' }}>{clp(projectedEnd)}</strong>
            </div>
          </div>

          <div className="card" style={{ borderLeft: '3px solid var(--c-violet)' }}>
            <div style={{ fontSize: 12, color: 'var(--text-faint)', fontFamily: 'var(--font-ui)', marginBottom: 8 }}>Suscripciones</div>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-ui)', color: 'var(--text)', marginBottom: 4 }}>{clp(subsTotal)}/mes</div>
            {unusedAmount > 0 && (
              <div style={{ fontSize: 13, color: 'var(--danger)' }}>
                {clp(unusedAmount)}/mes en suscripciones con bajo uso
              </div>
            )}
          </div>

          {leaksTotal > 0 && (
            <div className="card" style={{ borderLeft: '3px solid var(--danger)' }}>
              <div style={{ fontSize: 12, color: 'var(--text-faint)', fontFamily: 'var(--font-ui)', marginBottom: 8 }}>Posibles fugas</div>
              <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-ui)', color: 'var(--danger)', marginBottom: 4 }}>{clp(leaksTotal)}</div>
              <div style={{ fontSize: 13, color: 'var(--text-2)' }}>Recorte potencial al mes</div>
            </div>
          )}
        </div>

        {/* Dónde gastas más */}
        {topCats.length > 0 && (
          <div className="card">
            <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Dónde gastas más</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {topCats.map(cat => (
                <div key={cat.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--font-ui)' }}>{cat.name}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-ui)', color: 'var(--text)' }}>{clpShort(cat.spent)}</span>
                  </div>
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${(cat.spent / maxCatSpent) * 100}%`, background: COLOR_HEX[cat.color] || 'var(--accent)' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Evolución mensual */}
        {months.length > 0 && (
          <div className="card">
            <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Evolución mensual</div>
            <BarPairs data={months} />
            <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-faint)' }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--ok)', display: 'inline-block' }} />Ingreso
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-faint)' }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--danger)', display: 'inline-block' }} />Gasto
              </span>
            </div>
          </div>
        )}

        {/* Fugas */}
        {leaks.length > 0 && (
          <div className="card">
            <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Posibles fugas</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {leaks.map((l, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 'var(--radius-sm)', background: 'var(--surface-2)', borderLeft: `3px solid ${COLOR_HEX[l.color] || 'var(--danger)'}` }}>
                  <span style={{ fontSize: 13.5, color: 'var(--text)' }}>{l.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-ui)', color: COLOR_HEX[l.color] || 'var(--danger)', flexShrink: 0 }}>
                    {clp(l.amount)}/mes
                  </span>
                </div>
              ))}
              <div style={{ fontSize: 12, color: 'var(--text-faint)', textAlign: 'right', marginTop: 4 }}>
                Recorte potencial total: <strong style={{ color: 'var(--ok)' }}>{clp(leaksTotal)}/mes</strong>
              </div>
            </div>
          </div>
        )}

        {/* Suscripciones */}
        {subscriptions.length > 0 && (
          <div className="card">
            <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Suscripciones</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {subscriptions.map(s => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 8px', borderRadius: 10, transition: 'background .15s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: (COLOR_HEX[s.color] || '#34c98a') + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🔄</div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--font-ui)' }}>{s.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>Día {s.day} de cada mes</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: USAGE_COLOR[s.used], background: USAGE_COLOR[s.used] + '15', padding: '3px 8px', borderRadius: 999, fontFamily: 'var(--font-ui)' }}>
                      {USAGE_LABEL[s.used]}
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-ui)', color: 'var(--text)', minWidth: 80, textAlign: 'right' }}>{clp(s.amount)}</span>
                  </div>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 8px 0', borderTop: '1px solid var(--hairline)', marginTop: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-ui)', color: 'var(--text)' }}>Total: {clp(subsTotal)}/mes</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
