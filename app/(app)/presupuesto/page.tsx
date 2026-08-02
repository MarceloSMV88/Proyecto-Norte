'use client'
import { useEffect, useState, useCallback } from 'react'
import { Plus, Pencil, ChevronDown, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useProfiles } from '@/contexts/ProfileContext'
import Topbar from '@/components/layout/Topbar'
import CategoryModal from '@/components/modals/CategoryModal'
import { clp, computeSummary, flattenCategoryBudgets, formatDate, getCurrentMonth } from '@/lib/utils'
import { catEmoji } from '@/lib/icons'
import type { CategoryWithBudget, CategoryBudgetJoinRow, Account, CategoryGroup, Transaction } from '@/lib/types'

const GROUPS: CategoryGroup[] = ['Fijos', 'Variables', 'Ahorro']

function nextMonthStr(month: string): string {
  const d = new Date(month + 'T12:00:00')
  d.setMonth(d.getMonth() + 1)
  return d.toISOString().slice(0, 7) + '-01'
}

export default function PresupuestoPage() {
  const { activeProfile } = useProfiles()
  const supabase = createClient()
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth())
  const [categories, setCategories] = useState<CategoryWithBudget[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [editing, setEditing] = useState<string | null>(null)
  const [editVal, setEditVal] = useState('')
  const [modalCat, setModalCat] = useState<CategoryWithBudget | null>(null)
  const [addGroup, setAddGroup] = useState<CategoryGroup | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    if (!activeProfile) return
    await supabase.rpc('ensure_month_budgets', { p_profile_id: activeProfile.id, p_month: selectedMonth })
    const nextMonth = nextMonthStr(selectedMonth)
    const [budgets, accs, txs] = await Promise.all([
      supabase.from('category_budgets').select('id, assigned, spent, categories!inner(id, profile_id, name, icon, color, group_name, fixed, active, created_at)')
        .eq('categories.profile_id', activeProfile.id).eq('month', selectedMonth),
      supabase.from('accounts').select('*').eq('profile_id', activeProfile.id),
      // Igual criterio que sync_category_spent: gastos + la pata positiva (destino) de
      // transferencias categorizadas (ej. aportes a ahorro entre 2 cuentas propias).
      supabase.from('transactions').select('*, accounts(name)')
        .eq('profile_id', activeProfile.id)
        .or('type.eq.gasto,and(type.eq.transfer,amount.gt.0)')
        .gte('date', selectedMonth).lt('date', nextMonth)
        .order('date', { ascending: false }),
    ])
    setCategories(flattenCategoryBudgets((budgets.data || []) as unknown as CategoryBudgetJoinRow[]).sort((a, b) => a.name.localeCompare(b.name)))
    setAccounts((accs.data || []) as Account[])
    setTransactions((txs.data || []) as Transaction[])
  }, [activeProfile, supabase, selectedMonth])

  useEffect(() => { load() }, [load])
  useEffect(() => { setExpanded(new Set()) }, [selectedMonth])

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  if (!activeProfile) return null
  const summary = computeSummary(categories, accounts, activeProfile.income)
  // Dinero realmente disponible para asignar = saldo en cuentas corrientes (tipo Cuenta).
  // El ahorro está reservado para metas y las TC son deuda: ninguno entra al presupuesto.
  const fundsAvailable = summary.available
  const unassigned = fundsAvailable - summary.assignedTotal

  async function commitAssigned(id: string, val: string) {
    setEditing(null)
    const n = parseInt(val.replace(/\D/g, ''))
    if (isNaN(n)) return
    await supabase.from('category_budgets').update({ assigned: n }).eq('category_id', id).eq('month', selectedMonth)
    load()
  }

  // Abre la edición de una categoría; si había otra en edición, la guarda primero
  function startEdit(cat: CategoryWithBudget) {
    if (editing && editing !== cat.id) {
      void commitAssigned(editing, editVal)
    }
    setEditing(cat.id)
    setEditVal(String(cat.assigned))
  }

  return (
    <div>
      <Topbar title="Presupuesto" month={selectedMonth} onMonthChange={setSelectedMonth} action={{ label: 'Agregar categoría', onClick: () => setAddGroup('Variables') }} />

      <div className="scroll">

        {/* Banner listo para asignar + gráficos */}
        <div className="card assign-banner">
          {/* Listo para asignar */}
          <div className="assign-left">
            <div style={{ fontSize: 12, color: 'var(--text-faint)', fontFamily: 'var(--font-ui)', marginBottom: 4 }}>
              {unassigned === 0 ? '✓ Todo asignado' : unassigned > 0 ? 'Listo para asignar' : 'Asignado de más'}
            </div>
            <div style={{ fontSize: 40, fontWeight: 700, fontFamily: 'var(--font-ui)', letterSpacing: '-1.8px', color: unassigned < 0 ? 'var(--danger)' : unassigned === 0 ? 'var(--ok)' : 'var(--text)' }}>
              {clp(unassigned)}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 6 }}>
              En cuentas {clp(fundsAvailable)} · Asignado {clp(summary.assignedTotal)}
            </div>
          </div>

          {/* Donut: asignación por sección */}
          <SectionDonut categories={categories} />

          {/* Barras: dónde gastas más */}
          <TopSpendBars categories={categories} />
        </div>

        {/* Mini stats */}
        {(() => {
          const spentPct = summary.assignedTotal > 0 ? summary.spentTotal / summary.assignedTotal : 0
          const dispTotal = summary.assignedTotal - summary.spentTotal
          const spentColor = summary.spentTotal > summary.assignedTotal ? 'var(--danger)' : spentPct > 0.88 ? 'var(--warn)' : 'var(--text)'
          const dispColor  = dispTotal < 0 ? 'var(--danger)' : spentPct > 0.88 ? 'var(--warn)' : 'var(--ok)'
          // Asignado vs fondos en cuentas: rojo si asignaste más de lo que tienes, verde si calza exacto, neutro si aún queda por asignar
          const assignedColor = summary.assignedTotal > fundsAvailable ? 'var(--danger)' : summary.assignedTotal === fundsAvailable && fundsAvailable > 0 ? 'var(--ok)' : 'var(--text-2)'
          return (
        <div className="stats-4">
          {[
            ['En cuentas', fundsAvailable, 'var(--text)'],
            ['Asignado', summary.assignedTotal, assignedColor],
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
          const cats = categories
            .filter(c => c.group_name === group)
            .sort((a, b) => b.assigned - a.assigned)
          const subtotalAssigned = cats.reduce((s, c) => s + c.assigned, 0)
          const subtotalSpent = cats.reduce((s, c) => s + c.spent, 0)

          return (
            <div key={group} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 14, paddingBottom: 12, borderBottom: '1px solid var(--hairline)' }}>
                <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 14 }}>{group}</span>
                <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', fontSize: 12, color: 'var(--text-faint)', fontFamily: 'var(--font-ui)' }}>
                  <span>Asignado {clp(subtotalAssigned)}</span>
                  <span>Gastado {clp(subtotalSpent)}</span>
                  <span style={{ color: subtotalAssigned - subtotalSpent < 0 ? 'var(--danger)' : subtotalAssigned > 0 && subtotalSpent / subtotalAssigned > 0.88 ? 'var(--warn)' : 'var(--ok)' }}>
                    Disp. {clp(subtotalAssigned - subtotalSpent)}
                  </span>
                  <button
                    onClick={() => setAddGroup(group)}
                    title={`Agregar categoría en ${group}`}
                    className="icon-btn ghost"
                    style={{ width: 30, height: 30 }}
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>

              {cats.length === 0 ? (
                <div style={{ padding: '18px 8px', fontSize: 13, color: 'var(--text-faint)' }}>
                  Sin categorías en esta sección.{' '}
                  <button onClick={() => setAddGroup(group)} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontWeight: 600, fontFamily: 'var(--font-body)', fontSize: 13 }}>Agregar una</button>
                </div>
              ) : (
                <>
              {/* Header row */}
              <div className="bcat-grid" style={{ padding: '0 8px 8px', borderBottom: '1px solid var(--hairline)' }}>
                {['Categoría', 'Asignado', '', 'Gastado / Disponible', 'Disponible', ''].map((h, i) => (
                  <span key={i} className={i === 2 ? 'bcat-sp' : i === 3 ? 'bcat-prog' : undefined} style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-ui)', textTransform: 'uppercase', letterSpacing: '.4px', textAlign: (i === 1 || i === 4) ? 'right' : 'left' }}>{h}</span>
                ))}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4 }}>
                {cats.map(cat => {
                  const pct = cat.assigned > 0 ? cat.spent / cat.assigned : 0
                  const status = pct > 1 ? 'var(--danger)' : pct > 0.88 ? 'var(--warn)' : 'var(--ok)'
                  const disp = cat.assigned - cat.spent
                  const isOpen = expanded.has(cat.id)
                  const catTxs = transactions.filter(t => t.category_id === cat.id)

                  return (
                  <div key={cat.id}>
                    <div className="bcat-row bcat-grid" style={{ padding: '10px 8px', borderRadius: 10, transition: 'background .15s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <button onClick={() => toggleExpand(cat.id)} title="Ver movimientos de esta categoría"
                        style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left', minWidth: 0 }}>
                        {cat.spent > 0 ? (isOpen ? <ChevronDown size={14} color="var(--text-faint)" /> : <ChevronRight size={14} color="var(--text-faint)" />) : <span style={{ width: 14 }} />}
                        <span style={{ fontSize: 16 }}>{catEmoji(cat.icon)}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                          <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--font-ui)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat.name}</span>
                          {cat.fixed && <span style={{ fontSize: 10, color: 'var(--text-faint)', background: 'var(--surface-3)', padding: '1px 5px', borderRadius: 999, flexShrink: 0 }}>Fijo</span>}
                        </div>
                      </button>

                      {/* Editable assigned */}
                      {editing === cat.id ? (
                        <input
                          className="text-input"
                          type="text" inputMode="numeric" autoFocus
                          value={editVal ? parseInt(editVal).toLocaleString('es-CL') : ''}
                          onChange={e => setEditVal(e.target.value.replace(/[^0-9]/g, ''))}
                          onBlur={() => commitAssigned(cat.id, editVal)}
                          onKeyDown={e => { if (e.key === 'Enter') commitAssigned(cat.id, editVal); if (e.key === 'Escape') setEditing(null) }}
                          style={{ padding: '6px 10px', fontSize: 13, fontFamily: 'var(--font-ui)', textAlign: 'right' }}
                        />
                      ) : (
                        <button onMouseDown={e => { e.preventDefault(); startEdit(cat) }}
                          title="Editar monto rápido"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-ui)', fontWeight: 500, color: 'var(--text)', textAlign: 'right', width: '100%', padding: '5px 10px', borderRadius: 8, transition: 'background .15s' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-3)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          {clp(cat.assigned)}
                        </button>
                      )}

                      <span className="bcat-sp" />

                      <div className="bcat-prog">
                        <div className="progress-track" style={{ marginBottom: 3 }}>
                          <div className="progress-fill" style={{ transform: `scaleX(${Math.min(1, pct)})`, background: status }} />
                        </div>
                        <div style={{ fontSize: 11, color: status }}>{clp(cat.spent)}</div>
                      </div>

                      <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-ui)', color: status, textAlign: 'right' }}>
                        {clp(disp)}
                      </span>

                      <button
                        onClick={() => setModalCat(cat)}
                        title="Editar categoría"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 4, borderRadius: 8, transition: 'color .15s' }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-faint)')}
                      >
                        <Pencil size={14} />
                      </button>
                    </div>

                    {isOpen && (
                      <div style={{ margin: '2px 8px 8px 38px', padding: '4px 0', borderLeft: '2px solid var(--hairline)', paddingLeft: 14 }}>
                        {catTxs.length === 0 ? (
                          <div style={{ fontSize: 12, color: 'var(--text-faint)', padding: '6px 0' }}>Sin movimientos este mes.</div>
                        ) : catTxs.map(tx => (
                          <div key={tx.id} className="bcat-tx-row">
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.name}</div>
                              <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                                {formatDate(tx.date)}{tx.accounts?.name && <> · {tx.accounts.name}</>}
                              </div>
                            </div>
                            <span className="bcat-tx-amount">{clp(Math.abs(tx.amount))}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  )
                })}
              </div>

              {/* Subtotal de la sección */}
              <div className="bcat-grid" style={{ padding: '12px 8px 2px', marginTop: 4, borderTop: '1px solid var(--hairline)' }}>
                <span style={{ fontSize: 11.5, color: 'var(--text-faint)', fontFamily: 'var(--font-ui)', textTransform: 'uppercase', letterSpacing: '.4px' }}>
                  Subtotal · {cats.length} {cats.length === 1 ? 'categoría' : 'categorías'}
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-ui)', color: 'var(--text)', textAlign: 'right', paddingRight: 10 }}>{clp(subtotalAssigned)}</span>
                <span className="bcat-sp" />
                <span className="bcat-prog" style={{ fontSize: 12, color: 'var(--text-2)', fontFamily: 'var(--font-ui)' }}>{clp(subtotalSpent)} gastado</span>
                <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-ui)', color: subtotalAssigned - subtotalSpent < 0 ? 'var(--danger)' : 'var(--ok)', textAlign: 'right' }}>
                  {clp(subtotalAssigned - subtotalSpent)}
                </span>
                <span />
              </div>
                </>
              )}
            </div>
          )
        })}
      </div>

      {/* Modales crear / editar categoría */}
      {addGroup && (
        <CategoryModal
          profileId={activeProfile.id}
          month={selectedMonth}
          defaultGroup={addGroup}
          onClose={() => setAddGroup(null)}
          onSaved={load}
        />
      )}
      {modalCat && (
        <CategoryModal
          profileId={activeProfile.id}
          month={selectedMonth}
          category={modalCat}
          budget={{ id: modalCat.budget_id, category_id: modalCat.id, month: selectedMonth, assigned: modalCat.assigned, spent: modalCat.spent }}
          onClose={() => setModalCat(null)}
          onSaved={load}
        />
      )}
    </div>
  )
}

