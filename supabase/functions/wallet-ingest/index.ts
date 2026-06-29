import { createClient } from 'jsr:@supabase/supabase-js@2'

// Ingesta de gastos con tarjeta desde notificaciones de Google Wallet.
// Flujo: MacroDroid (Android) -> POST aquí -> parsea -> inserta transaction + sube deuda TC.
// Auth: header `x-ingest-secret` comparado contra tabla `ingest_config` (no JWT).

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// Fecha local de Chile en formato YYYY-MM-DD
function chileDate(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d)
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const sb = createClient(SUPABASE_URL, SERVICE_KEY)

  // 1) Auth por header secreto
  const provided = req.headers.get('x-ingest-secret') ?? ''
  const { data: cfg } = await sb.from('ingest_config').select('secret').eq('id', 1).single()
  if (!cfg || provided !== cfg.secret) return json({ error: 'unauthorized' }, 401)

  // 2) Body
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return json({ error: 'bad_json' }, 400) }

  const title = String(body.title ?? '').trim()
  const text = String(body.text ?? '').trim()
  const postTime = body.postTime ? Number(body.postTime) : null

  // 3) Parseo (formato Google Wallet: título=comercio, cuerpo="CLP1,500 with <tarjeta> ••5116")
  const merchant = title.replace(/\s+/g, ' ').trim()
  const amountMatch = text.match(/CLP\s*([\d.,]+)/i)
  const amt = amountMatch ? parseInt(amountMatch[1].replace(/[^0-9]/g, ''), 10) : NaN
  const last4 = (text.match(/(\d{4})(?=\D*$)/) ?? [])[1] ?? null
  const cardName = (text.match(/with\s+(.+?)\s+[••·*]{1,2}\s*\d{4}/i) ?? [])[1] ?? null

  if (!merchant || isNaN(amt) || amt <= 0) {
    return json({ error: 'parse_failed', merchant, amt, raw: { title, text } }, 400)
  }

  const when = postTime ? new Date(postTime) : new Date()
  const dateStr = chileDate(when)
  const month = dateStr.slice(0, 7) + '-01'

  // 4) Resolver PERFIL y CUENTA a partir del last4 de la tarjeta.
  //    Cada TC pertenece a un perfil -> el pago se atribuye al dueño de la tarjeta (aislación por perfil).
  let profileId: string | null = null
  let accountId: string | null = null
  let accountBalance = 0
  if (last4) {
    const { data: acc } = await sb.from('accounts')
      .select('id, balance, profile_id')
      .eq('last4', last4)
      .limit(1)
      .maybeSingle()
    if (acc) { accountId = acc.id; accountBalance = acc.balance; profileId = acc.profile_id }
  }
  // Fallback: tarjeta no registrada -> perfil Admin (single-user), sin cuenta asociada.
  if (!profileId) {
    const { data: prof } = await sb.from('profiles').select('id').eq('role', 'Admin').limit(1).single()
    if (!prof) return json({ error: 'no_profile' }, 500)
    profileId = prof.id
  }

  // 5) Dedup: misma compra (comercio+monto) en los últimos 5 minutos, dentro del mismo perfil
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  const { data: dup } = await sb.from('transactions')
    .select('id')
    .eq('profile_id', profileId)
    .eq('name', merchant)
    .eq('amount', -amt)
    .gte('created_at', fiveMinAgo)
    .limit(1)
  if (dup && dup.length > 0) {
    return json({ ok: true, inserted: false, reason: 'duplicate' })
  }

  // 6) Categoría por regla comercio -> nombre -> category del mes (del mismo perfil)
  let categoryId: string | null = null
  const { data: rules } = await sb.from('category_rules')
    .select('pattern, category_name')
    .eq('profile_id', profileId)
  if (rules) {
    const up = merchant.toUpperCase()
    const match = rules
      .filter(r => up.includes(String(r.pattern).toUpperCase()))
      .sort((a, b) => String(b.pattern).length - String(a.pattern).length)[0]
    if (match) {
      const { data: cat } = await sb.from('categories')
        .select('id')
        .eq('profile_id', profileId)
        .eq('name', match.category_name)
        .eq('month', month)
        .limit(1)
        .maybeSingle()
      if (cat) categoryId = cat.id
    }
  }

  // 7) Insertar movimiento (gasto)
  const { data: ins, error: insErr } = await sb.from('transactions').insert({
    profile_id: profileId,
    name: merchant,
    amount: -amt,
    type: 'gasto',
    category_id: categoryId,
    account_id: accountId,
    description: cardName,
    source: 'google_wallet',
    date: dateStr,
  }).select('id').single()

  if (insErr) return json({ error: 'insert_failed', detail: insErr.message }, 500)

  // 8) Aumentar deuda de la TC (balance baja en el monto gastado)
  if (accountId) {
    await sb.from('accounts').update({ balance: accountBalance - amt }).eq('id', accountId)
  }

  return json({
    ok: true,
    inserted: true,
    id: ins.id,
    merchant,
    amount: amt,
    last4,
    profile_id: profileId,
    account_matched: !!accountId,
    category_matched: !!categoryId,
    date: dateStr,
  })
})
