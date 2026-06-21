'use client'
import { useState } from 'react'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/Toast'
import type { TransactionType, Category, Account } from '@/lib/types'

type ModalType = 'gasto' | 'ingreso' | 'mover'

const TYPE_COLOR: Record<ModalType, string> = {
  gasto: 'var(--danger)',
  ingreso: 'var(--ok)',
  mover: 'var(--c-blue)',
}

const TYPE_LABEL: Record<ModalType, string> = {
  gasto: 'Agregar gasto',
  ingreso: 'Agregar ingreso',
  mover: 'Mover dinero',
}

interface Props {
  type: ModalType
  profileId: string
  categories: Category[]
  accounts: Account[]
  onClose: () => void
  onSaved: () => void
}

export default function TransactionModal({ type, profileId, categories, accounts, onClose, onSaved }: Props) {
  const [amount, setAmount] = useState('')
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [accountId, setAccountId] = useState(accounts[0]?.id || '')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)
  const { showToast } = useToast()
  const supabase = createClient()

  const accentColor = TYPE_COLOR[type]

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const n = parseFloat(amount.replace(/\./g, '').replace(',', '.'))
    if (!n || n <= 0) return
    setSaving(true)

    const txAmount = type === 'gasto' || type === 'mover' ? -Math.round(n) : Math.round(n)
    const txType: TransactionType = type === 'mover' ? 'transfer' : type

    const { error } = await supabase.from('transactions').insert({
      profile_id: profileId,
      name: name || (type === 'gasto' ? 'Gasto' : type === 'ingreso' ? 'Ingreso' : 'Transferencia'),
      amount: txAmount,
      type: txType,
      category_id: categoryId || null,
      account_id: accountId || null,
      date,
    })

    setSaving(false)
    if (error) { showToast('Error al guardar. Intenta nuevamente.'); return }
    showToast(type === 'gasto' ? '✓ Gasto registrado' : type === 'ingreso' ? '✓ Ingreso registrado' : '✓ Transferencia registrada')
    onSaved()
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ borderTop: `3px solid ${accentColor}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontFamily: 'var(--font-ui)', fontSize: 17, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
            {TYPE_LABEL[type]}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Amount */}
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ fontSize: 13, color: 'var(--text-faint)', fontFamily: 'var(--font-ui)', marginBottom: 6 }}>Monto</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              <span style={{ fontSize: 28, fontWeight: 700, fontFamily: 'var(--font-ui)', color: accentColor }}>$</span>
              <input
                type="text"
                inputMode="numeric"
                value={amount}
                onChange={e => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="0"
                autoFocus
                style={{
                  width: 160, border: 'none', background: 'transparent',
                  fontSize: 36, fontWeight: 700, fontFamily: 'var(--font-ui)',
                  color: accentColor, textAlign: 'center', outline: 'none',
                }}
              />
            </div>
          </div>

          <input
            type="text"
            placeholder={type === 'gasto' ? 'Descripción (ej: Supermercado)' : type === 'ingreso' ? 'Descripción (ej: Sueldo)' : 'Descripción'}
            value={name}
            onChange={e => setName(e.target.value)}
            style={{ padding: '10px 14px', fontSize: 14, outline: 'none' }}
          />

          {type !== 'mover' && categories.length > 0 && (
            <select
              value={categoryId}
              onChange={e => setCategoryId(e.target.value)}
              style={{ padding: '10px 14px', fontSize: 14, outline: 'none', cursor: 'pointer' }}
            >
              <option value="">Sin categoría</option>
              {categories.filter(c => type === 'ingreso' ? c.group_name === 'Ahorro' : true).map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}

          <select
            value={accountId}
            onChange={e => setAccountId(e.target.value)}
            style={{ padding: '10px 14px', fontSize: 14, outline: 'none', cursor: 'pointer' }}
          >
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>

          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            style={{ padding: '10px 14px', fontSize: 14, outline: 'none' }}
          />

          <button
            type="submit"
            disabled={!amount || saving}
            style={{
              padding: '12px', borderRadius: 'var(--radius-sm)',
              background: accentColor, color: type === 'ingreso' ? '#06140e' : 'white',
              fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 15,
              border: 'none', cursor: saving ? 'wait' : 'pointer',
              opacity: !amount ? 0.5 : 1, transition: 'opacity .15s',
              marginTop: 4,
            }}
          >
            {saving ? 'Guardando...' : TYPE_LABEL[type]}
          </button>
        </form>
      </div>
    </div>
  )
}
