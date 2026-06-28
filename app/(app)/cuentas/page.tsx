'use client'
import { useEffect, useState, useCallback } from 'react'
import { Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useProfiles } from '@/contexts/ProfileContext'
import Topbar from '@/components/layout/Topbar'
import { clp } from '@/lib/utils'
import type { Account, AccountType } from '@/lib/types'
import { useToast } from '@/components/ui/Toast'

const ACCOUNT_GROUPS: { type: AccountType; label: string }[] = [
  { type: 'Cuenta', label: 'Cuentas' },
  { type: 'Ahorro', label: 'Ahorro e inversión' },
  { type: 'Crédito', label: 'Tarjetas de crédito' },
]

const COLOR_HEX: Record<string, string> = {
  emerald: '#34c98a', blue: '#4f93f5', violet: '#9b8cf0', amber: '#e6b25a', red: '#ef7a63',
}

export default function CuentasPage() {
  const { activeProfile } = useProfiles()
  const supabase = createClient()
  const { showToast } = useToast()
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7) + '-01')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', bank: '', type: 'Cuenta' as AccountType, balance: '', color: 'emerald' })

  const load = useCallback(async () => {
    if (!activeProfile) return
    const { data } = await supabase.from('accounts').select('*').eq('profile_id', activeProfile.id).order('created_at')
    setAccounts((data || []) as Account[])
  }, [activeProfile, supabase])

  useEffect(() => { load() }, [load])

  if (!activeProfile) return null

  const disponible = accounts.filter(a => a.type === 'Cuenta').reduce((s, a) => s + a.balance, 0)
  const ahorro = accounts.filter(a => a.type === 'Ahorro').reduce((s, a) => s + a.balance, 0)
  const deudas = accounts.filter(a => a.type === 'Crédito').reduce((s, a) => s + a.balance, 0)
  const patrimonio = disponible + ahorro + deudas

  async function addAccount(e: React.FormEvent) {
    e.preventDefault()
    const balance = parseFloat(form.balance.replace(/[^0-9-]/g, '')) || 0
    const { error } = await supabase.from('accounts').insert({
      profile_id: activeProfile!.id,
      name: form.name, bank: form.bank,
      type: form.type, balance, color: form.color,
    })
    if (error) { showToast('Error al agregar cuenta'); return }
    showToast('✓ Cuenta agregada')
    setAdding(false)
    setForm({ name: '', bank: '', type: 'Cuenta', balance: '', color: 'emerald' })
    load()
  }

  return (
    <div>
      <Topbar title="Cuentas" action={{ label: 'Agregar cuenta', onClick: () => setAdding(true) }} month={selectedMonth} onMonthChange={setSelectedMonth} />

      <div className="scroll">

        {/* Patrimonio neto */}
        <div className="card networth">
          <div className="nw-l">
            <div style={{ fontSize: 12, color: 'var(--text-faint)', fontFamily: 'var(--font-ui)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Patrimonio neto</div>
            <div className={`nw-amount${patrimonio < 0 ? ' red' : ''}`}>{clp(patrimonio)}</div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 8 }}>Disponible + ahorro − deudas de tarjeta</div>
          </div>
          <div className="nw-breakdown">
            {[
              { label: 'Disponible', val: disponible, dot: 'c-emerald' },
              { label: 'Ahorro',     val: ahorro,     dot: 'c-violet' },
              { label: 'Deudas',     val: Math.abs(deudas), dot: 'c-red', red: deudas < 0 },
            ].map(({ label, val, dot, red }) => (
              <div key={label} className="nw-item">
                <div className={`nw-dot ${dot}`} />
                {label}
                <b className={red ? 'red' : ''}>{red ? '−' : ''}{clp(val)}</b>
              </div>
            ))}
          </div>
        </div>

        {/* Account groups */}
        {ACCOUNT_GROUPS.map(({ type, label }) => {
          const accs = accounts.filter(a => a.type === type)
          if (accs.length === 0) return null
          return (
            <div key={type} className="acc-section">
              <div className="acc-section-title">{label}</div>
              <div className="acc-grid">
                {accs.map(acc => {
                  const color = COLOR_HEX[acc.color] || '#34c98a'
                  const isNeg = acc.balance < 0
                  return (
                    <div key={acc.id} className="card acc-card">
                      <div className="acc-top">
                        <div className="acc-ic" style={{ background: color + '20', border: `1.5px solid ${color}40`, fontSize: 18 }}>
                          {type === 'Crédito' ? '💳' : type === 'Ahorro' ? '🏦' : '🏧'}
                        </div>
                      </div>
                      <div className="acc-name">{acc.name}</div>
                      <div className="acc-bank">{acc.bank}</div>
                      <div className={`acc-balance${isNeg ? ' red' : ''}`}>
                        {isNeg ? '−' : ''}{clp(Math.abs(acc.balance))}
                      </div>
                      <div className="acc-foot">{type}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}

        {accounts.length === 0 && !adding && (
          <div className="card" style={{ textAlign: 'center', padding: 48, color: 'var(--text-faint)' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🏦</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>Sin cuentas todavía</div>
            <div style={{ fontSize: 13 }}>Agrega tu primera cuenta para comenzar a hacer seguimiento.</div>
          </div>
        )}

        {/* Add account form */}
        {adding && (
          <div className="card">
            <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Nueva cuenta</div>
            <form onSubmit={addAccount} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <input className="text-input" type="text" placeholder="Nombre (ej: Cuenta Corriente)" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                <input className="text-input" type="text" placeholder="Banco" value={form.bank} onChange={e => setForm(f => ({ ...f, bank: e.target.value }))} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as AccountType }))} style={{ padding: '10px 14px', fontSize: 13.5, outline: 'none', cursor: 'pointer' }}>
                  <option value="Cuenta">Cuenta corriente / vista</option>
                  <option value="Ahorro">Ahorro / inversión</option>
                  <option value="Crédito">Tarjeta de crédito</option>
                </select>
                <input className="text-input" type="text" inputMode="numeric" placeholder="Saldo actual ($)" value={form.balance} onChange={e => setForm(f => ({ ...f, balance: e.target.value.replace(/[^0-9-]/g, '') }))} />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setAdding(false)} style={{ padding: '9px 18px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 13.5, cursor: 'pointer' }}>Cancelar</button>
                <button type="submit" style={{ padding: '9px 18px', borderRadius: 'var(--radius-sm)', background: 'var(--accent)', color: '#06140e', border: 'none', fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}>Agregar</button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
