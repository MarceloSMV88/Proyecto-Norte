'use client'
import { useState } from 'react'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/Toast'
import DatePicker from '@/components/ui/DatePicker'
import { catEmoji } from '@/lib/icons'
import { todayCL } from '@/lib/utils'
import { useEscapeClose } from '@/lib/useEscapeClose'
import type { TransactionType, Category, Account } from '@/lib/types'

type ModalType = 'gasto' | 'ingreso' | 'mover'

const CONFIG: Record<ModalType, { title: string; btnLabel: string }> = {
  gasto:  { title: 'Agregar gasto',    btnLabel: 'Registrar gasto' },
  ingreso:{ title: 'Agregar ingreso',  btnLabel: 'Registrar ingreso' },
  mover:  { title: 'Mover dinero',     btnLabel: 'Registrar transferencia' },
}

export default function TransactionModal({ type, profileId, categories, accounts, onClose, onSaved }: {
  type: ModalType
  profileId: string
  categories: Category[]
  accounts: Account[]
  onClose: () => void
  onSaved: () => void
}) {
  const [rawAmount, setRawAmount] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [description, setDescription] = useState('')
  const [accountId, setAccountId] = useState(accounts[0]?.id || '')
  const [accountToId, setAccountToId] = useState('')
  const [date, setDate] = useState(todayCL(0))
  const [saving, setSaving] = useState(false)
  const { showToast } = useToast()
  const supabase = createClient()
  useEscapeClose(onClose)
  const cfg = CONFIG[type]

  const n = parseInt(rawAmount.replace(/\D/g, '')) || 0
  const formatted = n > 0 ? n.toLocaleString('es-CL') : ''
  const selectedCat = categories.find(c => c.id === categoryId)

  const relevantCats = type === 'gasto'
    ? categories.filter(c => c.group_name !== 'Ahorro')
    : []

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!n) return
    if (type === 'mover' && (!accountId || !accountToId || accountId === accountToId)) {
      showToast('Elige cuentas de origen y destino distintas')
      return
    }
    setSaving(true)

    // El saldo de las cuentas lo sincroniza el trigger de BD por cada fila insertada.
    const rows = type === 'mover'
      ? (() => {
          const from = accounts.find(a => a.id === accountId)
          const to = accounts.find(a => a.id === accountToId)
          const base = { profile_id: profileId, type: 'transfer' as TransactionType, category_id: null, description: description.trim() || null, date }
          return [
            { ...base, name: `Transferencia a ${to?.name ?? 'otra cuenta'}`, amount: -n, account_id: accountId },
            { ...base, name: `Transferencia desde ${from?.name ?? 'otra cuenta'}`, amount: n, account_id: accountToId },
          ]
        })()
      : [{
          profile_id: profileId,
          name: selectedCat?.name || description.trim() || (type === 'ingreso' ? 'Ingreso' : cfg.title),
          description: description.trim() || null,
          amount: type === 'ingreso' ? n : -n,
          type: type as TransactionType,
          category_id: categoryId || null,
          account_id: accountId || null,
          date,
        }]

    const { error } = await supabase.from('transactions').insert(rows)

    setSaving(false)
    if (error) { showToast('Error al guardar'); return }
    showToast('✓ Registrado')
    onSaved()
    onClose()
  }

  return (
    <div className="modal-scrim" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-head">
          <h3>{cfg.title}</h3>
          <button type="button" onClick={onClose} className="icon-btn ghost sm">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Monto */}
          <div className="amount-field">
            <span className="amount-cur">$</span>
            <input
              className="amount-input"
              type="text"
              inputMode="numeric"
              placeholder="0"
              autoFocus
              value={formatted}
              onChange={e => setRawAmount(e.target.value.replace(/\D/g, ''))}
            />
          </div>

          {/* Categorías */}
          {relevantCats.length > 0 && (
            <>
              <label className="field-label">Categoría</label>
              <div className="chip-grid">
                {relevantCats.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    className={`chip${categoryId === c.id ? ' on' : ''}`}
                    onClick={() => setCategoryId(categoryId === c.id ? '' : c.id)}
                  >
                    <span className={`chip-ic c-${c.color}`}>{catEmoji(c.icon)}</span>
                    {c.name}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Descripción */}
          <label className="field-label" style={{ marginTop: 16 }}>Descripción</label>
          <input
            className="text-input"
            type="text"
            placeholder="Ej: Supermercado semanal, Factura luz…"
            value={description}
            onChange={e => setDescription(e.target.value)}
            maxLength={120}
          />

          {/* Cuenta(s) + Fecha */}
          {type === 'mover' ? (
            <>
              <div className="row-2" style={{ marginTop: 16 }}>
                <div>
                  <label className="field-label">Desde cuenta</label>
                  <select value={accountId} onChange={e => setAccountId(e.target.value)}>
                    <option value="">Elegir…</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="field-label">Hacia cuenta</label>
                  <select value={accountToId} onChange={e => setAccountToId(e.target.value)}>
                    <option value="">Elegir…</option>
                    {accounts.filter(a => a.id !== accountId).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              </div>
              <label className="field-label" style={{ marginTop: 16 }}>Fecha</label>
              <DatePicker value={date} onChange={setDate} />
            </>
          ) : (
          <div className="row-2" style={{ marginTop: 16 }}>
            <div>
              <label className="field-label">Cuenta</label>
              <select value={accountId} onChange={e => setAccountId(e.target.value)}>
                <option value="">Sin cuenta</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">Fecha</label>
              <DatePicker value={date} onChange={setDate} />
            </div>
          </div>
          )}

          <button
            type="submit"
            disabled={!n || saving}
            className="btn-primary block"
            style={{ opacity: n ? 1 : 0.4 }}
          >
            {saving ? 'Guardando…' : cfg.btnLabel}
          </button>
        </form>
      </div>
    </div>
  )
}
