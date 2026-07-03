import { createClient } from 'jsr:@supabase/supabase-js@2'

// Ingesta genérica de notificaciones de APPS BANCARIAS (Banco Ripley, Santander, ...).
// Flujo: MacroDroid (Notification Received, apps de banco) -> POST {app,title,text,postTime}.
// Se prueban parsers por banco/tipo; lo que ningún parser entiende queda en `ingest_failures`
// (reason 'no_parser') para escribir el parser con el payload real — iteración sin pantallazos.
// Auth: header `x-ingest-secret` contra tabla `ingest_config` (igual que wallet-ingest).
//
// Dedup entre fuentes: una compra NFC la notifican Wallet Y la app del banco. Antes de
// insertar se busca un movimiento del mismo perfil por el mismo monto en los últimos 15
// minutos (sin comparar nombre: cada fuente escribe el comercio distinto).

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

function nameTokens(s: unknown): string[] {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(t => t.length >= 3)
}
function normBank(s: unknown): string {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\b(banco|de|del|la|el|cuenta|corriente|vista|ahorro|cl|sa|s\.a\.)\b/g, '').replace(/[^a-z0-9]/g, '')
}

type Parsed =
  | {
      parser: string
      kind: 'gasto'
      merchant: string
      amt: number
      last4: string | null
      cardName: string | null
      dateStr: string | null // fecha de la operación si la notificación la trae
    }
  | {
      parser: string
      kind: 'trf_recibida'
      amt: number
      senderName: string
      senderBank: string | null
      destBankHint: string // banco dueño de la app que notificó (destino del dinero)
      dateStr: string | null
    }

type ParserFn = (title: string, text: string) => Parsed | null

