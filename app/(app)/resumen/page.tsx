'use client'
import { useEffect, useState, useCallback } from 'react'
import { Plus, ArrowLeftRight, Target, TrendingDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useProfiles } from '@/contexts/ProfileContext'
import Topbar from '@/components/layout/Topbar'
import StatCard from '@/components/ui/StatCard'
import AreaChart from '@/components/charts/AreaChart'
import BarPairs from '@/components/charts/BarPairs'
import Donut from '@/components/charts/Donut'
import TransactionModal from '@/components/modals/TransactionModal'
import GoalModal from '@/components/modals/GoalModal'
import { clp, clpShort, computeSummary, getDaysLeftInMonth } from '@/lib/utils'
import type { Category, Account, Goal, Transaction, Upcoming, MonthlyBar } from '@/lib/types'

type ModalType = 'gasto' | 'ingreso' | 'mover' | 'meta' | null

export default function ResumenPage() {
  const { activeProfile } = useProfiles()
  const supabase = createClient()

  const [categories, setCategories] = useState<Category[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [upcoming, setUpcoming] = useState<Upcoming[]>([])
  const [months, setMonths] = useState<MonthlyBar[]>([])
  const [modal, setModal] = useState<ModalType>(null)
  const [expandedCat, setExpandedCat] = useState<string | null>(null)
  const [catFilter, setCatFilter] = useState<'Todas' | 'Fijos' | 'Variables'>('Todas')

  const load = useCallback(async () => {
    if (!activeProfile) return
    const pid = activeProfile.id
    const month = new Date().toISOString().slice(0, 7) + '-01'

    const [cats, accs, gls, txs, upcs] = await Promise.all([
      supabase.from('categories').select('*').eq('profile_id', pid).eq('month', month),
      supabase.from('accounts').select('*').eq('profile_id', pid),
      supabase.from('goals').select('*').eq('profile_id', pid).order('created_at'),
      supabase.from('transactions').select('*, categories(name,icon,color), accounts(name)').eq('profile_id', pid).order('date', { ascending: false }).limit(20),
      supabase.from('upcoming').select('*, categories(name,icon), accounts(name)').eq('profile_id', pid).order('due_date').limit(5),
    ])

    setCategories((cats.data || []) as Category[])
    setAccounts((accs.data || []) as Account[])
    setGoals((gls.data || []) as Goal[])
    setTransactions((txs.data || []) as Transaction[])
    setUpcoming((upcs.data || []) as Upcoming[])

    // Build monthly bars from transactions
    const byMonth: Record<string, { income: number; expense: number }> = {}
    for (const tx of (txs.data || []) as Transaction[]) {
      const m = tx.date.slice(0, 7)
      if (!byMonth[m]) byMonth[m] = { income: 0, expense: 0 }
      if (tx.amount > 0) byMonth[m].income += tx.amount
      else byMonth[m].expense += Math.abs(tx.amount)
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

  const daysLeft = getDaysLeftInMonth()
  const summary = computeSummary(categories, accounts, activeProfile.income, daysLeft)

  // Pace (ideal daily spend)
  const totalDays = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()
  const pace = Array.from({ length: totalDays }, (_, i) => Math.round(summary.variableAssigned * (i / totalDays)))

  // Daily flow from transactions (cumulative)
  const dailySpend: number[] = []
  let cum = 0
  const now = new Date()
  for (let i = 1; i <= now.getDate(); i++) {
    const dayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`
    const dayTotal = transactions.filter(t => t.date === dayStr && t.amount < 0 && t.type === 'gasto').reduce((s, t) => s + Math.abs(t.amount), 0)
    cum += dayTotal
    dailySpend.push(cum)
  }

  const filteredCats = catFilter === 'Todas' ? categories : categories.filter(c => c.group_name === catFilter)
  const donutData = categories.filter(c => c.spent > 0).sort((a, b) => b.spent - a.spent).slice(0, 6)
    .map(c => ({ label: c.name, value: c.spent, color: c.color }))

  return (
    <div>
      <Topbar title="Resumen" subtitle={new Date().toLocaleString('es-CL', { month: 'long', year: 'numeric' })} />

      <div style={{ padding: 'var(--pad)', display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>

        {/* Hero */}
        <div className="card" style={{ background: 'linear-gradient(135deg, var(--surface) 0%, var(--surface-2) 100%)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 24, alignItems: 'start' }}>
            <div>
              <p style={{ fontSize: 13, color: 'var(--text-faint)', fontFamily: 'var(--font-ui)', margin: '0 0 4px' }}>
                Disponible para gastar hoy
              </p>
              <div style={{ fontSize: 52, fontWeight: 700, fontFamily: 'var(--font-ui)', letterSpacing: '-2px', color: 'var(--text)', lineHeight: 1 }}>
                {clp(summary.safeToday)}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                <span style={{ fontSize: 11, background: 'rgba(52,201,138,.15)', color: 'var(--ok)', padding: '3px 9px', borderRadius: 999, fontFamily: 'var(--font-ui)', fontWeight: 600 }}>
                  Ritmo saludable
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
                  {daysLeft} días restantes · {clp(summary.variableAssigned - summary.variableSpent)} disponible
                </span>
              </div>

              {/* Quick actions */}
              <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
                {([['gasto', 'Agregar gasto', 'var(--danger)'], ['ingreso', 'Agregar ingreso', 'var(--ok)'], ['mover', 'Mover dinero', 'var(--c-blue)'], ['meta', 'Crear meta', 'var(--c-violet)']] as const).map(([t, l, c]) => (
                  <button key={t} onClick={() => setModal(t)}
                    style={{
                      padding: '7px 13px', borderRadius: 999, border: `1px solid ${c}33`,
                      background: `${c}11`, color: c, fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 12.5,
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, transition: 'background .15s',
                    }}
                  >
                    <Plus size={13} /> {l}
                  </button>
                ))}
              </div>
            </div>

            {/* Right: anillo + stats */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 180 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  ['Ingreso', summary.income, 'var(--text)'],
                  ['Asignado', summary.assignedTotal, 'var(--text-2)'],
                  ['Libre por asignar', summary.unassigned, summary.unassigned < 0 ? 'var(--danger)' : 'var(--ok)'],
                ].map(([l, v, c]) => (
                  <div key={l as string} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-faint)', fontFamily: 'var(--font-ui)' }}>{l as string}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-ui)', color: c as string }}>{clp(v as number)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 4 stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 'var(--gap)' }}>
          <StatCard label="Saldo disponible" value={summary.available} spark={dailySpend} />
          <StatCard label="Gastos del mes" value={summary.spentTotal} valueColor="var(--danger)" />
          <StatCard label="Ahorro acumulado" value={summary.savings} valueColor="var(--ok)" />
          <StatCard label="Libre por asignar" value={summary.unassigned} valueColor={summary.unassigned < 0 ? 'var(--danger)' : 'var(--ok)'} />
        </div>

        {/* Flujo + Donut */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--gap)' }}>
          <div className="card">
            <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Flujo del mes</div>
            <AreaChart data={dailySpend} pace={pace.slice(0, dailySpend.length)} height={140} />
            {months.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <div style={{ fontSize: 12, color: 'var(--text-2)', fontFamily: 'var(--font-ui)', marginBottom: 10 }}>Últimos 6 meses</div>
                <BarPairs data={months} />
                <div style={{ display: 'flex', gap: 14, marginTop: 8 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-faint)' }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--ok)', display: 'inline-block' }} />Ingreso
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-faint)' }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--danger)', display: 'inline-block' }} />Gasto
                  </span>
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
            {/* Gasto por categoría */}
            {donutData.length > 0 && (
              <div className="card">
                <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Gasto por categoría</div>
                <Donut data={donutData} />
              </div>
            )}

            {/* Próximos vencimientos */}
            {upcoming.length > 0 && (
              <div className="card">
                <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Próximos vencimientos</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {upcoming.map(u => (
                    <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{u.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                          {new Date(u.due_date).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}
                        </div>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-ui)', color: 'var(--danger)' }}>
                        {clp(u.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Metas */}
            {goals.length > 0 && (
              <div className="card">
                <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Metas</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {goals.slice(0, 3).map(g => {
                    const pct = g.target > 0 ? g.current / g.target : 0
                    const colorHex: Record<string, string> = { emerald: '#34c98a', blue: '#4f93f5', violet: '#9b8cf0', amber: '#e6b25a', red: '#ef7a63' }
                    const c = colorHex[g.color] || '#34c98a'
                    return (
                      <div key={g.id}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>{g.name}</span>
                          <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{Math.round(pct * 100)}%</span>
                        </div>
                        <div className="progress-track">
                          <div className="progress-fill" style={{ width: `${pct * 100}%`, background: c }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
                          <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{clpShort(g.current)}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{clpShort(g.target)}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Presupuesto por categorías */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 15 }}>Presupuesto por categorías</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['Todas', 'Fijos', 'Variables'] as const).map(f => (
                <button key={f} onClick={() => setCatFilter(f)}
                  className={`chip${catFilter === f ? ' active' : ''}`}
                  style={{ fontSize: 12 }}
                >{f}</button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {filteredCats.map(cat => {
              const pct = cat.assigned > 0 ? cat.spent / cat.assigned : 0
              const status = pct > 1 ? 'danger' : pct > 0.88 ? 'warn' : 'ok'
              const statusColor = status === 'danger' ? 'var(--danger)' : status === 'warn' ? 'var(--warn)' : 'var(--ok)'
              const expanded = expandedCat === cat.id
              const catTxs = transactions.filter(t => t.category_id === cat.id)

              return (
                <div key={cat.id}>
                  <button
                    onClick={() => setExpandedCat(expanded ? null : cat.id)}
                    style={{
                      width: '100%', display: 'grid', gridTemplateColumns: '1fr 100px 120px 80px',
                      gap: 16, alignItems: 'center', padding: '10px 8px',
                      background: 'none', border: 'none', cursor: 'pointer', borderRadius: 10,
                      transition: 'background .15s', textAlign: 'left',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 16 }}>
                        {cat.icon === 'home' ? '🏠' : cat.icon === 'cart' ? '🛒' : cat.icon === 'car' ? '🚗' : cat.icon === 'zap' ? '⚡' : cat.icon === 'heart' ? '❤️' : cat.icon === 'film' ? '🎬' : cat.icon === 'bag' ? '👜' : cat.icon === 'target' ? '🎯' : cat.icon === 'repeat' ? '🔄' : cat.icon === 'utensils' ? '🍽️' : '📌'}
                      </span>
                      <div>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--font-ui)' }}>{cat.name}</div>
                        {cat.fixed && <span style={{ fontSize: 10, color: 'var(--text-faint)', background: 'var(--surface-3)', padding: '1px 6px', borderRadius: 999 }}>Fijo</span>}
                      </div>
                    </div>
                    <span style={{ fontSize: 13, fontFamily: 'var(--font-ui)', color: 'var(--text-2)', fontWeight: 500, textAlign: 'right' }}>
                      {clp(cat.assigned)}
                    </span>
                    <div>
                      <div className="progress-track" style={{ marginBottom: 3 }}>
                        <div className="progress-fill" style={{ width: `${Math.min(100, pct * 100)}%`, background: statusColor }} />
                      </div>
                      <div style={{ fontSize: 11, color: statusColor }}>{clp(cat.spent)} gastado</div>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-ui)', color: statusColor, textAlign: 'right' }}>
                      {clp(cat.assigned - cat.spent)}
                    </span>
                  </button>

                  {expanded && catTxs.length > 0 && (
                    <div style={{ paddingLeft: 36, paddingBottom: 8 }}>
                      {catTxs.slice(0, 5).map(tx => (
                        <div key={tx.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 8px', fontSize: 12.5, color: 'var(--text-2)' }}>
                          <span>{tx.name}</span>
                          <span style={{ fontWeight: 600, color: 'var(--danger)' }}>{clp(Math.abs(tx.amount))}</span>
                        </div>
                      ))}
                      {status === 'danger' && (
                        <div style={{ fontSize: 12, color: 'var(--danger)', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <TrendingDown size={13} /> Presupuesto excedido por {clp(cat.spent - cat.assigned)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Modales */}
      {(modal === 'gasto' || modal === 'ingreso' || modal === 'mover') && (
        <TransactionModal
          type={modal}
          profileId={activeProfile.id}
          categories={categories}
          accounts={accounts}
          onClose={() => setModal(null)}
          onSaved={load}
        />
      )}
      {modal === 'meta' && (
        <GoalModal
          profileId={activeProfile.id}
          onClose={() => setModal(null)}
          onSaved={load}
        />
      )}
    </div>
  )
}
