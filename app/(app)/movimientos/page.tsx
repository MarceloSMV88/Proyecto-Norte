'use client'
import { useEffect, useState, useCallback } from 'react'
import { Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useProfiles } from '@/contexts/ProfileContext'
import { useToast } from '@/components/ui/Toast'
import Topbar from '@/components/layout/Topbar'
import TransactionModal from '@/components/modals/TransactionModal'
import DatePicker from '@/components/ui/DatePicker'
import { clp, formatDate, getCurrentMonth } from '@/lib/utils'
import { catEmoji } from '@/lib/icons'
import type { Transaction, Category, Account } from '@/lib/types'

type TxFilter = 'Todos' | 'Gastos' | 'Ingresos'

function nextMonthStr(month: string): string {
  const d = new Date(month + 'T12:00:00')
  d.setMonth(d.getMonth() + 1)
  return d.toISOString().slice(0, 7) + '-01'
}

export default function MovimientosPage() {
  const { activeProfile } = useProfiles()
  const supabase = createClient()
  const { showToast } = useToast()
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth())
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [filter, setFilter] = useState<TxFilter>('Todos')
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [modal, setModal] = useState<'gasto' | 'ingreso' | null>(null)
  const [editingCat, setEditingCat] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!activeProfile) return
    // La ventana de la consulta la define el rango de fechas si está activo; si no, el mes del selector.
    // (Antes solo consultaba el mes → un movimiento con fecha de otro mes no aparecía aunque estuviera en la BD.)
    let q = supabase.from('transactions').select('*, categories(name,icon,color), accounts(name)')
      .eq('profile_id', activeProfile.id)
    if (dateFrom || dateTo) {
      if (dateFrom) q = q.gte('date', dateFrom)
      if (dateTo) q = q.lte('date', dateTo)
    } else {
      q = q.gte('date', selectedMonth).lt('date', nextMonthStr(selectedMonth))
    }
    const [txs, cats, accs] = await Promise.all([
      q.order('date', { ascending: false }).order('created_at', { ascending: false }).limit(300),
      supabase.from('categories').select('*').eq('profile_id', activeProfile.id),
      supabase.from('accounts').select('*').eq('profile_id', activeProfile.id),
    ])
    setTransactions((txs.data || []) as Transaction[])
    setCategories((cats.data || []) as Category[])
    setAccounts((accs.data || []) as Account[])
  }, [activeProfile, supabase, selectedMonth, dateFrom, dateTo])

  useEffect(() => { load() }, [load])

  if (!activeProfile) return null

  // Categorizar un movimiento que no viene de un compromiso (ej: resto de una transferencia
  // grande, un gasto que ninguna category_rule matcheó). sync_category_spent (trigger de BD)
  // toma cualquier transaction con category_id: no hace falta tocar el presupuesto a mano.
  async function setTxCategory(txId: string, categoryId: string) {
    setEditingCat(null)
    const { error } = await supabase.from('transactions').update({ category_id: categoryId || null }).eq('id', txId)
    if (error) { showToast('No se pudo categorizar'); return }
    load()
  }

  // Las categorías tienen una fila por mes: al categorizar hay que ofrecer las del MISMO
  // mes del movimiento (no las de selectedMonth, que puede diferir si hay un rango de fechas activo).
  function gastoCategoriesFor(dateStr: string) {
    const month = dateStr.slice(0, 7) + '-01'
    return categories.filter(c => c.month === month && c.group_name !== 'Ahorro')
  }

  const filtered = transactions.filter(tx => {
    if (filter === 'Gastos' && tx.type !== 'gasto') return false
    if (filter === 'Ingresos' && tx.type !== 'ingreso') return false
    const d = tx.date.slice(0, 10)
    if (dateFrom && d < dateFrom) return false
    if (dateTo && d > dateTo) return false
    if (search && !tx.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  // Solo ingresos reales: las patas + de una transferencia interna no son ingreso
  const income = filtered.filter(t => t.type === 'ingreso' && t.amount > 0).reduce((s, t) => s + t.amount, 0)
  const expense = filtered.filter(t => t.amount < 0 && t.type === 'gasto').reduce((s, t) => s + Math.abs(t.amount), 0)

  // Group by date
  const grouped: Record<string, Transaction[]> = {}
  for (const tx of filtered) {
    const d = tx.date
    if (!grouped[d]) grouped[d] = []
    grouped[d].push(tx)
  }

  return (
    <div>
      <Topbar
        title="Movimientos"
        month={selectedMonth}
        onMonthChange={m => { setSelectedMonth(m); setFilter('Todos'); setSearch(''); setDateFrom(''); setDateTo('') }}
        action={{
          label: 'Agregar',
          onClick: () => setModal('gasto'),
          menu: [
            { label: 'Agregar gasto', onClick: () => setModal('gasto') },
            { label: 'Agregar ingreso', onClick: () => setModal('ingreso') },
          ],
        }}
      />

      <div className="scroll">

        {/* Stats */}
        <div className="stats-3" style={{ maxWidth: 1152, margin: '0 auto' }}>
          {[['Ingresos', income, 'var(--ok)'], ['Gastos', expense, 'var(--warn)'], ['Balance', income - expense, income - expense >= 0 ? 'var(--ok)' : 'var(--danger)']].map(([l, v, c]) => (
            <div key={l as string} className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-ui)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6 }}>{l as string}</div>
              <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-ui)', color: c as string }}>{clp(v as number)}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', width: '100%', maxWidth: 1152, margin: '0 auto' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)', zIndex: 1 }} />
            <input
              className="text-input"
              type="text" placeholder="Buscar movimiento…" value={search} onChange={e => setSearch(e.target.value)}
              style={{ paddingLeft: 34 }}
            />
          </div>
          <div style={{ width: 210 }}>
            <DatePicker range from={dateFrom} to={dateTo} onRangeChange={(f, t) => { setDateFrom(f); setDateTo(t) }} placeholder="Rango de fechas" clearable dropUp={false} />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['Todos', 'Gastos', 'Ingresos'] as TxFilter[]).map(f => (
              <button key={f} onClick={() => setFilter(f)} className={`chip${filter === f ? ' on' : ''}`}>{f}</button>
            ))}
          </div>
        </div>

        {/* Transaction list */}
        <div className="card" style={{ padding: 0, overflow: 'hidden', width: '100%', maxWidth: 1152, margin: '0 auto' }}>
          {Object.entries(grouped).length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-faint)', fontSize: 14 }}>
              Sin movimientos para mostrar
            </div>
          )}
          {Object.entries(grouped).map(([date, txs]) => {
            const dayTotal = txs.filter(t => t.amount < 0 && t.type === 'gasto').reduce((s, t) => s + Math.abs(t.amount), 0)
            return (
              <div key={date}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 20px 6px', background: 'var(--surface-2)', borderBottom: '1px solid var(--hairline)' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-ui)' }}>{formatDate(date)}</span>
                  {dayTotal > 0 && <span style={{ fontSize: 12, color: 'var(--text-2)', fontFamily: 'var(--font-ui)' }}>−{clp(dayTotal)}</span>}
                </div>
                {txs.map((tx, i) => {
                  const isIncome = tx.amount > 0
                  return (
                    <div key={tx.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', borderBottom: i < txs.length - 1 ? '1px solid var(--hairline)' : 'none', transition: 'background .15s', cursor: 'default' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <div style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>
                        {tx.categories?.icon ? catEmoji(tx.categories.icon) : isIncome ? '💰' : tx.type === 'transfer' ? '↔️' : '💳'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--font-ui)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.name}</span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-faint)', display: 'flex', gap: 8, alignItems: 'center' }}>
                          {tx.type === 'gasto' ? (
                            editingCat === tx.id ? (
                              <select
                                autoFocus
                                className="role-select"
                                value={tx.category_id || ''}
                                onChange={e => setTxCategory(tx.id, e.target.value)}
                                onBlur={() => setEditingCat(null)}
                                style={{ maxWidth: 170 }}
                              >
                                <option value="">Sin categoría</option>
                                {gastoCategoriesFor(tx.date).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                              </select>
                            ) : (
                              <button
                                onClick={() => setEditingCat(tx.id)}
                                title="Categorizar este movimiento"
                                className="chip xs"
                                style={tx.categories?.name ? undefined : { color: 'var(--warn)', borderColor: 'color-mix(in oklab, var(--warn) 40%, var(--border))' }}
                              >
                                {tx.categories?.name || 'Categorizar'}
                              </button>
                            )
                          ) : (
                            tx.categories?.name && <span>{tx.categories.name}</span>
                          )}
                          {tx.accounts?.name && <span>· {tx.accounts.name}</span>}
                        </div>
                      </div>
                      <span style={{ fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-ui)', color: isIncome ? 'var(--ok)' : 'var(--text)', flexShrink: 0 }}>
                        {isIncome ? '+' : '−'}{clp(Math.abs(tx.amount))}
                      </span>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>

      {modal && (
        <TransactionModal
          type={modal}
          profileId={activeProfile.id}
          categories={categories}
          accounts={accounts}
          onClose={() => setModal(null)}
          onSaved={savedDate => {
            // Si el movimiento cae en otro mes (y no hay rango activo), saltar a ese mes para verlo
            if (savedDate && !dateFrom && !dateTo) {
              const m = savedDate.slice(0, 7) + '-01'
              if (m !== selectedMonth) { setSelectedMonth(m); return }
            }
            load()
          }}
        />
      )}
    </div>
  )
}