const COLOR_HEX: Record<string, string> = {
  emerald: '#34c98a', blue: '#4f93f5', violet: '#9b8cf0', amber: '#e6b25a', red: '#ef7a63', slate: '#7c8893',
}

const SECTION_COLOR: Record<string, string> = {
  Fijos: '#4f93f5', Variables: '#34c98a', Ahorro: '#9b8cf0',
}

// Donut de asignación por sección (Fijos / Variables / Ahorro)
function SectionDonut({ categories }: { categories: CategoryWithBudget[] }) {
  const sections = (['Fijos', 'Variables', 'Ahorro'] as const).map(g => ({
    name: g,
    value: categories.filter(c => c.group_name === g).reduce((s, c) => s + c.assigned, 0),
    color: SECTION_COLOR[g],
  })).filter(s => s.value > 0)

  const total = sections.reduce((s, x) => s + x.value, 0)
  const R = 54, C = 64, stroke = 13
  const circ = 2 * Math.PI * R
  let offset = 0

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18, minWidth: 0 }}>
      <div style={{ position: 'relative', width: 128, height: 128, flexShrink: 0 }}>
        <svg viewBox={`0 0 ${C * 2} ${C * 2}`} style={{ width: '100%', height: '100%' }}>
          <circle cx={C} cy={C} r={R} fill="none" stroke="var(--hairline)" strokeWidth={stroke} />
          {total > 0 && sections.map((seg, i) => {
            const frac = seg.value / total
            const dash = frac * circ
            const rot = offset * 360 - 90
            offset += frac
            return (
              <circle key={i} cx={C} cy={C} r={R} fill="none" stroke={seg.color} strokeWidth={stroke}
                strokeDasharray={`${dash} ${circ - dash}`}
                style={{ transform: `rotate(${rot}deg)`, transformOrigin: 'center' }} />
            )
          })}
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeContent: 'center', textAlign: 'center' }}>
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--text-faint)' }}>Asignado</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', marginBottom: 2 }}>Asignación por sección</div>
        {sections.length === 0 && <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>Sin asignaciones</span>}
        {sections.map(seg => (
          <div key={seg.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: seg.color, flexShrink: 0 }} />
            <span style={{ color: 'var(--text-2)', flex: 1 }}>{seg.name}</span>
            <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, color: 'var(--text)' }}>{Math.round((seg.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Barras horizontales: categorías que más gastan (top 5)
function TopSpendBars({ categories }: { categories: CategoryWithBudget[] }) {
  const top = [...categories].filter(c => c.spent > 0).sort((a, b) => b.spent - a.spent).slice(0, 5)
  const max = top[0]?.spent || 1

  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', marginBottom: 12 }}>Dónde gastas más</div>
      {top.length === 0 ? (
        <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>Sin gastos este mes</span>
      ) : (
        <div className="hbars">
          {top.map(cat => (
            <div key={cat.id} className="hbar" style={{ gridTemplateColumns: '120px 1fr 78px' }}>
              <div className="hbar-cat" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <span>{catEmoji(cat.icon)}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{cat.name}</span>
              </div>
              <div className="hbar-track">
                <div className="hbar-fill" style={{ transform: `scaleX(${cat.spent / max})`, background: COLOR_HEX[cat.color] || 'var(--accent)' }} />
              </div>
              <div className="hbar-val">{clp(cat.spent)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
