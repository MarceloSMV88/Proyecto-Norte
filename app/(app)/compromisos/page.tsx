'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ClipboardCheck, CopyPlus, Link2, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useProfiles } from '@/contexts/ProfileContext'
import { useToast } from '@/components/ui/Toast'
import { useEscapeClose } from '@/lib/useEscapeClose'
import Topbar from '@/components/layout/Topbar'
import { catEmoji } from '@/lib/icons'
import { clp, formatDate, getCurrentMonth, todayCL } from '@/lib/utils'
import type { Account, Category, CommitmentStatus, MonthlyCommitment, Transaction } from '@/lib/types'

type CommitmentFilter = 'Todos' | 'Pendientes' | 'Detectados' | 'Pagados'
type CommitmentInsert = {
  profile_id: string
  category_id: string
  account_id: string | null
  name: string
  group_name: string
  expected_amount: number
  due_day: number | null
  payment_method: string | null
  matcher_hint: string | null
  status: CommitmentStatus
  actual_amount: number
  month: string
}

const STATUS_LABEL: Record<CommitmentStatus, string> = {
  pendiente: 'Pendiente',
  detectado: 'Detectado',
  pagado: 'Pagado',
  vencido: 'Vencido',
  omitido: 'No aplica',
}

const STATUS_COLOR: Record<CommitmentStatus, string> = {
  pendiente: 'var(--text-2)',
  detectado: 'var(--warn)',
  pagado: 'var(--ok)',
  vencido: 'var(--danger)',
  omitido: 'var(--text-faint)',
}

function nextMonthStr(month: string): string {
  const d = new Date(month + 'T12:00:00')
  d.setMonth(d.getMonth() + 1)
  return d.toISOString().slice(0, 7) + '-01'
}

function prevMonthStr(month: string): string {
  const d = new Date(month + 'T12:00:00')
  d.setMonth(d.getMonth() - 1)
  return d.toISOString().slice(0, 7) + '-01'
}

function dueDateFor(month: string, day: number | null): string | null {
  if (!day) return null
  const d = new Date(month + 'T12:00:00')
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  return `${month.slice(0, 8)}${String(Math.min(day, last)).padStart(2, '0')}`
}

function normalizeText(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function supabaseErrorMessage(error: unknown): string {
  if (!error) return 'Supabase no entregó detalle del error.'
  if (typeof error === 'string') return error
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'object') {
    const e = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown }
    const parts = [e.message, e.details, e.hint, e.code].filter(Boolean).map(String)
    if (parts.length) return parts.join(' · ')
  }
  return 'No pude leer el detalle del error.'
}

function detectTransaction(commitment: MonthlyCommitment, transactions: Transaction[], claimedTxIds: Set<string>) {
  if (commitment.paid_transaction_id) return null
  const hint = normalizeText(commitment.matcher_hint || commitment.name)
  const hintTokens = hint.split(/\s+/).filter(t => t.length >= 3)

  return transactions.find(tx => {
    // Un movimiento ya confirmado en OTRO compromiso no puede sugerirse de nuevo
    // (ej: Perlita y Mini comparten ruta/hint pero el pago solo cubre a uno).
    if (claimedTxIds.has(tx.id)) return false
    if (tx.type !== 'gasto' || tx.amount >= 0) return false
    if (tx.category_id !== commitment.category_id) return false
    const abs = Math.abs(tx.amount)
    const amountOk = commitment.expected_amount <= 0
      || Math.abs(abs - commitment.expected_amount) <= Math.max(500, commitment.expected_amount * 0.18)
    if (!amountOk) return false
    if (!hintTokens.length) return true
    const txName = normalizeText(`${tx.name} ${tx.description || ''}`)
    // TODAS las palabras del hint deben aparecer (no basta una) — evita que "norte" o
    // "autopista" (comunes a varias rutas/servicios) matcheen el compromiso equivocado.
    return hintTokens.every(token => txName.includes(token))
  })
}

