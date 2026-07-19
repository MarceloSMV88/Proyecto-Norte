'use client'
import { useRef, useState } from 'react'
import { X, Trash2, Camera } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/Toast'
import { clp } from '@/lib/utils'
import { useEscapeClose } from '@/lib/useEscapeClose'
import { useAnimatedClose } from '@/lib/useAnimatedClose'
import type { Account, AccountType, AccentColor } from '@/lib/types'

const TYPES: { key: AccountType; label: string }[] = [
  { key: 'Cuenta', label: 'Cuenta' },
  { key: 'Ahorro', label: 'Ahorro' },
  { key: 'Crédito', label: 'Crédito' },
]

const COLORS: { key: AccentColor; hex: string }[] = [
  { key: 'emerald', hex: '#34c98a' },
  { key: 'blue', hex: '#4f93f5' },
  { key: 'violet', hex: '#9b8cf0' },
  { key: 'amber', hex: '#e6b25a' },
  { key: 'red', hex: '#ef7a63' },
]

interface AccountModalProps {
  profileId: string
  account?: Account     // si viene → modo edición
  onClose: () => void
  onSaved: () => void
}

const fmt = (s: string) => { const n = parseInt(s.replace(/\D/g, '')) || 0; return n > 0 ? n.toLocaleString('es-CL') : '' }
const num = (s: string) => parseInt(s.replace(/\D/g, '')) || 0

