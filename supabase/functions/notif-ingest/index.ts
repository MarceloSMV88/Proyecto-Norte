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
const digits = (s: unknown) => String(s ?? '').replace(/\D/g, '')
// Los bancos escriben la misma cuenta con o sin ceros a la izquierda (00-407-01867-01 vs 4070186701)
const acctKey = (d: string) => d.replace(/^0+/, '')

type Parsed =
  | {
      parser: string
      kind: 'gasto'
      merchant: string
      amt: number
      last4: string | null
      cardName: string | null
      dateStr: string | null // fecha de la operación si la notificación la trae
      bankHint?: string // si el last4 no matchea ninguna cuenta, buscar por banco (TC única de ese banco)
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
  | {
      parser: string
      kind: 'pago_tc'
      amt: number
      last4: string        // tarjeta que se paga (destino del abono)
      originBankHint: string // banco de la cuenta corriente de origen (mismo banco por defecto)
      dateStr: string | null
    }
  | {
      parser: string
      kind: 'trf_recibida_cuenta'
      amt: number
      destAccount: string  // n° de cuenta destino (la notificación no trae nombre del remitente)
      dateStr: string | null
      timeStr: string | null // hh:mm:ss de la notificación — distingue transferencias del mismo monto el mismo día
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
  // Banco Ripley — PAGO de la tarjeta de crédito (desde cuenta corriente).
  // título: "Pago por $1.847.199 a tu Tarjeta Ripley"
  // cuerpo: "Has realizado un pago por $1.847.199 a tu Tarjeta Ripley terminada en 5116 el 03/07/2026 a las 13:55."
  // Es una transferencia interna (cta cte -> TC), NO un gasto: abona la TC (baja la deuda) y descuenta la cuenta.
  (title, text) => {
    const m = text.match(/Has realizado un pago por\s*\$\s*([\d.,]+)\s+a\s+tu\s+Tarjeta[^]*?terminada\s+en\s+(\d{4})\s+el\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/i)
    if (!m) return null
    const amt = parseInt(m[1].replace(/[^0-9]/g, ''), 10)
    const dateStr = `${m[5]}-${m[4].padStart(2, '0')}-${m[3].padStart(2, '0')}`
    return { parser: 'ripley_pago_tc', kind: 'pago_tc', amt, last4: m[2], originBankHint: 'ripley', dateStr }
  },
  // Banco Santander — compra con Tarjeta de Crédito.
  // cuerpo: "Transacción por $ 1.790. se realizó una compra con tu Tarjeta de Crédito
  // ****1147 en SERVICIOS Y COMERCIAL, el 01-07-2026 a las 16:38:41."
  // Ojo: el número enmascarado que muestra esta notificación (ej. 1147) no siempre coincide
  // con el last4 real guardado en la cuenta (ej. 2838) — por eso lleva bankHint como respaldo.
  (title, text) => {
    const m = text.match(/Transacci[oó]n por\s*\$\s*([\d.,]+)\.?\s+se realiz[oó] una compra con tu Tarjeta de Cr[eé]dito\s*\**(\d{3,4})\s+en\s+(.+?),\s+el\s+(\d{1,2})-(\d{1,2})-(\d{4})/i)
    if (!m) return null
    const amt = parseInt(m[1].replace(/[^0-9]/g, ''), 10)
    const merchant = m[3].replace(/\s+/g, ' ').trim()
    const dateStr = `${m[6]}-${m[5].padStart(2, '0')}-${m[4].padStart(2, '0')}`
    return { parser: 'santander_compra', kind: 'gasto', merchant, amt, last4: m[2], cardName: null, dateStr, bankHint: 'santander' }
  },
  // Banco Santander — transferencia recibida (formato minimal, SIN nombre del remitente).
  // cuerpo: "El 05-07-2026 12:14:06 se realizó una Transferencia hacia tu cuenta 000062610654
  // por $ 40.000." — al no traer quién envía, se resuelve por N° de cuenta destino. La HORA
  // exacta (hh:mm:ss) se captura para el dedup: es lo único que distingue dos transferencias
  // legítimas del mismo monto el mismo día (ej. varios amigos pagando la misma cuota).
  (title, text) => {
    const m = text.match(/El\s+(\d{1,2})-(\d{1,2})-(\d{4})\s+([\d:]+)\s+se realiz[oó] una Transferencia hacia tu cuenta\s+(\d+)\s+por\s*\$\s*([\d.,]+)/i)
    if (!m) return null
    const dateStr = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
    const amt = parseInt(m[6].replace(/[^0-9]/g, ''), 10)
    return { parser: 'santander_trf_recibida', kind: 'trf_recibida_cuenta', amt, destAccount: m[5], dateStr, timeStr: m[4] }
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

  // === Rama PAGO DE TARJETA DE CRÉDITO (cta cte -> TC, transferencia interna) ===
  // NO es gasto (el gasto ya se registró al usar la tarjeta): abona la TC (sube el balance
  // hacia 0, baja la deuda) y descuenta la cuenta corriente de origen. 2 patas type 'transfer'.
  if (parsed.kind === 'pago_tc') {
    const { amt, last4, originBankHint } = parsed

    // Destino: la TC por last4 (define el perfil)
    const { data: card } = await sb.from('accounts')
      .select('id, profile_id').eq('last4', last4).limit(1).maybeSingle()
    let profileId = card?.profile_id ?? null
    if (!profileId) {
      const { data: prof } = await sb.from('profiles').select('id').eq('role', 'Admin').limit(1).single()
      if (!prof) return json({ error: 'no_profile' }, 500)
      profileId = prof.id
    }

    // Dedup: mismo abono (+amt) a la TC en la misma fecha
    if (card) {
      const { data: dup } = await sb.from('transactions').select('id')
        .eq('profile_id', profileId).eq('account_id', card.id).eq('amount', amt).eq('date', dateStr).limit(1)
      if (dup && dup.length > 0) return json({ ok: true, inserted: false, reason: 'duplicate' })
    }

    // Origen: cuenta de depósito (no TC) del mismo banco (por defecto se paga desde ahí)
    const { data: accts } = await sb.from('accounts')
      .select('id, bank, name, type').eq('profile_id', profileId)
    const origin = (accts ?? []).find(a =>
      a.type !== 'Crédito' && (normBank(a.bank).includes(originBankHint) || normBank(a.name).includes(originBankHint))
    ) ?? null

    // Patas (el trigger de BD mueve los saldos): TC +amt (baja deuda), cta cte -amt
    const rows: Record<string, unknown>[] = []
    if (card) rows.push({ profile_id: profileId, name: 'Pago TC Ripley', amount: amt, type: 'transfer', category_id: null, account_id: card.id, description: origin ? `desde ${origin.name}` : null, source: 'bank_app', date: dateStr })
    if (origin) rows.push({ profile_id: profileId, name: 'Pago TC Ripley', amount: -amt, type: 'transfer', category_id: null, account_id: origin.id, description: 'Pago de tarjeta', source: 'bank_app', date: dateStr })
    if (rows.length === 0) return json({ ok: false, reason: 'no_accounts' })

    const { data: ins, error: insErr } = await sb.from('transactions').insert(rows).select('id')
    if (insErr) return json({ error: 'insert_failed', detail: insErr.message }, 500)

    return json({ ok: true, inserted: true, parser: parsed.parser, kind: 'pago_tc', legs: (ins ?? []).length, amount: amt, card_matched: !!card, origin_matched: !!origin, date: dateStr })
  }

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

    // Dedup: misma transferencia re-notificada = mismo REMITENTE + monto + fecha (2026-07-08:
    // antes era monto+fecha contra cualquier fuente y descartaba transferencias legítimas de
    // remitentes distintos por el mismo monto el mismo día). Limitación aceptada: el mismo
    // remitente enviando 2 veces el mismo monto el mismo día sí se dedupea.
    const { data: dup } = await sb.from('transactions')
      .select('id, source')
      .eq('profile_id', profileId)
      .eq('amount', amt)
      .eq('date', dateStr)
      .eq('name', `Transferencia de ${senderName}`)
      .limit(1)
    if (dup && dup.length > 0) {
      return json({ ok: true, inserted: false, reason: 'duplicate', existing_source: dup[0].source })
    }

    // Cuenta destino: cuenta de depósito (no TC) del banco que notificó
    const { data: accts } = await sb.from('accounts')
      .select('id, bank, name, type').eq('profile_id', profileId)
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

    // El saldo lo sincroniza el trigger de BD (migración 006).

    return json({
      ok: true, inserted: true, id: ins.id, parser: parsed.parser,
      sender: senderName, amount: amt, account_matched: !!destAcc, date: dateStr,
    })
  }

  // === Rama TRANSFERENCIA RECIBIDA por N° de cuenta (sin nombre del remitente, ej. Santander) ===
  // Se resuelve la cuenta por número exacto (no por banco). Dedup v2 (2026-07-08): antes era
  // monto+fecha contra cualquier fuente y se COMÍA transferencias legítimas del mismo monto
  // el mismo día (5 amigos pagando la misma cuota → entraba solo la primera). Ahora:
  //   - misma notificación re-entregada: ya existe fila con el mismo token #nt (fecha+hora exacta)
  //   - transferencia propia ya registrada por Gmail: fila gmail_transfer mismo monto y fecha
  //     (el mail del banco de origen no trae hora → se mantiene el match por fecha solo ahí)
  if (parsed.kind === 'trf_recibida_cuenta') {
    const { amt, destAccount, dateStr, timeStr } = parsed

    const { data: prof } = await sb.from('profiles').select('id').eq('role', 'Admin').limit(1).single()
    if (!prof) return json({ error: 'no_profile' }, 500)
    const profileId = prof.id as string

    const ntToken = timeStr ? `#nt:${dateStr} ${timeStr}` : null
    const { data: dups } = await sb.from('transactions')
      .select('id, source, description')
      .eq('profile_id', profileId)
      .eq('amount', amt)
      .eq('date', dateStr)
    const dupHit = (dups ?? []).find(d =>
      d.source === 'gmail_transfer' || (ntToken && String(d.description ?? '').includes(ntToken))
    )
    if (dupHit) {
      return json({ ok: true, inserted: false, reason: 'duplicate', existing_source: dupHit.source })
    }

    const { data: accts } = await sb.from('accounts').select('id, account_number').eq('profile_id', profileId)
    const k = acctKey(digits(destAccount))
    const destAcc = k ? ((accts ?? []).find(a => a.account_number && acctKey(digits(a.account_number)) === k) ?? null) : null

    const { data: ins, error: insErr } = await sb.from('transactions').insert({
      profile_id: profileId,
      name: 'Transferencia recibida',
      amount: amt,
      type: 'ingreso',
      category_id: null,
      account_id: destAcc?.id ?? null,
      description: ntToken,
      source: 'bank_app',
      date: dateStr,
    }).select('id').single()
    if (insErr) return json({ error: 'insert_failed', detail: insErr.message }, 500)

    // El saldo lo sincroniza el trigger de BD (migración 006).

    return json({
      ok: true, inserted: true, id: ins.id, parser: parsed.parser,
      amount: amt, account_matched: !!destAcc, date: dateStr,
    })
  }

  // === Rama GASTO (compra con tarjeta) ===
  const { merchant, amt, last4, cardName, bankHint } = parsed

  // 4) Resolver PERFIL y CUENTA por last4 (misma lógica que wallet-ingest)
  let profileId: string | null = null
  let accountId: string | null = null
  if (last4) {
    const { data: acc } = await sb.from('accounts')
      .select('id, profile_id')
      .eq('last4', last4)
      .limit(1)
      .maybeSingle()
    if (acc) { accountId = acc.id; profileId = acc.profile_id }
  }
  if (!profileId) {
    const { data: prof } = await sb.from('profiles').select('id').eq('role', 'Admin').limit(1).single()
    if (!prof) return json({ error: 'no_profile' }, 500)
    profileId = prof.id
  }
  // Respaldo: el número enmascarado de algunas notificaciones no coincide con el last4
  // guardado (ej. Santander). Si hay una única TC de ese banco, se asume esa.
  if (!accountId && bankHint) {
    const { data: accts } = await sb.from('accounts')
      .select('id, bank, name, type').eq('profile_id', profileId).eq('type', 'Crédito')
    const matches = (accts ?? []).filter(a => normBank(a.bank).includes(bankHint) || normBank(a.name).includes(bankHint))
    if (matches.length === 1) accountId = matches[0].id
  }

  // 5) Dedup entre fuentes: mismo perfil + mismo monto + misma fecha (y misma cuenta si ya
  // se resolvió). Antes era una ventana de 15 min sobre created_at, pero Wallet puede demorar
  // bastante en notificar la misma compra (visto: 78 min de diferencia) y se escapaba del
  // dedup — por fecha+cuenta es más robusto que perseguir un timestamp relativo.
  let dupQuery = sb.from('transactions')
    .select('id, source')
    .eq('profile_id', profileId)
    .eq('amount', -amt)
    .eq('date', dateStr)
  if (accountId) dupQuery = dupQuery.eq('account_id', accountId)
  const { data: dup } = await dupQuery.limit(1)
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

  // El saldo lo sincroniza el trigger de BD (migración 006).

  // 8) Anti-carrera con wallet-ingest: una compra NFC la notifican la app del banco y Wallet,
  // a veces con minutos u horas de diferencia (Wallet puede demorar bastante en avisar; visto:
  // 78 min). Regla: el registro del banco manda. Si existe una fila google_wallet por la misma
  // cuenta+monto+fecha, se borra ESA (el trigger de BD reversa su saldo). wallet-ingest hace el
  // chequeo espejo borrando la suya, así cualquier orden de commit converge a una sola fila.
  let walletDupRemoved = false
  let walletDupQuery = sb.from('transactions').select('id')
    .eq('profile_id', profileId).eq('amount', -amt).eq('source', 'google_wallet').eq('date', dateStr)
  if (accountId) walletDupQuery = walletDupQuery.eq('account_id', accountId)
  const { data: walletDup } = await walletDupQuery.limit(1)
  if (walletDup && walletDup.length > 0) {
    await sb.from('transactions').delete().eq('id', walletDup[0].id)
    walletDupRemoved = true
  }

  return json({
    ok: true,
    inserted: true,
    id: ins.id,
    parser: parsed.parser,
    wallet_dup_removed: walletDupRemoved,
    merchant,
    amount: amt,
    last4,
    profile_id: profileId,
    account_matched: !!accountId,
    category_matched: !!categoryId,
    date: dateStr,
  })
})