function effectiveStatus(commitment: MonthlyCommitment, detected?: Transaction | null): CommitmentStatus {
  if (commitment.status === 'pagado' || commitment.status === 'omitido') return commitment.status
  if (commitment.paid_transaction_id || commitment.actual_amount > 0) return 'pagado'
  if (detected) return 'detectado'
  const due = dueDateFor(commitment.month, commitment.due_day)
  if (due && commitment.month.slice(0, 7) === todayCL(0).slice(0, 7) && due < todayCL(0)) return 'vencido'
  return 'pendiente'
}

export default function CompromisosPage() {
  const { activeProfile } = useProfiles()
  const supabase = createClient()
  const { showToast } = useToast()
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth())
  const [commitments, setCommitments] = useState<MonthlyCommitment[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [modalCommitment, setModalCommitment] = useState<MonthlyCommitment | 'new' | null>(null)
  const [filter, setFilter] = useState<CommitmentFilter>('Todos')
  const [search, setSearch] = useState('')
  const [tableError, setTableError] = useState<string | null>(null)
  const [copying, setCopying] = useState(false)
  const [editingReal, setEditingReal] = useState<string | null>(null)
  const [realVal, setRealVal] = useState('')

  const load = useCallback(async () => {
    if (!activeProfile) return
    setTableError(null)
    const nextMonth = nextMonthStr(selectedMonth)
    const [cmts, cats, accs, txs] = await Promise.all([
      supabase.from('monthly_commitments')
        .select('*, categories(name,icon,color,group_name,assigned,spent), accounts(name), transactions(name,amount,date)')
        .eq('profile_id', activeProfile.id)
        .eq('month', selectedMonth)
        .order('group_name')
        .order('due_day', { nullsFirst: false })
        .order('name'),
      supabase.from('categories').select('*').eq('profile_id', activeProfile.id).eq('month', selectedMonth).order('group_name').order('name'),
      supabase.from('accounts').select('*').eq('profile_id', activeProfile.id).order('type').order('name'),
      supabase.from('transactions').select('*, categories(name,icon,color), accounts(name)')
        .eq('profile_id', activeProfile.id)
        .gte('date', selectedMonth).lt('date', nextMonth)
        .order('date', { ascending: false }).limit(400),
    ])

    if (cmts.error) {
      setTableError(cmts.error.message)
      setCommitments([])
    } else {
      setCommitments((cmts.data || []) as MonthlyCommitment[])
    }
    setCategories((cats.data || []) as Category[])
    setAccounts((accs.data || []) as Account[])
    setTransactions((txs.data || []) as Transaction[])
  }, [activeProfile, selectedMonth, supabase])

  useEffect(() => { load() }, [load])

  // Movimientos ya vinculados a CUALQUIER compromiso este mes: no se vuelven a sugerir
  // (evita que dos compromisos que comparten hint/ruta -ej. Perlita y Mini- se disputen el mismo pago).
  const claimedTxIds = useMemo(
    () => new Set(commitments.filter(c => c.paid_transaction_id).map(c => c.paid_transaction_id as string)),
    [commitments]
  )

  const enriched = useMemo(() => commitments.map(c => {
    const detected = detectTransaction(c, transactions, claimedTxIds)
    const status = effectiveStatus(c, detected)
    const paid = status === 'pagado'
      ? c.actual_amount || Math.abs(c.transactions?.amount || 0)
      : status === 'detectado' && detected ? Math.abs(detected.amount) : 0
    return { commitment: c, detected, status, paid }
  }), [commitments, transactions, claimedTxIds])

  if (!activeProfile) return null

  const filtered = enriched.filter(row => {
    if (filter === 'Pendientes' && !['pendiente', 'vencido'].includes(row.status)) return false
    if (filter === 'Detectados' && row.status !== 'detectado') return false
    if (filter === 'Pagados' && row.status !== 'pagado') return false
    if (search) {
      const haystack = normalizeText(`${row.commitment.name} ${row.commitment.group_name} ${row.commitment.categories?.name || ''} ${row.commitment.matcher_hint || ''}`)
      if (!haystack.includes(normalizeText(search))) return false
    }
    return true
  })

  const activeRows = enriched.filter(r => r.status !== 'omitido')
  const activeCount = activeRows.length
  const expectedTotal = activeRows.reduce((s, r) => s + r.commitment.expected_amount, 0)
  const paidTotal = enriched.reduce((s, r) => s + r.paid, 0)
  const paidCount = enriched.filter(r => r.status === 'pagado').length
  const detectedCount = enriched.filter(r => r.status === 'detectado').length
  const pendingCount = enriched.filter(r => r.status === 'pendiente' || r.status === 'vencido').length
  const completion = activeCount > 0 ? paidCount / activeCount : 0
  const falta = Math.max(0, expectedTotal - paidTotal)

  const grouped = filtered.reduce<Record<string, typeof filtered>>((acc, row) => {
    const key = row.commitment.group_name || 'General'
    if (!acc[key]) acc[key] = []
    acc[key].push(row)
    return acc
  }, {})

  async function confirmDetected(commitment: MonthlyCommitment, tx: Transaction) {
    const { error } = await supabase.from('monthly_commitments').update({
      status: 'pagado',
      paid_transaction_id: tx.id,
      actual_amount: Math.abs(tx.amount),
    }).eq('id', commitment.id)
    if (error) { showToast('Error al vincular movimiento'); return }
    showToast('Movimiento vinculado al compromiso')
    load()
  }

  // Valor real: se puede traer de un movimiento (detección) o escribir a mano.
  // Poner un valor > 0 marca el compromiso como pagado; borrarlo lo devuelve a pendiente.
  function startEditReal(commitment: MonthlyCommitment, detected?: Transaction | null) {
    setEditingReal(commitment.id)
    const current = commitment.actual_amount > 0
      ? commitment.actual_amount
      : detected ? Math.abs(detected.amount) : 0
    setRealVal(current > 0 ? String(current) : '')
  }

  async function commitReal(commitmentId: string, valStr: string) {
    setEditingReal(null)
    const n = parseInt(valStr.replace(/\D/g, '')) || 0
    const patch = n > 0
      ? { actual_amount: n, status: 'pagado' as CommitmentStatus }
      : { actual_amount: 0, status: 'pendiente' as CommitmentStatus, paid_transaction_id: null }
    const { error } = await supabase.from('monthly_commitments').update(patch).eq('id', commitmentId)
    if (error) { showToast('No se pudo guardar el valor real'); return }
    load()
  }

  async function copyPreviousMonth() {
    if (!activeProfile || copying) return
    setCopying(true)
    const prev = prevMonthStr(selectedMonth)
    const { data, error } = await supabase.from('monthly_commitments')
      .select('*, categories(name)')
      .eq('profile_id', activeProfile.id)
      .eq('month', prev)
      .order('group_name')
      .order('name')
    if (error) {
      setCopying(false)
      showToast('No pude leer el mes anterior')
      return
    }
    const previous = (data || []) as (MonthlyCommitment & { categories?: { name: string } | null })[]
    const categoryByName = new Map(categories.map(c => [c.name, c.id]))
    const payload = previous
      .map((c): CommitmentInsert | null => {
        const categoryId = c.categories?.name ? categoryByName.get(c.categories.name) : c.category_id
        if (!categoryId) return null
        return {
          profile_id: activeProfile.id,
          category_id: categoryId,
          account_id: c.account_id,
          name: c.name,
          group_name: c.group_name,
          expected_amount: c.expected_amount,
          due_day: c.due_day,
          payment_method: null,
          matcher_hint: null,
          status: 'pendiente' as CommitmentStatus,
          actual_amount: 0,
          month: selectedMonth,
        }
      })
      .filter((row): row is CommitmentInsert => row !== null)

    if (!payload.length) {
      setCopying(false)
      showToast(previous.length ? 'Faltan categorías equivalentes en este mes' : 'El mes anterior no tiene compromisos')
      return
    }
    const { error: insertError } = await supabase.from('monthly_commitments').insert(payload)
    setCopying(false)
    if (insertError) { showToast('Error al traer mes anterior'); return }
    showToast('Compromisos del mes anterior copiados')
    load()
  }

  return (
    <div>
      <Topbar
        title="Compromisos"
        subtitle="Compromisos mensuales: pagos esperados, detectados y ligados a categorías."
        month={selectedMonth}
        onMonthChange={m => { setSelectedMonth(m); setFilter('Todos'); setSearch('') }}
        action={{ label: 'Nuevo compromiso', onClick: () => setModalCommitment('new') }}
      />

      <div className="scroll">
        {tableError && (
          <div className="card" style={{ borderColor: 'color-mix(in oklab, var(--warn) 35%, transparent)' }}>
            <div className="card-head" style={{ marginBottom: 8 }}>
              <div>
                <h3 className="card-title">Falta preparar la tabla local</h3>
                <p className="card-sub">Aplica la migración local `007_monthly_commitments.sql` para activar este módulo.</p>
              </div>
            </div>
            <p className="insight-text">Supabase respondió: {tableError}</p>
          </div>
        )}

        {/* Resumen compacto: progreso + montos + traer mes anterior */}
        <div className="card commitment-summary">
          <div className="cs-main">
            <div className="cs-head">
              <span className="cs-count">{paidCount} de {activeCount} pagados</span>
              {detectedCount > 0 && <span className="hero-chip chip-warn">{detectedCount} detectado{detectedCount > 1 ? 's' : ''}</span>}
              {pendingCount > 0 && <span className={`hero-chip${pendingCount > 3 ? ' chip-danger' : ' chip-warn'}`}>{pendingCount} pendiente{pendingCount > 1 ? 's' : ''}</span>}
            </div>
            <div className="progress-track cs-bar"><div className="progress-fill" style={{ width: `${Math.round(completion * 100)}%`, background: 'var(--ok)' }} /></div>
            <div className="cs-sub">
              Pagado <b>{clp(paidTotal)}</b> · Esperado <b>{clp(expectedTotal)}</b>{falta > 0 && <> · Falta <b>{clp(falta)}</b></>}
            </div>
          </div>
          <button className="btn-soft" onClick={copyPreviousMonth} disabled={copying || categories.length === 0}>
            <CopyPlus size={16} />Traer mes anterior
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)', zIndex: 1 }} />
            <input className="text-input" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar compromiso, propiedad o categoría..." style={{ paddingLeft: 34 }} />
          </div>
          <div className="tabs">
            {(['Todos', 'Pendientes', 'Detectados', 'Pagados'] as CommitmentFilter[]).map(f => (
              <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>{f}</button>
            ))}
          </div>
        </div>

        {commitments.length === 0 && !tableError ? (
          <div className="card" style={{ textAlign: 'center', padding: 36 }}>
            <ClipboardCheck size={28} color="var(--accent)" />
            <h3 className="card-title" style={{ marginTop: 12 }}>Aún no hay compromisos para este mes</h3>
            <p className="card-sub" style={{ maxWidth: 520, margin: '8px auto 18px' }}>
              Crea la apertura una vez o trae la del mes anterior. Desde ahí Norte marca lo pagado y te muestra lo que falta.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="btn-primary" onClick={() => setModalCommitment('new')}><Plus size={16} />Nuevo compromiso</button>
              <button className="btn-soft" onClick={copyPreviousMonth} disabled={copying || categories.length === 0}><CopyPlus size={16} />Traer mes anterior</button>
            </div>
          </div>
        ) : (
          Object.entries(grouped).map(([group, rows]) => {
            const groupExpected = rows.reduce((s, r) => s + r.commitment.expected_amount, 0)
            const groupPaid = rows.reduce((s, r) => s + r.paid, 0)
            return (
              <div key={group} className="card" style={{ paddingBottom: 14 }}>
                <div className="card-head" style={{ marginBottom: 10 }}>
                  <div>
                    <h3 className="card-title">{group}</h3>
                    <p className="card-sub">{rows.length} compromisos · {clp(groupPaid)} de {clp(groupExpected)}</p>
                  </div>
                </div>
                <div className="commitment-list">
                  {rows.map(({ commitment, detected, status, paid }) => {
                    const cat = commitment.categories
                    const due = dueDateFor(commitment.month, commitment.due_day)
                    return (
                      <div key={commitment.id} className="commitment-row">
                        <div className={`cat-ic c-${cat?.color || 'emerald'}`}>{catEmoji(cat?.icon)}</div>
                        <div className="commitment-main">
                          <div className="commitment-title">
                            <span>{commitment.name}</span>
                            <span className="role-pill" style={{ color: STATUS_COLOR[status] }}>{STATUS_LABEL[status]}</span>
                          </div>
                          <div className="commitment-meta">
                            <span>{cat?.name || 'Sin categoría'}</span>
                            {due && <span>· vence {formatDate(due)}</span>}
                            {detected && status === 'detectado' && (
                              <span className="warn">· detectado {detected.name} {clp(Math.abs(detected.amount))}</span>
                            )}
                          </div>
                        </div>
                        <div className="commitment-col commitment-expected">
                          <b>{clp(commitment.expected_amount)}</b>
                          <span>esperado</span>
                        </div>
                        <div className="commitment-col commitment-real">
                          {editingReal === commitment.id ? (
                            <input
                              className="text-input commitment-real-input" inputMode="numeric" autoFocus
                              value={realVal ? parseInt(realVal).toLocaleString('es-CL') : ''}
                              onChange={e => setRealVal(e.target.value.replace(/\D/g, ''))}
                              onBlur={() => commitReal(commitment.id, realVal)}
                              onKeyDown={e => { if (e.key === 'Enter') commitReal(commitment.id, realVal); if (e.key === 'Escape') setEditingReal(null) }}
                            />
                          ) : (
                            <button
                              className={`commitment-real-btn${status === 'detectado' ? ' suggest' : ''}`}
                              title="Editar valor real"
                              onMouseDown={e => { e.preventDefault(); startEditReal(commitment, detected) }}
                            >
                              {paid > 0 ? clp(paid) : '—'}
                            </button>
                          )}
                          <span className={`commitment-real-source${commitment.paid_transaction_id ? ' auto' : status === 'detectado' ? ' suggest' : ''}`}>
                            {commitment.paid_transaction_id ? (
                              <><Link2 size={10} />auto</>
                            ) : status === 'detectado' ? (
                              <><Link2 size={10} />sugerido</>
                            ) : paid > 0 ? (
                              <><Pencil size={10} />manual</>
                            ) : 'real'}
                          </span>
                        </div>
                        <div className="commitment-actions">
                          {detected && status === 'detectado' && (
                            <button className="icon-btn ghost" title="Confirmar: vincular este movimiento" onClick={() => confirmDetected(commitment, detected)}>
                              <Link2 size={15} />
                            </button>
                          )}
                          <button className="icon-btn ghost" title="Editar compromiso" onClick={() => setModalCommitment(commitment)}>
                            <Pencil size={14} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })
        )}
      </div>

      {modalCommitment && (
        <CommitmentModal
          profileId={activeProfile.id}
          month={selectedMonth}
          categories={categories}
          accounts={accounts}
          commitment={modalCommitment === 'new' ? undefined : modalCommitment}
          onClose={() => setModalCommitment(null)}
          onSaved={load}
        />
      )}
    </div>
  )
}

function CommitmentModal({ profileId, month, categories, accounts, commitment, onClose, onSaved }: {
  profileId: string
  month: string
  categories: Category[]
  accounts: Account[]
  commitment?: MonthlyCommitment
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!commitment
  const supabase = createClient()
  const { showToast } = useToast()
  useEscapeClose(onClose)

  const [name, setName] = useState(commitment?.name ?? '')
  const [group, setGroup] = useState(commitment?.group_name ?? '')
  const [categoryId, setCategoryId] = useState(commitment?.category_id ?? categories[0]?.id ?? '')
  const [accountId, setAccountId] = useState(commitment?.account_id ?? '')
  const [expected, setExpected] = useState(commitment ? String(commitment.expected_amount) : '')
  const [dueDay, setDueDay] = useState(commitment?.due_day ? String(commitment.due_day) : '')
  const [status, setStatus] = useState<CommitmentStatus>(commitment?.status ?? 'pendiente')
  const [saving, setSaving] = useState(false)

  const amountN = parseInt(expected.replace(/\D/g, '')) || 0
  const dueN = parseInt(dueDay.replace(/\D/g, '')) || null
  const selectedCategory = categories.find(c => c.id === categoryId)
  const defaultGroup = group.trim() || 'General'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !categoryId) return
    setSaving(true)
    const payload = {
      profile_id: profileId,
      category_id: categoryId,
      account_id: accountId || null,
      name: name.trim(),
      group_name: defaultGroup,
      expected_amount: amountN,
      due_day: dueN,
      payment_method: null,
      matcher_hint: null,
      status,
      month,
    }
    const { error } = isEdit
      ? await supabase.from('monthly_commitments').update(payload).eq('id', commitment!.id)
      : await supabase.from('monthly_commitments').insert({ ...payload, actual_amount: 0 })
    setSaving(false)
    if (error) {
      showToast(`No se pudo guardar: ${supabaseErrorMessage(error)}`)
      return
    }
    showToast(isEdit ? 'Compromiso actualizado' : 'Compromiso creado')
    onSaved()
    onClose()
  }

  async function handleDelete() {
    if (!commitment) return
    if (!confirm(`Eliminar "${commitment.name}" de este mes?`)) return
    setSaving(true)
    const { error } = await supabase.from('monthly_commitments').delete().eq('id', commitment.id)
    setSaving(false)
    if (error) { showToast('Error al eliminar compromiso'); return }
    showToast('Compromiso eliminado')
    onSaved()
    onClose()
  }

  return (
    <div className="modal-scrim" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ borderTop: '3px solid var(--accent)' }}>
        <div className="modal-head">
          <h3>{isEdit ? 'Editar compromiso' : 'Nuevo compromiso'}</h3>
          <button type="button" className="icon-btn ghost sm" onClick={onClose}><X size={16} /></button>
        </div>

        <form onSubmit={handleSubmit}>
          <label className="field-label">Nombre</label>
          <input className="text-input" value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Luz Casa VLC" autoFocus maxLength={56} />

          <div className="row-2">
            <div>
              <label className="field-label">Grupo</label>
              <input className="text-input" value={group} onChange={e => setGroup(e.target.value)} placeholder="Casa VLC" maxLength={36} />
            </div>
            <div>
              <label className="field-label">Vence dia</label>
              <input className="text-input" inputMode="numeric" value={dueDay} onChange={e => setDueDay(e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="10" />
            </div>
          </div>

          <label className="field-label">Categoría obligatoria</label>
          <select value={categoryId} onChange={e => setCategoryId(e.target.value)} required>
            {categories.length === 0 && <option value="">Crea categorías para este mes primero</option>}
            {categories.map(c => <option key={c.id} value={c.id}>{catEmoji(c.icon)} {c.group_name} · {c.name}</option>)}
          </select>
          {selectedCategory && (
            <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 6 }}>
              Control presupuestario: {clp(selectedCategory.spent)} gastado de {clp(selectedCategory.assigned)} asignado.
            </div>
          )}

          <label className="field-label">Monto esperado</label>
          <div className="amount-field" style={{ marginBottom: 0 }}>
            <span className="amount-cur">$</span>
            <input className="amount-input" inputMode="numeric" value={amountN > 0 ? amountN.toLocaleString('es-CL') : ''} onChange={e => setExpected(e.target.value.replace(/\D/g, ''))} placeholder="0" />
          </div>

          <div className="row-2">
            <div>
              <label className="field-label">Cuenta</label>
              <select value={accountId} onChange={e => setAccountId(e.target.value)}>
                <option value="">Sin cuenta fija</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">Estado</label>
              <select value={status} onChange={e => setStatus(e.target.value as CommitmentStatus)}>
                <option value="pendiente">Pendiente</option>
                <option value="pagado">Pagado</option>
                <option value="omitido">No aplica</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 20, alignItems: 'center' }}>
            {isEdit && (
              <button type="button" onClick={handleDelete} disabled={saving} title="Eliminar compromiso"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, padding: '12px 0', borderRadius: 'var(--radius-sm)', background: 'transparent', border: '1px solid var(--border)', color: 'var(--danger)', cursor: 'pointer', flexShrink: 0 }}>
                <Trash2 size={16} />
              </button>
            )}
            <button type="submit" disabled={!name.trim() || !categoryId || saving} className="btn-primary block" style={{ opacity: name.trim() && categoryId ? 1 : 0.45, marginTop: 0 }}>
              {saving ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear compromiso'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
