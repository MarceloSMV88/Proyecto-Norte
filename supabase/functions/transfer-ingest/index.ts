import { createClient } from 'jsr:@supabase/supabase-js@2'

// Ingesta de transferencias bancarias desde Gmail (Santander, Banco de Chile, Banco Ripley).
// Clasifica por cuenta(account_number) -> RUT -> nombre(>=2 tokens) -> hints originMine/destMine.
//   interna (ambas tuyas) -> 2 movimientos: origen (-) y destino (+)
//   recibida de tercero -> 'ingreso' (+) · enviada a tercero -> 'gasto' (-)
// Match por nombre de banco solo en cuentas de depósito (no TC) y solo si el endpoint es tuyo.
// Dedup cross-bank: fecha + monto + (cuenta compartida | mismo par de bancos | mismo txnId).

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
const digits = (s: unknown) => String(s ?? '').replace(/\D/g, '')
function normBank(s: unknown): string {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\b(banco|de|del|la|el|cuenta|corriente|vista|ahorro|cl|sa|s\.a\.)\b/g, '').replace(/[^a-z0-9]/g, '')
}
function nameTokens(s: unknown): string[] {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(t => t.length >= 3)
}
function chileDate(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}
function normDate(s: unknown): string {
  const str = String(s ?? '').trim()
  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})/); if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const dmy = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  return chileDate(new Date())
}
function tokens(desc: string) {
  const g = (k: string) => (desc.match(new RegExp(`#${k}:([^\\s]*)`)) ?? [])[1] ?? ''
  return { oa: g('oa'), da: g('da'), ob: g('ob'), db: g('db'), tx: g('tx') }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  const sb = createClient(SUPABASE_URL, SERVICE_KEY)
  const provided = req.headers.get('x-ingest-secret') ?? ''
  const { data: cfg } = await sb.from('ingest_config').select('secret').eq('id', 1).single()
  if (!cfg || provided !== cfg.secret) return json({ error: 'unauthorized' }, 401)
  let b: Record<string, unknown>
  try { b = await req.json() } catch { return json({ error: 'bad_json' }, 400) }

  const amount = parseInt(digits(b.amount), 10)
  if (!amount || amount <= 0) return json({ error: 'bad_amount', got: b.amount }, 400)
  const dateStr = normDate(b.date)
  const originRut = digits(b.originRut)
  const destRut = digits(b.destRut)
  let originAcctD = digits(b.originAccount)
  const destAcctD = digits(b.destAccount)
  // Guard: si el parser conflació origen y destino al mismo número, no confiar en el de origen
  if (originAcctD && originAcctD === destAcctD) originAcctD = ''
  const originBankRaw = String(b.originBank ?? '').trim()
  const destBankRaw = String(b.destBank ?? '').trim()
  const originBankN = normBank(originBankRaw)
  const destBankN = normBank(destBankRaw)
  const originName = String(b.originName ?? '').trim()
  const destName = String(b.destName ?? '').trim()
  const comment = String(b.comment ?? '').trim()
  const txnId = String(b.txnId ?? '').trim().replace(/\s+/g, '')
  const originMine = b.originMine === true
  const destMine = b.destMine === true

  const { data: adminProf } = await sb.from('profiles').select('id, rut, full_name, name').eq('role', 'Admin').limit(1).single()
  if (!adminProf) return json({ error: 'no_profile' }, 500)
  const profileId = adminProf.id as string
  const profileRut = digits(adminProf.rut)
  const profileTokens = new Set([...nameTokens(adminProf.full_name), ...nameTokens(adminProf.name)])
  const nameYou = (n: string) => nameTokens(n).filter(t => profileTokens.has(t)).length >= 2

  const { data: accts } = await sb.from('accounts').select('id, balance, account_number, bank, name, type').eq('profile_id', profileId)
  const byNumber = (d: string) => d ? ((accts ?? []).find(a => a.account_number && digits(a.account_number) === d) ?? null) : null
  const byBank = (bn: string) => {
    if (!bn || bn.length < 3) return null
    return (accts ?? []).find(a => { if (a.type === 'Crédito') return false; const ab = normBank(a.bank), an = normBank(a.name); return ab === bn || an === bn || ab.includes(bn) || an.includes(bn) }) ?? null
  }

  const isOriginYou = originMine || (!!profileRut && originRut === profileRut) || !!byNumber(originAcctD) || nameYou(originName)
  const isDestYou = destMine || (!!profileRut && destRut === profileRut) || !!byNumber(destAcctD) || nameYou(destName)
  const originAcc = byNumber(originAcctD) || (isOriginYou ? byBank(originBankN) : null)
  const destAcc = byNumber(destAcctD) || (isDestYou ? byBank(destBankN) : null)

  let txType: 'transfer' | 'ingreso' | 'gasto'
  if (isOriginYou && isDestYou) txType = 'transfer'
  else if (isDestYou && !isOriginYou) txType = 'ingreso'
  else if (isOriginYou && !isDestYou) txType = 'gasto'
  else txType = 'transfer'

  // Dedup cross-bank
  const { data: cands } = await sb.from('transactions').select('id, description')
    .eq('profile_id', profileId).eq('source', 'gmail_transfer').eq('date', dateStr).or(`amount.eq.${-amount},amount.eq.${amount}`)
  const newAccts = [originAcctD, destAcctD].filter(Boolean)
  const newPair = [originBankN, destBankN].filter(Boolean).sort().join('|')
  for (const c of (cands ?? [])) {
    const t = tokens(String(c.description ?? ''))
    const exAccts = [t.oa, t.da].filter(Boolean)
    const sharesAcct = newAccts.some(a => exAccts.includes(a))
    const exPair = [t.ob, t.db].filter(Boolean).sort().join('|')
    const samePair = newPair && exPair && newPair === exPair
    const sameTx = txnId && t.tx && txnId === t.tx
    if (sharesAcct || samePair || sameTx) return json({ ok: true, inserted: false, reason: 'duplicate', matched: c.id })
  }

  const description = `${comment ? comment + ' ' : ''}#oa:${originAcctD} #da:${destAcctD} #ob:${originBankN} #db:${destBankN} #tx:${txnId}`.trim()

  // Patas (legs): interna => 2 movimientos (origen - / destino +)
  type Leg = { account_id: string | null; amount: number; name: string }
  const legs: Leg[] = []
  if (txType === 'transfer') {
    if (originAcc) legs.push({ account_id: originAcc.id, amount: -amount, name: `Transferencia a ${destBankRaw || destName || 'mis cuentas'}` })
    if (destAcc) legs.push({ account_id: destAcc.id, amount: amount, name: `Transferencia desde ${originBankRaw || originName || 'mis cuentas'}` })
    if (legs.length === 0) legs.push({ account_id: null, amount: -amount, name: `Transferencia ${originName || ''} → ${destName || ''}`.trim() })
  } else if (txType === 'ingreso') {
    legs.push({ account_id: destAcc?.id ?? null, amount: amount, name: `Transferencia de ${originName || 'tercero'}` })
  } else {
    legs.push({ account_id: originAcc?.id ?? null, amount: -amount, name: `Transferencia a ${destName || 'tercero'}` })
  }

  const rows = legs.map(l => ({ profile_id: profileId, name: l.name, amount: l.amount, type: txType, category_id: null, account_id: l.account_id, description, source: 'gmail_transfer', date: dateStr }))
  const { data: ins, error: insErr } = await sb.from('transactions').insert(rows).select('id')
  if (insErr) return json({ error: 'insert_failed', detail: insErr.message }, 500)

  // Mover saldos (una vez). Guard: misma cuenta => no-op
  const sameAccount = originAcc && destAcc && originAcc.id === destAcc.id
  if (!sameAccount) {
    if (txType === 'transfer') {
      if (originAcc) await sb.from('accounts').update({ balance: originAcc.balance - amount }).eq('id', originAcc.id)
      if (destAcc) await sb.from('accounts').update({ balance: destAcc.balance + amount }).eq('id', destAcc.id)
    } else if (txType === 'ingreso' && destAcc) {
      await sb.from('accounts').update({ balance: destAcc.balance + amount }).eq('id', destAcc.id)
    } else if (txType === 'gasto' && originAcc) {
      await sb.from('accounts').update({ balance: originAcc.balance - amount }).eq('id', originAcc.id)
    }
  }

  return json({ ok: true, inserted: true, legs: (ins ?? []).length, ids: (ins ?? []).map(r => r.id), classification: txType, amount, date: dateStr, origin_matched: !!originAcc, dest_matched: !!destAcc })
})