const parsers: ParserFn[] = [
  // Banco Ripley — compra con tarjeta (NFC, web, suscripciones)
  // título: "Compraste $22.428 en ANTHROPIC* CLAUDE SUB"
  // cuerpo: "Con tu Tarjeta Banco Ripley Mastercard Black terminada en 5116 el 02/07/2026 a las 22:23"
  (title, text) => {
    const m = title.match(/Compraste\s*\$\s*([\d.,]+)\s+en\s+(.+)/i)
    if (!m) return null
    const amt = parseInt(m[1].replace(/[^0-9]/g, ''), 10)
    const merchant = m[2].replace(/\s+/g, ' ').trim()
    const last4 = (text.match(/terminada\s+en\s+(\d{4})/i) ?? [])[1] ?? null
    const cardName = (text.match(/Con\s+tu\s+Tarjeta\s+(.+?)\s+terminada/i) ?? [])[1] ?? null
    const d = text.match(/el\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/)
    const dateStr = d ? `${d[3]}-${d[2].padStart(2, '0')}-${d[1].padStart(2, '0')}` : null
    return { parser: 'ripley_compra', kind: 'gasto', merchant, amt, last4, cardName, dateStr }
  },
  // Banco Ripley — transferencia recibida
  // título: "Transferencia recibida por $300.000"
  // cuerpo: "Has recibido una transferencia por $300.000 de Marcelo Segundo Moya desde el BANCO CHILE el 03/07/2026 a las 01:11."
  (title, text) => {
    if (!/Transferencia recibida/i.test(title)) return null
    const m = text.match(/Has recibido una transferencia por\s*\$\s*([\d.,]+)\s+de\s+(.+?)\s+desde\s+(?:el\s+)?(.+?)\s+el\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/i)
    if (!m) return null
    const amt = parseInt(m[1].replace(/[^0-9]/g, ''), 10)
    const dateStr = `${m[6]}-${m[5].padStart(2, '0')}-${m[4].padStart(2, '0')}`
    return {
      parser: 'ripley_trf_recibida', kind: 'trf_recibida', amt,
      senderName: m[2].trim(), senderBank: m[3].trim(), destBankHint: 'ripley', dateStr,
    }
  },
]

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const sb = createClient(SUPABASE_URL, SERVICE_KEY)

  async function logFailure(reason: string, payload: unknown, raw?: string) {
    console.error(`notif-ingest ${reason}:`, raw ?? JSON.stringify(payload))
    await sb.from('ingest_failures').insert({
      fn: 'notif-ingest', reason, payload: payload ?? null, raw: raw ?? null,
    })
  }

  // 1) Auth por header secreto
  const provided = req.headers.get('x-ingest-secret') ?? ''
  const { data: cfg } = await sb.from('ingest_config').select('secret').eq('id', 1).single()
  if (!cfg || provided !== cfg.secret) return json({ error: 'unauthorized' }, 401)

  // 2) Body
  const rawBody = await req.text()
  let body: Record<string, unknown>
  try { body = JSON.parse(rawBody) } catch {
    await logFailure('bad_json', null, rawBody)
    return json({ error: 'bad_json' }, 400)
  }

  const app = String(body.app ?? '').trim()
  const title = String(body.title ?? '').trim()
  const text = String(body.text ?? '').trim()
  const postTime = body.postTime ? Number(body.postTime) : null

  // 3) Probar parsers en orden
  let parsed: Parsed | null = null
  for (const p of parsers) {
    parsed = p(title, text)
    if (parsed) break
  }
  if (!parsed || isNaN(parsed.amt) || parsed.amt <= 0) {
    // Notificación bancaria sin parser aún (transferencia entrante, marketing, etc.)
    await logFailure('no_parser', { app, title, text, postTime })
    return json({ ok: false, reason: 'no_parser' })
  }

  const when = postTime && Number.isFinite(postTime) ? new Date(postTime) : new Date()
  const dateStr = parsed.dateStr ?? chileDate(when)
  const month = dateStr.slice(0, 7) + '-01'

  // === Rama TRANSFERENCIA RECIBIDA (notificación del banco destino) ===
  // Interna (remitente = tú): la ignora — el pipeline de Gmail la registra completa
  // desde el mail del banco de ORIGEN (2 patas). Insertar aquí la duplicaría.
  // De tercero: esta notificación es la ÚNICA fuente (el banco del tercero no te avisa
  // y Ripley no manda mail) → se inserta como ingreso.
  if (parsed.kind === 'trf_recibida') {
    const { amt, senderName, senderBank, destBankHint } = parsed

    const { data: prof } = await sb.from('profiles')
      .select('id, full_name, name').eq('role', 'Admin').limit(1).single()
    if (!prof) return json({ error: 'no_profile' }, 500)
    const profileId = prof.id as string
    const profileTokens = new Set([...nameTokens(prof.full_name), ...nameTokens(prof.name)])
    const senderIsYou = nameTokens(senderName).filter(t => profileTokens.has(t)).length >= 2

    if (senderIsYou) {
      return json({ ok: true, inserted: false, reason: 'internal_gmail_handles', sender: senderName })
    }

    // Dedup: mismo monto (+) el mismo día para el perfil, cualquier fuente
    const { data: dup } = await sb.from('transactions')
      .select('id, source')
      .eq('profile_id', profileId)
      .eq('amount', amt)
      .eq('date', dateStr)
      .limit(1)
    if (dup && dup.length > 0) {
      return json({ ok: true, inserted: false, reason: 'duplicate', existing_source: dup[0].source })
    }

    // Cuenta destino: cuenta de depósito (no TC) del banco que notificó
    const { data: accts } = await sb.from('accounts')
      .select('id, balance, bank, name, type').eq('profile_id', profileId)
    const destAcc = (accts ?? []).find(a =>
      a.type !== 'Crédito' && (normBank(a.bank).includes(destBankHint) || normBank(a.name).includes(destBankHint))
    ) ?? null

    const { data: ins, error: insErr } = await sb.from('transactions').insert({
      profile_id: profileId,
      name: `Transferencia de ${senderName}`,
      amount: amt,
      type: 'ingreso',
      category_id: null,
      account_id: destAcc?.id ?? null,
      description: senderBank ? `desde ${senderBank}` : null,
      source: 'bank_app',
      date: dateStr,
    }).select('id').single()
    if (insErr) return json({ error: 'insert_failed', detail: insErr.message }, 500)

    if (destAcc) {
      await sb.from('accounts').update({ balance: destAcc.balance + amt }).eq('id', destAcc.id)
    }

    return json({
      ok: true, inserted: true, id: ins.id, parser: parsed.parser,
      sender: senderName, amount: amt, account_matched: !!destAcc, date: dateStr,
    })
  }

  // === Rama GASTO (compra con tarjeta) ===
  const { merchant, amt, last4, cardName } = parsed

  // 4) Resolver PERFIL y CUENTA por last4 (misma lógica que wallet-ingest)
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
  if (!profileId) {
    const { data: prof } = await sb.from('profiles').select('id').eq('role', 'Admin').limit(1).single()
    if (!prof) return json({ error: 'no_profile' }, 500)
    profileId = prof.id
  }

  // 5) Dedup entre fuentes: mismo perfil + mismo monto en los últimos 15 min
  //    (sin comparar nombre: Wallet y la app del banco escriben el comercio distinto)
  const windowAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString()
  const { data: dup } = await sb.from('transactions')
    .select('id, source')
    .eq('profile_id', profileId)
    .eq('amount', -amt)
    .gte('created_at', windowAgo)
    .limit(1)
  if (dup && dup.length > 0) {
    return json({ ok: true, inserted: false, reason: 'duplicate', existing_source: dup[0].source })
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
    source: 'bank_app',
    date: dateStr,
  }).select('id').single()

  if (insErr) return json({ error: 'insert_failed', detail: insErr.message }, 500)

  // 8) Si es TC, aumentar deuda (balance baja en el monto gastado)
  if (accountId) {
    await sb.from('accounts').update({ balance: accountBalance - amt }).eq('id', accountId)
  }

  return json({
    ok: true,
    inserted: true,
    id: ins.id,
    parser: parsed.parser,
    merchant,
    amount: amt,
    last4,
    profile_id: profileId,
    account_matched: !!accountId,
    category_matched: !!categoryId,
    date: dateStr,
  })
})
