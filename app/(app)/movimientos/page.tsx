'use client'
import { useEffect, useState, useCallback } from 'react'
import { Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useProfiles } from '@/contexts/ProfileContext'
import Topbar from '@/components/layout/Topbar'
import TransactionModal from '@/components/modals/TransactionModal'
import { clp, formatDate } from '@/lib/utils'
import type { Transaction, Category, Account } from '@/lib/types'

type TxFilter = 'Todos' | 'Gastos' | 'Ingresos' | 'Recurrentes'

export default function MovimientosPage() {
  const { activeProfile } = useProfiles()
  const supabase = createClient()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [filter, setFilter] = useState<TxFilter>('Todos')
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState<'gasto' | 'ingreso' | null>(null)

  const load = useCallback(async () => {
    if (!activeProfile) return
    const [txs, cats, accs] = await Promise.all([
      supabase.from('transactions').select('*, categories(name,icon,color), accounts(name)')
        .eq('profile_id', activeProfile.id).order('date', { ascending: false }).order('created_at', { ascending: false }).limit(100),
      supabase.from('categories').select('*').eq('profile_id', activeProfile.id),
      supabase.from('accounts').select('*').eq('profile_id', activeProfile.id),
    ])
    setTransactions((txs.data || []) as Transaction[])
    setCategories((cats.data || []) as Category[])
    setAccounts((accs.data || []) as Account[])
  }, [activeProfile, supabase])

  useEffect(() => { load() }, [load])

  if (!activeProfile) return null

  const filtered = transactions.filter(tx => {
    if (filter === 'Gastos' && tx.type !== 'gasto') return false
    if (filter === 'Ingresos' && tx.type !== 'ingreso') return false
    if (filter === 'Recurrentes' && !tx.recurring) return false
    if (search && !tx.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const income = filtered.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0)
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
      <Topbar title="Movimientos" action={{ label: 'Agregar', onClick: () => setModal('gasto') }} />

      <div className="scroll">

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 'var(--gap)' }}>
          {[['Ingresos', income, 'var(--ok)'], ['Gastos', expense, 'var(--danger)'], ['Balance', income - expense, income - expense >= 0 ? 'var(--ok)' : 'var(--danger)']].map(([l, v, c]) => (
            <div key={l as string} className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-ui)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6 }}>{l as string}</div>
              <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-ui)', color: c as string }}>{clp(v as number)}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)' }} />
            <input
              type="text" placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', padding: '9px 12px 9px 34px', fontSize: 13.5, outline: 'none', borderRadius: 'var(--radius-sm)' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['Todos', 'Gastos', 'Ingresos', 'Recurrentes'] as TxFilter[]).map(f => (
              <button key={f} onClick={() => setFilter(f)} className={`chip${filter === f ? ' active' : ''}`}>{f}</button>
            ))}
          </div>
        </div>

        {/* Transaction list */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
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
                  {dayTotal > 0 && <span style={{ fontSize: 12, color: 'var(--danger)', fontFamily: 'var(--font-ui)' }}>−{clp(dayTotal)}</span>}
                </div>
                {txs.map((tx, i) => {
                  const isIncome = tx.amount > 0
                  return (
                    <div key={tx.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 20px', borderBottom: i < txs.length - 1 ? '1px solid var(--hairline)' : 'none', transition: 'background .15s', cursor: 'default' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
                        {tx.categories?.icon === 'cart' ? '🛒' : tx.categories?.icon === 'car' ? '🚗' : tx.categories?.icon === 'utensils' ? '🍽️' : tx.categories?.icon === 'heart' ? '❤️' : tx.categories?.icon === 'film' ? '🎬' : tx.categories?.icon === 'bag' ? '👜' : tx.categories?.icon === 'zap' ? '⚡' : tx.categories?.icon === 'repeat' ? '🔄' : tx.categories?.icon === 'home' ? '🏠' : tx.categories?.icon === 'target' ? '🎯' : isIncome ? '💰' : tx.type === 'transfer' ? '↔️' : '💳'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--font-ui)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.name}</span>
                          {tx.recurring && <span style={{ fontSize: 10, background: 'var(--surface-3)', color: 'var(--text-faint)', padding: '1px 6px', borderRadius: 999, flexShrink: 0 }}>Recurrente</span>}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-faint)', display: 'flex', gap: 8 }}>
                          {tx.categories?.name && <span>{tx.categories.name}</span>}
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
          onSaved={load}
        />
      )}
    </div>
  )
}
