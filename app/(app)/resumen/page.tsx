'use client'
import { useEffect, useState, useCallback } from 'react'
import { ArrowUp, ArrowDown, ArrowLeftRight, Flag, TrendingDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useProfiles } from '@/contexts/ProfileContext'
import Topbar from '@/components/layout/Topbar'
import BarPairs from '@/components/charts/BarPairs'
import { clp, clpShort, computeSummary, getDaysLeftInMonth } from '@/lib/utils'
import { catEmoji } from '@/lib/icons'
import type { Category, Account, Goal, Transaction, Upcoming, MonthlyBar } from '@/lib/types'
import TransactionModal from '@/components/modals/TransactionModal'
import GoalModal from '@/components/modals/GoalModal'

type ModalType = 'gasto' | 'ingreso' | 'mover' | 'meta' | null

const COLOR_HEX: Record<string, string> = {
  emerald: '#34c98a', blue: '#4f93f5', violet: '#9b8cf0', amber: '#e6b25a', red: '#ef7a63', slate: '#7c8893',
}

export default function ResumenPage() {
  const { activeProfile } = useProfiles()
  const supabase = createClient()

  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7) + '-01')
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
    // Compute next month for range queries
    const nextM = new Date(selectedMonth + 'T12:00:00')
    nextM.setMonth(nextM.getMonth() + 1)
    const nextMonthStr = nextM.toISOString().slice(0, 7) + '-01'

    const [cats, accs, gls, txs, upcs] = await Promise.all([
      supabase.from('categories').select('*').eq('profile_id', pid).eq('month', selectedMonth),
      supabase.from('accounts').select('*').eq('profile_id', pid),
      supabase.from('goals').select('*').eq('profile_id', pid).order('created_at').limit(3),
      supabase.from('transactions').select('*, categories(name,icon,color), accounts(name)')
        .eq('profile_id', pid)
        .gte('date', selectedMonth).lt('date', nextMonthStr)
        .order('date', { ascending: false }).limit(200),
      supabase.from('upcoming').select('*, categories(name,icon), accounts(name)')
        .eq('profile_id', pid).order('due_date').limit(4),
    ])
    setCategories((cats.data || []) as Category[])
    setAccounts((accs.data || []) as Account[])
    setGoals((gls.data || []) as Goal[])
    setTransactions((txs.data || []) as Transaction[])
    setUpcoming((upcs.data || []) as Upcoming[])

    // Build monthly bars (always last 6 months regardless of selectedMonth)
    const allTxs6m = (await supabase.from('transactions').select('date,amount,type')
      .eq('profile_id', pid).order('date').limit(500)).data || []
    const byMonth: Record<string, { income: number; expense: number }> = {}
    for (const tx of allTxs6m as Transaction[]) {
      const m = tx.date.slice(0, 7)
      if (!byMonth[m]) byMonth[m] = { income: 0, expense: 0 }
      if (tx.amount > 0) byMonth[m].income += tx.amount
      else if (tx.type === 'gasto') byMonth[m].expense += Math.abs(tx.amount)
    }
    const curMonth = selectedMonth.slice(0, 7)
    const bars = Object.entries(byMonth).slice(-6).map(([m, v]) => ({
      m: new Date(m + '-15').toLocaleString('es-CL', { month: 'short' }),
      income: v.income, expense: v.expense,
      partial: m === curMonth,
    }))
    setMonths(bars)
  }, [activeProfile, supabase, selectedMonth])

  useEffect(() => { load() }, [load])

  if (!activeProfile) return null

  // For selected month: use real daysLeft only for current month, otherwise use full month
  const isCurrentMonth = selectedMonth.slice(0, 7) === new Date().toISOString().slice(0, 7)
  const selDate = new Date(selectedMonth + 'T12:00:00')
  const totalDays = new Date(selDate.getFullYear(), selDate.getMonth() + 1, 0).getDate()
  const daysLeft = isCurrentMonth ? getDaysLeftInMonth() : totalDays
  const s = computeSummary(categories, accounts, activeProfile.income, daysLeft)
  const varPct = s.variableAssigned > 0 ? Math.round((s.variableSpent / s.variableAssigned) * 100) : 0

  // Gauge SVG
  const gaugeSize = 132, gaugeStroke = 12, gaugeR = (gaugeSize - gaugeStroke) / 2
  const gaugeC = 2 * Math.PI * gaugeR
  const gaugeDash = (varPct / 100) * gaugeC

  // Pace bar
  const spentToday = transactions
    .filter(t => t.date === new Date().toISOString().slice(0, 10) && t.type === 'gasto')
    .reduce((a, t) => a + Math.abs(t.amount), 0)
  const pacePct = s.safeToday > 0 ? Math.min(100, (spentToday / (s.safeToday * 1.6)) * 100) : 0
  const markerPct = s.safeToday > 0 ? (s.safeToday / (s.safeToday * 1.6)) * 100 : 62

  // Spark for stat cards
  const dailyFlow: number[] = []
  let cum = 0
  const now = new Date()
  for (let i = 1; i <= now.getDate(); i++) {
    const d = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`
    cum += transactions.filter(t => t.date === d && t.type === 'gasto').reduce((a, t) => a + Math.abs(t.amount), 0)
    dailyFlow.push(cum)
  }

  const filteredCats = catFilter === 'Todas' ? categories : categories.filter(c => c.group_name === catFilter)
  const donutSegs = [...categories].filter(c => c.spent > 0).sort((a, b) => b.spent - a.spent).slice(0, 5)
  const donutTotal = donutSegs.reduce((a, c) => a + c.spent, 0)

  // Donut SVG
  const DR = 65, DC = 75
  const donutC = 2 * Math.PI * DR
  let donutOffset = 0

  return (
    <>
      <Topbar title={`Hola, ${activeProfile.name}`} subtitle="Vas bien este mes. Esto es lo que importa hoy." month={selectedMonth} onMonthChange={m => { setSelectedMonth(m); setExpandedCat(null) }} />
      <div className="scroll">

        {/* ── Hero ── */}
        <section className="hero card">
          <div className="hero-main">
            <div className="hero-head">
              <span className="eyebrow">
                <span className="dot" />
                Disponible para gastar hoy
              </span>
              <span className="hero-chip">✦ Ritmo saludable</span>
            </div>
            <div className="hero-amount">{clp(s.safeToday)}</div>
            <p className="hero-note">
              Después de cubrir gastos fijos y metas, puedes gastar esto hoy sin desviarte.
              Te quedan <b>{daysLeft} días</b> en el mes y <b>{clp(s.variableAssigned - s.variableSpent)}</b> de presupuesto variable.
            </p>
            <div className="pace">
              <div className="pace-bar">
                <div className="pace-fill" style={{ width: `${pacePct}%` }} />
                <div className="pace-marker" style={{ left: `${markerPct}%` }}><span>hoy</span></div>
              </div>
              <div className="pace-legend">
                <span>Gastado hoy <b>{clp(spentToday)}</b></span>
                <span>Recomendado <b>{clp(s.safeToday)}</b></span>
              </div>
            </div>
            <div className="quick-actions">
              {([
                ['gasto',  'Agregar gasto',   'red',    <ArrowUp size={16} key="up" />],
                ['ingreso','Agregar ingreso',  'emerald',<ArrowDown size={16} key="dn" />],
                ['mover',  'Mover dinero',    'blue',   <ArrowLeftRight size={16} key="mv" />],
                ['meta',   'Crear meta',      'violet', <Flag size={16} key="fl" />],
              ] as const).map(([type, label, color, icon]) => (
                <button key={type} onClick={() => setModal(type as ModalType)}>
                  <span className={`qa-ic ${color}`}>{icon}</span>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Hero side — gauge */}
          <div className="hero-side">
            <div className="gauge">
              <svg viewBox={`0 0 ${gaugeSize} ${gaugeSize}`}>
                <circle cx={gaugeSize/2} cy={gaugeSize/2} r={gaugeR} fill="none" stroke="var(--hairline)" strokeWidth={gaugeStroke} />
                <circle cx={gaugeSize/2} cy={gaugeSize/2} r={gaugeR} fill="none" stroke="var(--accent)" strokeWidth={gaugeStroke}
                  strokeLinecap="round" strokeDasharray={`${gaugeDash} ${gaugeC - gaugeDash}`}
                  style={{ transform: 'rotate(-90deg)', transformOrigin: 'center', transition: 'stroke-dasharray 1s ease .3s' }} />
              </svg>
              <div className="gauge-c">
                <span className="gauge-pct">{varPct}%</span>
                <span className="gauge-lbl">del variable</span>
              </div>
            </div>
            <div className="hero-side-rows">
              <div><span className="hsr-l">Ingreso del mes</span><span className="hsr-v">{clp(s.income)}</span></div>
              <div><span className="hsr-l">Asignado</span><span className="hsr-v">{clp(s.assignedTotal)}</span></div>
              <div>
                <span className="hsr-l">Libre por asignar</span>
                <span className={`hsr-v ${s.unassigned === 0 ? 'ok' : s.unassigned < 0 ? 'warn' : ''}`}>{clp(s.unassigned)}</span>
              </div>
            </div>
          </div>
        </section>

        {/* ── Stat row ── */}
        {(() => {
          const spentPct = s.assignedTotal > 0 ? s.spentTotal / s.assignedTotal : 0
          const spentTone = s.spentTotal > s.assignedTotal ? 'red' : spentPct > 0.88 ? 'warn' : ''
          const freeUnassigned = s.unassigned
          const freeTone = freeUnassigned < 0 ? 'red' : freeUnassigned === 0 ? 'ok' : ''
          const invertedFlow = dailyFlow.length > 1 ? dailyFlow.map((_, i, a) => a[a.length - 1] - a[i]) : []
          const savingsFlat = dailyFlow.length > 0 ? dailyFlow.map(() => s.savings) : []
          return (
        <div className="stat-row">
          {[
            { label: 'Saldo disponible',  value: s.available,   spark: invertedFlow,  sparkColor: 'var(--ok)' },
            { label: 'Gastos del mes',    value: s.spentTotal,  spark: dailyFlow,      sparkColor: 'var(--warn)', tone: spentTone },
            { label: 'Ahorro acumulado',  value: s.savings,     spark: savingsFlat,    sparkColor: 'var(--c-violet)', tone: s.savings > 0 ? 'ok' : '' },
            { label: 'Libre por asignar', value: s.unassigned,  spark: [] as number[], sparkColor: 'var(--c-blue)', tone: freeTone },
          ].map(({ label, value, spark, sparkColor, tone }) => (
            <div key={label} className="card stat">
              <div className="stat-top">
                <span className="stat-label">{label}</span>
              </div>
              <div className={`stat-value${tone ? ' ' + tone : ''}`}>{clp(value)}</div>
              {spark && spark.length > 0 && (
                <div className="stat-spark">
                  <Spark data={spark} color={sparkColor} />
                </div>
              )}
            </div>
          ))}
        </div>
          )
        })()}

        {/* ── 2-col: (flujo + presupuesto) | lateral ── */}
        <div className="grid-2col">

          {/* Columna izquierda */}
          <div className="col-main">
            <FlowCard dailyFlow={dailyFlow} totalDays={totalDays} s={s} months={months} />

            {/* Presupuesto por categorías */}
            <div className="card budget">
              <div className="card-head">
                <div>
                  <h3 className="card-title">Presupuesto por categorías</h3>
                  <p className="card-sub">Asignado <b>{clp(s.assignedTotal)}</b> · Gastado <b>{clp(s.spentTotal)}</b></p>
                </div>
                <div className="tabs sm">
                  {(['Todas', 'Fijos', 'Variables'] as const).map(f => (
                    <button key={f} className={catFilter === f ? 'on' : ''} onClick={() => setCatFilter(f)}>{f}</button>
                  ))}
                </div>
              </div>
              <div className="budget-list">
                {filteredCats.map(cat => {
                  const avail = cat.assigned - cat.spent
                  const over  = avail < 0
                  const near  = !over && cat.assigned > 0 && (cat.spent / cat.assigned) > 0.88
                  const state = over ? 'red' : near ? 'amber' : 'ok'
                  const isOpen = expandedCat === cat.id
                  const catTxs = transactions.filter(t => t.category_id === cat.id)
                  return (
                    <div className={`brow${isOpen ? ' open' : ''}`} key={cat.id}>
                      <button className="brow-main" onClick={() => setExpandedCat(isOpen ? null : cat.id)}>
                        <span className={`cat-ic c-${cat.color}`}>{catEmoji(cat.icon)}</span>
                        <span className="brow-name">
                          {cat.name}
                          {cat.fixed && <span className="brow-tag">Fijo</span>}
                        </span>
                        <span className="brow-mid">
                          <div className="progress" style={{ height: 5 }}>
                            <div className="progress-fill" style={{ width: `${Math.min(100, cat.assigned > 0 ? (cat.spent/cat.assigned)*100 : 0)}%`, background: state === 'red' ? 'var(--danger)' : state === 'amber' ? 'var(--warn)' : 'var(--ok)', height: '100%' }} />
                          </div>
                          <span className="brow-nums">{clp(cat.spent)} <i>de {clp(cat.assigned)}</i></span>
                        </span>
                        <span className={`brow-avail ${state}`}>
                          {over ? <><TrendingDown size={13} />{clp(avail)}</> : clp(avail)}
                          <i>{over ? 'excedido' : 'disponible'}</i>
                        </span>
                        <span className={`brow-chev${isOpen ? ' rot' : ''}`}>▾</span>
                      </button>
                      {isOpen && (
                        <div className="brow-detail">
                          <div className="detail-txns">
                            {catTxs.length ? catTxs.slice(0, 4).map(t => (
                              <div className="dtx" key={t.id}>
                                <span className="dtx-name">{t.name}</span>
                                <span className="dtx-date">{t.date}</span>
                                <span className="dtx-amt">{clp(Math.abs(t.amount))}</span>
                              </div>
                            )) : <span className="dtx-empty">Sin movimientos este mes</span>}
                          </div>
                          {over && (
                            <div className="detail-actions">
                              <span className="detail-alert">⚠ Esta categoría superó su límite por {clp(Math.abs(avail))}</span>
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

          {/* Columna lateral */}
          <div className="col-side">
            {donutSegs.length > 0 && (
              <div className="card donut-card">
                <div className="card-head">
                  <div><h3 className="card-title">Gasto por categoría</h3></div>
                </div>
                <div className="donut-body">
                  <div className="donut-wrap">
                    <svg viewBox={`0 0 ${DC*2} ${DC*2}`} className="donut">
                      <circle cx={DC} cy={DC} r={DR} fill="none" stroke="var(--hairline)" strokeWidth={10} />
                      {donutSegs.map((seg, i) => {
                        const pct = seg.spent / donutTotal
                        const dash = pct * donutC
                        const rot = (donutOffset * 360) - 90
                        donutOffset += pct
                        return (
                          <circle key={i} cx={DC} cy={DC} r={DR} fill="none"
                            stroke={COLOR_HEX[seg.color] || '#34c98a'} strokeWidth={10}
                            strokeLinecap="round"
                            strokeDasharray={`${dash} ${donutC - dash}`}
                            style={{ transform: `rotate(${rot}deg)`, transformOrigin: 'center' }} />
                        )
                      })}
                    </svg>
                    <div className="donut-center">
                      <span className="donut-top">{clpShort(donutTotal)}</span>
                      <span className="donut-bottom">gastado</span>
                    </div>
                  </div>
                  <div className="donut-legend">
                    {donutSegs.map((seg, i) => (
                      <div key={i} className="dl">
                        <span className={`dot c-${seg.color}`} />
                        <span className="dl-name">{seg.name}</span>
                        <span className="dl-val">{Math.round((seg.spent / donutTotal) * 100)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {upcoming.length > 0 && (
              <div className="card upcoming">
                <div className="card-head">
                  <div>
                    <h3 className="card-title">Próximos vencimientos</h3>
                    <p className="card-sub">{upcoming.length} pagos próximos</p>
                  </div>
                </div>
                <div className="up-list">
                  {upcoming.map(u => {
                    const daysUntil = Math.ceil((new Date(u.due_date).getTime() - Date.now()) / 86400000)
                    return (
                      <div key={u.id} className="up-row">
                        <span className={`up-day${daysUntil <= 1 ? ' soon' : ''}`}>
                          {daysUntil <= 0 ? 'hoy' : daysUntil === 1 ? 'mañana' : `en ${daysUntil} días`}
                        </span>
                        <span className="up-name">{u.name}<i>{(u as any).accounts?.name || ''}</i></span>
                        <span className="up-amt">{clp(u.amount)}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {goals.length > 0 && (
              <div className="card goals">
                <div className="card-head">
                  <div><h3 className="card-title">Metas</h3></div>
                </div>
                <div className="goal-list">
                  {goals.map(g => {
                    const pct = g.target > 0 ? Math.round((g.current / g.target) * 100) : 0
                    const color = COLOR_HEX[g.color] || '#34c98a'
                    const r = 18, c = 2 * Math.PI * r
                    const dash = (pct / 100) * c
                    return (
                      <div key={g.id} className="goal">
                        <div className="goal-top">
                          <span className={`goal-dot c-${g.color}`} />
                          <span className="goal-name">{g.name}</span>
                          <span className="goal-pct">{pct}%</span>
                        </div>
                        <div className="progress" style={{ height: 6 }}>
                          <div className="progress-fill" style={{ width: `${Math.min(100, pct)}%`, background: color, height: '100%' }} />
                        </div>
                        <div className="goal-bot">
                          <span>{clp(g.current)} <i>de {clp(g.target)}</i></span>
                          {g.due && <span className="goal-due">{g.due}</span>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Modales */}
      {(modal === 'gasto' || modal === 'ingreso' || modal === 'mover') && (
        <TransactionModal type={modal} profileId={activeProfile.id} categories={categories} accounts={accounts} onClose={() => setModal(null)} onSaved={load} />
      )}
      {modal === 'meta' && (
        <GoalModal profileId={activeProfile.id} onClose={() => setModal(null)} onSaved={load} />
      )}
    </>
  )
}

function FlowCard({ dailyFlow, totalDays, s, months }: {
  dailyFlow: number[]; totalDays: number
  s: ReturnType<typeof import('@/lib/utils').computeSummary>
  months: MonthlyBar[]
}) {
  const [tab, setTab] = useState<'mes' | '6m'>('mes')
  const diff = s.variableAssigned - s.variableSpent

  return (
    <div className="card flow">
      <div className="card-head">
        <div>
          <h3 className="card-title">{tab === 'mes' ? 'Flujo del mes' : 'Ingresos vs gastos'}</h3>
          <p className="card-sub">
            {tab === 'mes'
              ? diff >= 0
                ? <><b className="ok">{clp(diff)} bajo</b> tu ritmo ideal</>
                : <><b className="warn">{clp(Math.abs(diff))} sobre</b> tu ritmo ideal</>
              : <>Evolución de los últimos 6 meses</>}
          </p>
        </div>
        <div className="tabs">
          <button className={tab === 'mes' ? 'on' : ''} onClick={() => setTab('mes')}>Este mes</button>
          <button className={tab === '6m' ? 'on' : ''} onClick={() => setTab('6m')}>6 meses</button>
        </div>
      </div>
      {tab === 'mes' ? (
        <>
          <AreaTrend flow={dailyFlow} totalDays={totalDays} max={s.variableAssigned} />
          <div className="flow-legend">
            <span><i className="sw sw-accent" />Gasto real</span>
            <span><i className="sw sw-dash" />Ritmo ideal</span>
          </div>
        </>
      ) : (
        <>
          <BarPairs data={months} />
          <div className="flow-legend">
            <span><i className="sw sw-income" />Ingresos</span>
            <span><i className="sw sw-expense" />Gastos</span>
          </div>
        </>
      )}
    </div>
  )
}

function Spark({ data, color = 'var(--accent)' }: { data: number[]; color?: string }) {
  if (!data.length) return null
  const max = Math.max(...data, 1)
  const min = Math.min(...data, 0)
  const range = max - min || 1
  const h = 30, w = 80
  const pts = data.map((v, i) => `${(i / Math.max(data.length - 1, 1)) * w},${h - ((v - min) / range) * (h - 4) - 2}`).join(' ')
  const gradId = `sg_${color.replace(/[^a-z0-9]/gi, '')}`
  return (
    <svg width={w} height={h} style={{ width: '100%', height: '100%', display: 'block' }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity=".25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${pts} ${w},${h}`} fill={`url(#${gradId})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function AreaTrend({ flow, totalDays, max }: { flow: number[]; totalDays: number; max: number }) {
  const h = 120, w = 500
  if (!flow.length) return <div style={{ height: h }} />
  const safeMax = Math.max(max, ...flow, 1)
  const py = (v: number) => h - (v / safeMax) * (h - 8) - 4
  const px = (i: number, len: number) => (i / Math.max(len - 1, 1)) * w

  const area = flow.map((v, i) => `${px(i, flow.length)},${py(v)}`).join(' ')
  const pace = Array.from({ length: flow.length }, (_, i) => `${px(i, flow.length)},${py((i / totalDays) * max)}`).join(' ')

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: h }} preserveAspectRatio="none">
      <defs>
        <linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity=".22" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${area} ${w},${h}`} fill="url(#ag)" />
      <polyline points={area} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points={pace} fill="none" stroke="var(--text-faint)" strokeWidth="1.5" strokeDasharray="5,4" strokeLinecap="round" />
    </svg>
  )
}
