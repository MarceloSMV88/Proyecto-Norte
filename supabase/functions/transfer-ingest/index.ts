import { createClient } from 'jsr:@supabase/supabase-js@2'

// Ingesta de transferencias bancarias desde Gmail (Google Apps Script -> aquí).
// Clasifica por coincidencia de cuenta (account_number) + RUT del perfil:
//   - origen y destino son tuyos  -> 'transfer' (movimiento interno, mueve ambos saldos)
//   - destino tuyo, origen tercero -> 'ingreso'
//   - origen tuyo, destino tercero -> 'gasto'
// Dedup: monto + fecha + N° cuenta destino (los 2 correos del mismo transfer colapsan en 1).

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const digits = (s: unknown) => String(s ?? '').replace(/\D/g, '')

function chileDate(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

// Normaliza fecha: acepta ISO (YYYY-MM-DD) o DD/MM/YYYY
function normDate(s: unknown): string {
  const str = String(s ?? '').trim()
  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const dmy = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  return chileDate(new Date())
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  const sb = createClient(SUPABASE_URL, SERVICE_KEY)

  // 1) Auth
  const provided = req.headers.get('x-ingest-secret') ?? ''
  const { data: cfg } = await sb.from('ingest_config').select('secret').eq('id', 1).single()
  if (!cfg || provided !== cfg.secret) return json({ error: 'unauthorized' }, 401)

  // 2) Body (JSON estructurado desde Apps Script)
  let b: Record<string, unknown>
  try { b = await req.json() } catch { return json({ error: 'bad_json' }, 400) }

  const amount = parseInt(digits(b.amount), 10)
  if (!amount || amount <= 0) return json({ error: 'bad_amount', got: b.amount }, 400)
  const dateStr = normDate(b.date)

  const originRut = digits(b.originRut)
  const destRut = digits(b.destRut)
  const originAcctD = digits(b.originAccount)
  const destAcctD = digits(b.destAccount)
  const originName = String(b.originName ?? '').trim()
  const destName = String(b.destName ?? '').trim()
  const comment = String(b.comment ?? '').trim() || null

  // 3) Perfil (single-user admin)
  const { data: adminProf } = await sb.from('profiles').select('id, rut').eq('role', 'Admin').limit(1).single()
  if (!adminProf) return json({ error: 'no_profile' }, 500)
  const profileId = adminProf.id as string
  const profileRut = digits(adminProf.rut)

  // 4) Cuentas del perfil para matchear por N°
  const { data: accts } = await sb.from('accounts')
    .select('id, balance, account_number')
    .eq('profile_id', profileId)
  const matchAcct = (acctDigits: string) => {
    if (!acctDigits) return null
    return (accts ?? []).find(a => a.account_number && digits(a.account_number) === acctDigits) ?? null
  }
  const originAcc = matchAcct(originAcctD)
  const destAcc = matchAcct(destAcctD)

  // 5) ¿Origen/destino soy yo?
  const isOriginYou = (!!profileRut && originRut === profileRut) || !!originAcc
  const isDestYou = (!!profileRut && destRut === profileRut) || !!destAcc

  // 6) Clasificación
  let txType: 'transfer' | 'ingreso' | 'gasto'
  let signedAmount: number
  let accountId: string | null
  let name: string
  if (isOriginYou && isDestYou) {
    txType = 'transfer'; signedAmount = -amount; accountId = originAcc?.id ?? destAcc?.id ?? null
    name = `Transferencia a ${destName || 'mis cuentas'}`
  } else if (isDestYou && !isOriginYou) {
    txType = 'ingreso'; signedAmount = amount; accountId = destAcc?.id ?? null
    name = `Transferencia de ${originName || 'tercero'}`
  } else if (isOriginYou && !isDestYou) {
    txType = 'gasto'; signedAmount = -amount; accountId = originAcc?.id ?? null
    name = `Transferencia a ${destName || 'tercero'}`
  } else {
    txType = 'transfer'; signedAmount = -amount; accountId = null
    name = `Transferencia ${originName || ''} → ${destName || ''}`.trim()
  }

  // 7) Dedup: una sola transacción aunque lleguen 2 correos (emisor + receptor).
  const { data: dup } = await sb.from('transactions')
    .select('id')
    .eq('profile_id', profileId)
    .eq('amount', signedAmount)
    .eq('date', dateStr)
    .eq('source', 'gmail_transfer')
    .ilike('description', `%${destAcctD}%`)
    .limit(1)
  if (dup && dup.length > 0) return json({ ok: true, inserted: false, reason: 'duplicate' })

  // 8) Insert
  const description = [comment, destAcctD ? `dest:${destAcctD}` : '', originAcctD ? `orig:${originAcctD}` : '']
    .filter(Boolean).join(' · ')
  const { data: ins, error: insErr } = await sb.from('transactions').insert({
    profile_id: profileId,
    name,
    amount: signedAmount,
    type: txType,
    category_id: null,
    account_id: accountId,
    description,
    source: 'gmail_transfer',
    date: dateStr,
  }).select('id').single()
  if (insErr) return json({ error: 'insert_failed', detail: insErr.message }, 500)

  // 9) Mover saldos (una sola vez)
  if (txType === 'transfer') {
    if (originAcc) await sb.from('accounts').update({ balance: originAcc.balance - amount }).eq('id', originAcc.id)
    if (destAcc) await sb.from('accounts').update({ balance: destAcc.balance + amount }).eq('id', destAcc.id)
  } else if (txType === 'ingreso' && destAcc) {
    await sb.from('accounts').update({ balance: destAcc.balance + amount }).eq('id', destAcc.id)
  } else if (txType === 'gasto' && originAcc) {
    await sb.from('accounts').update({ balance: originAcc.balance - amount }).eq('id', originAcc.id)
  }

  return json({
    ok: true, inserted: true, id: ins.id, classification: txType, amount, date: dateStr,
    origin_matched: !!originAcc, dest_matched: !!destAcc, isOriginYou, isDestYou,
  })
})