export default function AccountModal({ profileId, account, onClose, onSaved }: AccountModalProps) {
  const isEdit = !!account
  const { closing, close } = useAnimatedClose(onClose)
  useEscapeClose(close)
  const validColor = (c?: string): AccentColor => (COLORS.some(x => x.key === c) ? c as AccentColor : 'emerald')

  const [name, setName] = useState(account?.name ?? '')
  const [bank, setBank] = useState(account?.bank ?? '')
  const [type, setType] = useState<AccountType>(account?.type ?? 'Cuenta')
  const [color, setColor] = useState<AccentColor>(validColor(account?.color))
  const [last4, setLast4] = useState(account?.last4 ?? '')
  const [accountNumber, setAccountNumber] = useState(account?.account_number ?? '')
  // Cuenta/Ahorro: saldo positivo
  const [balance, setBalance] = useState(account && account.type !== 'Crédito' ? String(Math.abs(account.balance)) : '')
  // Crédito: cupo total + deuda actual (balance se guarda como negativo)
  const [creditLimit, setCreditLimit] = useState(account?.credit_limit ? String(account.credit_limit) : '')
  const [debt, setDebt] = useState(account && account.type === 'Crédito' ? String(Math.abs(account.balance)) : '')
  const [imageUrl, setImageUrl] = useState(account?.image_url ?? '')
  const [uploadingImg, setUploadingImg] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const [saving, setSaving] = useState(false)
  const { showToast } = useToast()
  const supabase = createClient()

  const accentHex = (COLORS.find(c => c.key === color) ?? COLORS[0]).hex
  const isCredit = type === 'Crédito'
  const available = num(creditLimit) - num(debt)

  async function handleImagePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 3 * 1024 * 1024) { showToast('Imagen muy pesada (máx. 3MB)'); return }
    setUploadingImg(true)
    const form = new FormData()
    form.append('file', file)
    form.append('profile_id', profileId)
    const { data, error } = await supabase.functions.invoke('upload-account-image', { body: form })
    setUploadingImg(false)
    if (error || !data?.url) { showToast('No se pudo subir la imagen'); return }
    setImageUrl(data.url)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)

    const payload: Record<string, unknown> = {
      name: name.trim(),
      bank: bank.trim(),
      type,
      color,
      last4: isCredit ? (last4.trim() || null) : null,
      account_number: !isCredit ? (accountNumber.trim() || null) : null,
      image_url: imageUrl || null,
    }
    if (isCredit) {
      payload.balance = -num(debt)          // deuda como negativo
      payload.credit_limit = num(creditLimit) || null
    } else {
      payload.balance = num(balance)        // saldo positivo
      payload.credit_limit = null
    }

    const { error } = isEdit
      ? await supabase.from('accounts').update(payload).eq('id', account!.id)
      : await supabase.from('accounts').insert({ ...payload, profile_id: profileId })

    setSaving(false)
    if (error) { showToast('Error al guardar'); return }
    showToast(isEdit ? '✓ Cuenta actualizada' : '✓ Cuenta agregada')
    onSaved(); close()
  }

  async function handleDelete() {
    if (!account) return
    if (!confirm(`¿Eliminar "${account.name}"? Los movimientos asociados quedarán sin cuenta.`)) return
    setSaving(true)
    const { error } = await supabase.from('accounts').delete().eq('id', account.id)
    setSaving(false)
    if (error) { showToast('Error al eliminar'); return }
    showToast('✓ Cuenta eliminada')
    onSaved(); close()
  }

  return (
    <div className="modal-scrim" data-closing={closing || undefined} onClick={e => e.target === e.currentTarget && close()}>
      <div className="modal" style={{ borderTop: `3px solid ${accentHex}` }}>
        <div className="modal-head">
          <h3>{isEdit ? 'Editar cuenta' : 'Nueva cuenta'}</h3>
          <button type="button" onClick={close} className="icon-btn ghost sm"><X size={16} /></button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Ícono / imagen de la cuenta: click en el bloque para subir/cambiar */}
          <div style={{ marginBottom: 16 }}>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              title="Click para cambiar la imagen"
              style={{
                width: 52, height: 52, borderRadius: 14, cursor: 'pointer',
                background: imageUrl ? `center/cover url(${imageUrl})` : `${accentHex}20`,
                border: `1.5px solid ${accentHex}40`, display: 'grid', placeItems: 'center', position: 'relative', overflow: 'hidden',
              }}
            >
              {!imageUrl && <Camera size={18} color={accentHex} />}
              {uploadingImg && (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.45)', display: 'grid', placeItems: 'center', fontSize: 10, color: '#fff' }}>...</div>
              )}
              {imageUrl && !uploadingImg && (
                <span
                  role="button"
                  title="Quitar imagen"
                  onClick={e => { e.stopPropagation(); setImageUrl('') }}
                  style={{
                    position: 'absolute', top: 2, right: 2, width: 16, height: 16, borderRadius: '50%',
                    background: 'rgba(0,0,0,.65)', color: '#fff', display: 'grid', placeItems: 'center',
                  }}
                >
                  <X size={10} />
                </span>
              )}
            </button>
            <input ref={fileRef} type="file" accept="image/*" onChange={handleImagePick} style={{ display: 'none' }} />
          </div>

          {/* Nombre + Banco */}
          <div className="row-2">
            <div>
              <label className="field-label">Nombre</label>
              <input className="text-input" type="text" placeholder="Ej: Cuenta Corriente" value={name} onChange={e => setName(e.target.value)} autoFocus maxLength={40} />
            </div>
            <div>
              <label className="field-label">Banco</label>
              <input className="text-input" type="text" placeholder="Ej: Santander" value={bank} onChange={e => setBank(e.target.value)} maxLength={30} />
            </div>
          </div>

          {/* Tipo */}
          <label className="field-label" style={{ marginTop: 16 }}>Tipo</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {TYPES.map(t => (
              <button key={t.key} type="button" onClick={() => setType(t.key)}
                style={{
                  flex: 1, padding: '9px', borderRadius: 'var(--radius-sm)',
                  border: type === t.key ? `1px solid ${accentHex}` : '1px solid var(--border)',
                  background: type === t.key ? `color-mix(in oklab, ${accentHex} 14%, var(--surface-2))` : 'var(--surface-2)',
                  color: type === t.key ? 'var(--text)' : 'var(--text-2)',
                  fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 13, cursor: 'pointer', transition: '.15s',
                }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Campos según tipo */}
          {isCredit ? (
            <>
              <div className="row-2" style={{ marginTop: 16 }}>
                <div>
                  <label className="field-label">Cupo total ($)</label>
                  <input className="text-input" type="text" inputMode="numeric" placeholder="0" value={fmt(creditLimit)} onChange={e => setCreditLimit(e.target.value)} />
                </div>
                <div>
                  <label className="field-label">Deuda actual ($)</label>
                  <input className="text-input" type="text" inputMode="numeric" placeholder="0" value={fmt(debt)} onChange={e => setDebt(e.target.value)} />
                </div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 8 }}>
                Disponible: <b style={{ color: available < 0 ? 'var(--danger)' : 'var(--ok)' }}>{clp(available)}</b>
                {num(creditLimit) > 0 && <span style={{ color: 'var(--text-faint)' }}> de {clp(num(creditLimit))}</span>}
              </div>
            </>
          ) : (
            <>
              <label className="field-label" style={{ marginTop: 16 }}>Saldo actual ($)</label>
              <div className="amount-field" style={{ marginBottom: 0 }}>
                <span className="amount-cur">$</span>
                <input className="amount-input" type="text" inputMode="numeric" placeholder="0" value={fmt(balance)} onChange={e => setBalance(e.target.value)} />
              </div>
              <label className="field-label" style={{ marginTop: 16 }}>N° de cuenta <span style={{ textTransform: 'none', color: 'var(--text-faint)', fontWeight: 400 }}>(para capturar transferencias por correo)</span></label>
              <input className="text-input" type="text" placeholder="Ej: 0-000-62-61065-4" value={accountNumber} onChange={e => setAccountNumber(e.target.value)} />
            </>
          )}

          {/* Últimos 4 (TC para Google Wallet) */}
          {isCredit && (
            <>
              <label className="field-label" style={{ marginTop: 16 }}>Últimos 4 dígitos <span style={{ textTransform: 'none', color: 'var(--text-faint)', fontWeight: 400 }}>(para captura automática de Google Wallet)</span></label>
              <input className="text-input" type="text" inputMode="numeric" placeholder="Ej: 5116" maxLength={4} value={last4} onChange={e => setLast4(e.target.value.replace(/\D/g, ''))} style={{ maxWidth: 140 }} />
            </>
          )}

          {/* Color */}
          <label className="field-label" style={{ marginTop: 16 }}>Color</label>
          <div style={{ display: 'flex', gap: 10 }}>
            {COLORS.map(c => (
              <button key={c.key} type="button" onClick={() => setColor(c.key)}
                style={{
                  width: 28, height: 28, borderRadius: '50%', background: c.hex,
                  border: color === c.key ? '3px solid var(--text)' : '3px solid transparent',
                  cursor: 'pointer', transition: 'transform .1s', transform: color === c.key ? 'scale(1.12)' : 'scale(1)',
                }} />
            ))}
          </div>

          {/* Acciones */}
          <div style={{ display: 'flex', gap: 10, marginTop: 20, alignItems: 'center' }}>
            {isEdit && (
              <button type="button" onClick={handleDelete} disabled={saving} title="Eliminar cuenta"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, padding: '12px 0', borderRadius: 'var(--radius-sm)', background: 'transparent', border: '1px solid var(--border)', color: 'var(--danger)', cursor: 'pointer', flexShrink: 0 }}>
                <Trash2 size={16} />
              </button>
            )}
            <button type="submit" disabled={!name.trim() || saving} className="btn-primary block" style={{ background: accentHex, opacity: name.trim() ? 1 : 0.4, marginTop: 0 }}>
              {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Agregar cuenta'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
