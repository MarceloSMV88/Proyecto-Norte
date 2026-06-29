'use client'
import { useEffect, useState, useCallback } from 'react'
import { Pencil } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useProfiles } from '@/contexts/ProfileContext'
import Topbar from '@/components/layout/Topbar'
import AccountModal from '@/components/modals/AccountModal'
import { clp } from '@/lib/utils'
import type { Account, AccountType } from '@/lib/types'

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
  const [accounts, setAccounts] = useState<Account[]>([])
  const [adding, setAdding] = useState(false)
  const [editAcc, setEditAcc] = useState<Account | null>(null)

  const load = useCallback(async () => {
    if (!activeProfile) return
    const { data } = await supabase.from('accounts').select('*').eq('profile_id', activeProfile.id).order('created_at')
    setAccounts((data || []) as Account[])
  }, [activeProfile, supabase])

  useEffect(() => { load() }, [load])

  if (!activeProfile) return null

  const disponible = accounts.filter(a => a.type === 'Cuenta').reduce((s, a) => s + a.balance, 0)
  const ahorro = accounts.filter(a => a.type === 'Ahorro').reduce((s, a) => s + a.balance, 0)
  // balance de Crédito es negativo (deuda); deudas = suma (negativa)
  const deudas = accounts.filter(a => a.type === 'Crédito').reduce((s, a) => s + a.balance, 0)
  const patrimonio = disponible + ahorro + deudas

  return (
    <div>
      <Topbar title="Cuentas" action={{ label: 'Agregar cuenta', onClick: () => setAdding(true) }} />

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
              { label: 'Disponible', val: disponible, dot: 'c-emerald', red: false },
              { label: 'Ahorro',     val: ahorro,     dot: 'c-violet', red: false },
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
                  const isCredit = acc.type === 'Crédito'
                  const debt = isCredit ? Math.abs(Math.min(0, acc.balance)) : 0
                  const limit = acc.credit_limit ?? 0
                  const available = limit - debt

                  return (
                    <div key={acc.id} className="card acc-card">
                      <div className="acc-top">
                        <div className="acc-ic" style={{ background: color + '20', border: `1.5px solid ${color}40`, fontSize: 18 }}>
                          {isCredit ? '💳' : type === 'Ahorro' ? '🏦' : '🏧'}
                        </div>
                        <button
                          onClick={() => setEditAcc(acc)}
                          title="Editar cuenta"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', display: 'flex', padding: 4, borderRadius: 8, transition: 'color .15s' }}
                          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
                          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-faint)')}
                        >
                          <Pencil size={15} />
                        </button>
                      </div>
                      <div className="acc-name">{acc.name}{acc.last4 ? <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}> ••{acc.last4}</span> : null}</div>
                      <div className="acc-bank">{acc.bank}</div>

                      {isCredit ? (
                        <>
                          <div className="acc-balance" style={{ color: debt > 0 ? 'var(--danger)' : 'var(--text)' }}>
                            {debt > 0 ? '−' : ''}{clp(debt)}
                          </div>
                          <div className="acc-foot">
                            Deuda · Disponible <b style={{ color: 'var(--ok)' }}>{clp(available)}</b>
                            {limit > 0 && <span style={{ color: 'var(--text-faint)' }}> de {clp(limit)}</span>}
                          </div>
                          {limit > 0 && (
                            <div className="progress-track" style={{ marginTop: 8 }}>
                              <div className="progress-fill" style={{ width: `${Math.min(100, (debt / limit) * 100)}%`, background: debt / limit > 0.9 ? 'var(--danger)' : debt / limit > 0.7 ? 'var(--warn)' : color }} />
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          <div className="acc-balance">{clp(acc.balance)}</div>
                          <div className="acc-foot">{type}</div>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}

        {accounts.length === 0 && (
          <div className="card" style={{ textAlign: 'center', padding: 48, color: 'var(--text-faint)' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🏦</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>Sin cuentas todavía</div>
            <div style={{ fontSize: 13 }}>Agrega tu primera cuenta para comenzar a hacer seguimiento.</div>
          </div>
        )}
      </div>

      {/* Modales crear / editar */}
      {adding && (
        <AccountModal profileId={activeProfile.id} onClose={() => setAdding(false)} onSaved={load} />
      )}
      {editAcc && (
        <AccountModal profileId={activeProfile.id} account={editAcc} onClose={() => setEditAcc(null)} onSaved={load} />
      )}
    </div>
  )
}
