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
// Los bancos escriben la misma cuenta con o sin ceros a la izquierda (00-407-01867-01 vs 4070186701)
const acctKey = (d: string) => d.replace(/^0+/, '')
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
function nameTokensLoose(s: unknown): string[] {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length >= 3)
}

// Vincula automáticamente un movimiento recién insertado a un compromiso mensual
// (monthly_commitments) cuando hay EXACTAMENTE UN candidato sin ambigüedad — mismo perfil,
// mes, categoría, sin confirmar aún, y cuyo matcher_hint (o nombre) aparece COMPLETO en el
// texto del movimiento. Si hay 0 o >1 candidatos, no hace nada (queda para la sugerencia
// 'detectado' del lado del cliente, que el usuario confirma a mano).
async function linkCommitment(
  sb: ReturnType<typeof createClient>, profileId: string, categoryId: string | null,
  txId: string, txName: string, txDesc: string, amount: number, dateStr: string,
) {
  if (!categoryId) return
  const month = dateStr.slice(0, 7) + '-01'
  const { data: cands } = await sb.from('monthly_commitments')
    .select('id, name, matcher_hint')
    .eq('profile_id', profileId).eq('month', month).eq('category_id', categoryId)
    .is('paid_transaction_id', null)
    .not('status', 'in', '(pagado,omitido)')
  if (!cands || cands.length === 0) return
  const haystack = nameTokensLoose(`${txName} ${txDesc}`).join(' ')
  const matches = cands.filter(c => {
    const hintTokens = nameTokensLoose(c.matcher_hint || c.name)
    return hintTokens.length > 0 && hintTokens.every(t => haystack.includes(t))
  })
  if (matches.length !== 1) return
  await sb.from('monthly_commitments').update({
    status: 'pagado', actual_amount: Math.abs(amount), paid_transaction_id: txId,
  }).eq('id', matches[0].id)
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  const sb = createClient(SUPABASE_URL, SERVICE_KEY)

  async function logFailure(reason: string, payload: unknown) {
    console.error(`transfer-ingest ${reason}:`, JSON.stringify(payload))
    await sb.from('ingest_failures').insert({ fn: 'transfer-ingest', reason, payload: payload ?? null })
  }

  const provided = req.headers.get('x-ingest-secret') ?? ''
  const { data: cfg } = await sb.from('ingest_config').select('secret').eq('id', 1).single()
  if (!cfg || provided !== cfg.secret) return json({ error: 'unauthorized' }, 401)
  let b: Record<string, unknown>
  try { b = await req.json() } catch { return json({ error: 'bad_json' }, 400) }

  // === Pago de tarjeta de crédito (cta cte -> TC, transferencia interna) vía mail del banco ===
  // NO es gasto (el gasto ya se registró al usar la tarjeta): abona la TC (baja la deuda) y
  // descuenta la cuenta de origen. 2 patas type 'transfer', sin categoría de presupuesto.
  if (String(b.kind ?? '') === 'pago_tc') {
    const amt = parseInt(digits(b.amount), 10)
    if (!amt || amt <= 0) { await logFailure('bad_amount', b); return json({ error: 'bad_amount', got: b.amount }, 400) }
    const last4 = String(b.last4 ?? '').trim()
    const dateStr = normDate(b.date)

    const { data: card } = await sb.from('accounts').select('id, profile_id, bank, name').eq('last4', last4).limit(1).maybeSingle()
    let profileId = card?.profile_id ?? null
    if (!profileId) {
      const { data: prof } = await sb.from('profiles').select('id').eq('role', 'Admin').limit(1).single()
      if (!prof) return json({ error: 'no_profile' }, 500)
      profileId = prof.id
    }

    if (card) {
      const { data: dup } = await sb.from('transactions').select('id')
        .eq('profile_id', profileId).eq('account_id', card.id).eq('amount', amt).eq('date', dateStr).limit(1)
      if (dup && dup.length > 0) return json({ ok: true, inserted: false, reason: 'duplicate' })
    }

    const { data: accts } = await sb.from('accounts').select('id, account_number, name').eq('profile_id', profileId)
    const originAcctD = digits(b.originAccount)
    const k = acctKey(originAcctD)
    const origin = k ? ((accts ?? []).find(a => a.account_number && acctKey(digits(a.account_number)) === k) ?? null) : null

    const label = card?.bank ? `Pago TC ${card.bank}` : 'Pago de tarjeta'
    const rows: Record<string, unknown>[] = []
    if (card) rows.push({ profile_id: profileId, name: label, amount: amt, type: 'transfer', category_id: null, account_id: card.id, description: origin ? `desde ${origin.name}` : null, source: 'gmail_transfer', date: dateStr })
    if (origin) rows.push({ profile_id: profileId, name: label, amount: -amt, type: 'transfer', category_id: null, account_id: origin.id, description: 'Pago de tarjeta', source: 'gmail_transfer', date: dateStr })
    if (rows.length === 0) return json({ ok: false, reason: 'no_accounts' })

    const { data: ins, error: insErr } = await sb.from('transactions').insert(rows).select('id')
    if (insErr) return json({ error: 'insert_failed', detail: insErr.message }, 500)

    // Auto-vínculo al compromiso-recordatorio de esta TC (ej. "Santander T. Crédito"), si hay uno solo.
    if (card) {
      const month = dateStr.slice(0, 7) + '-01'
      const { data: catRow } = await sb.from('categories').select('id')
        .eq('profile_id', profileId).eq('name', 'Tarjetas de crédito').limit(1).maybeSingle()
      if (catRow) await linkCommitment(sb, profileId, catRow.id, ins![0].id, label, '', amt, dateStr)
    }

    return json({ ok: true, inserted: true, kind: 'pago_tc', legs: (ins ?? []).length, amount: amt, card_matched: !!card, origin_matched: !!origin, date: dateStr })
  }

  // === Pago de cuota de participación Coopeuch (transferencia interna entre 2 cuentas Coopeuch) ===
  // Fijo y conocido: siempre descuenta "Copeuch - Monedero Digital" (identificada por last4 de
  // la cuenta vista del mail) y abona "Copeuch - Cuotas Parcipación" (cuenta de ahorro, por nombre).
  if (String(b.kind ?? '') === 'coopeuch_cuotas') {
    const amt = parseInt(digits(b.amount), 10)
    if (!amt || amt <= 0) { await logFailure('bad_amount', b); return json({ error: 'bad_amount', got: b.amount }, 400) }
    const last4 = String(b.last4 ?? '').trim()
    const dateStr = normDate(b.date)
    const month = dateStr.slice(0, 7) + '-01'

    const { data: adminProf } = await sb.from('profiles').select('id').eq('role', 'Admin').limit(1).single()
    if (!adminProf) return json({ error: 'no_profile' }, 500)
    const profileId = adminProf.id as string

    const label = 'Cuotas de Participación Coopeuch'
    const { data: dup } = await sb.from('transactions').select('id')
      .eq('profile_id', profileId).eq('name', label).eq('amount', -amt).eq('date', dateStr).limit(1)
    if (dup && dup.length > 0) return json({ ok: true, inserted: false, reason: 'duplicate' })

    const { data: accts } = await sb.from('accounts').select('id, account_number, name, bank').eq('profile_id', profileId).eq('bank', 'Copeuch')
    const origin = (accts ?? []).find(a => a.account_number && last4 && digits(a.account_number).endsWith(last4)) ?? null
    const dest = (accts ?? []).find(a => a.name.toLowerCase().includes('cuotas')) ?? null

    let categoryId: string | null = null
    const { data: cat } = await sb.from('categories').select('id')
      .eq('profile_id', profileId).eq('name', 'Ahorro - Personal').limit(1).maybeSingle()
    if (cat) categoryId = cat.id

    const rows: Record<string, unknown>[] = []
    if (origin) rows.push({ profile_id: profileId, name: label, amount: -amt, type: 'transfer', category_id: categoryId, account_id: origin.id, description: dest ? `hacia ${dest.name}` : null, source: 'gmail_transfer', date: dateStr })
    if (dest) rows.push({ profile_id: profileId, name: label, amount: amt, type: 'transfer', category_id: categoryId, account_id: dest.id, description: origin ? `desde ${origin.name}` : null, source: 'gmail_transfer', date: dateStr })
    if (rows.length === 0) return json({ ok: false, reason: 'no_accounts' })

    const { data: ins, error: insErr } = await sb.from('transactions').insert(rows).select('id')
    if (insErr) return json({ error: 'insert_failed', detail: insErr.message }, 500)

    if (categoryId) await linkCommitment(sb, profileId, categoryId, ins![0].id, label, '', -amt, dateStr)

    return json({ ok: true, inserted: true, kind: 'coopeuch_cuotas', legs: (ins ?? []).length, amount: amt, origin_matched: !!origin, dest_matched: !!dest, date: dateStr })
  }

  // === Giro en cajero con Tarjeta de Débito (retiro de efectivo, Banco de Chile) ===
  // Gasto de una sola pata, sin contraparte/empresa: solo trae los últimos dígitos
  // enmascarados de la cuenta con cargo (ej. "Cuenta ****7004"). Se matchea primero por
  // accounts.last4 (tarjetas) y si no, por los últimos 4 dígitos de account_number (cta cte).
  if (String(b.kind ?? '') === 'giro_cajero') {
    const amt = parseInt(digits(b.amount), 10)
    if (!amt || amt <= 0) { await logFailure('bad_amount', b); return json({ error: 'bad_amount', got: b.amount }, 400) }
    const last4 = String(b.last4 ?? '').trim()
    const dateStr = normDate(b.date)

    const { data: adminProf } = await sb.from('profiles').select('id').eq('role', 'Admin').limit(1).single()
    if (!adminProf) return json({ error: 'no_profile' }, 500)
    const profileId = adminProf.id as string

    const label = 'Giro Cajero'
    const { data: dup } = await sb.from('transactions').select('id')
      .eq('profile_id', profileId).eq('name', label).eq('amount', -amt).eq('date', dateStr).limit(1)
    if (dup && dup.length > 0) return json({ ok: true, inserted: false, reason: 'duplicate' })

    const { data: accts } = await sb.from('accounts').select('id, account_number, last4').eq('profile_id', profileId)
    const acc = (accts ?? []).find(a => a.last4 && last4 && a.last4 === last4)
      ?? (accts ?? []).find(a => a.account_number && last4 && digits(a.account_number).endsWith(last4))
      ?? null

    const { data: ins, error: insErr } = await sb.from('transactions').insert({
      profile_id: profileId, name: label, amount: -amt, type: 'gasto',
      category_id: null, account_id: acc?.id ?? null,
      description: null, source: 'gmail_transfer', date: dateStr,
    }).select('id').single()
    if (insErr) return json({ error: 'insert_failed', detail: insErr.message }, 500)

    return json({ ok: true, inserted: true, id: ins.id, kind: 'giro_cajero', amount: amt, account_matched: !!acc, date: dateStr })
  }

  // === Pago de cuentas de servicio (mail "Comprobante de pago" del Chile, N items por mail;
  // o cualquier pago con "empresa" identificable: Servipag, dividendos de créditos hipotecarios, etc.) ===
  // Cada item es un gasto: cargo a la cuenta de origen + categoría por reglas sobre
  // "EMPRESA IDENTIFICADOR" (permite reglas por n° de cliente, ej. mismo Enel en 2 propiedades).
  if (String(b.kind ?? '') === 'pago_servicio') {
    const amt = parseInt(digits(b.amount), 10)
    if (!amt || amt <= 0) { await logFailure('bad_amount', b); return json({ error: 'bad_amount', got: b.amount }, 400) }
    const empresa = String(b.empresa ?? '').replace(/\s+/g, ' ').trim()
    if (!empresa) { await logFailure('bad_empresa', b); return json({ error: 'bad_empresa' }, 400) }
    const identificador = String(b.identificador ?? '').trim()
    const dateStr = normDate(b.date)
    const month = dateStr.slice(0, 7) + '-01'

    const { data: adminProf } = await sb.from('profiles').select('id').eq('role', 'Admin').limit(1).single()
    if (!adminProf) return json({ error: 'no_profile' }, 500)
    const profileId = adminProf.id as string

    // Dedup: mismo servicio + monto + fecha (comprobante reprocesado)
    const { data: dup } = await sb.from('transactions').select('id')
      .eq('profile_id', profileId).eq('name', empresa).eq('amount', -amt).eq('date', dateStr).limit(1)
    if (dup && dup.length > 0) return json({ ok: true, inserted: false, reason: 'duplicate' })

    // Cuenta de cargo: por número (tolerante a ceros a la izquierda) y, si no hay número
    // (ej. Servipag solo indica el banco, no la cuenta), por nombre de banco — prefiriendo
    // cuenta de depósito sobre TC si el banco tiene ambas.
    const { data: accts } = await sb.from('accounts').select('id, account_number, bank, name, type').eq('profile_id', profileId)
    const k = acctKey(digits(b.originAccount))
    let acc = k ? ((accts ?? []).find(a => a.account_number && acctKey(digits(a.account_number)) === k) ?? null) : null
    // Respaldo: una Cuenta RUT a veces viene con el dígito verificador (lo manda el banco de
    // origen de una transferencia, ej. Chile) y a veces sin él (el propio BancoEstado en sus
    // comprobantes) — mismo número, largo distinto. Si el match exacto falla, comparar
    // ignorando el último dígito de cualquiera de los dos lados.
    if (!acc && k) {
      acc = (accts ?? []).find(a => {
        if (!a.account_number) return false
        const ak = acctKey(digits(a.account_number))
        return ak.length > 1 && k.length > 1 && (ak.slice(0, -1) === k || ak === k.slice(0, -1))
      }) ?? null
    }
    if (!acc) {
      const bankN = normBank(b.originBank)
      if (bankN && bankN.length >= 3) {
        const byBank = (accts ?? []).filter(a => { const ab = normBank(a.bank), an = normBank(a.name); return ab === bankN || an === bankN || ab.includes(bankN) || an.includes(bankN) })
        acc = byBank.find(a => a.type !== 'Crédito') ?? byBank[0] ?? null
      }
    }

    // Categoría por reglas (match sobre empresa + identificador)
    let categoryId: string | null = null
    const { data: rules } = await sb.from('category_rules').select('pattern, category_name').eq('profile_id', profileId)
    if (rules) {
      const up = `${empresa} ${identificador}`.toUpperCase()
      const match = rules.filter(r => up.includes(String(r.pattern).toUpperCase()))
        .sort((r1, r2) => String(r2.pattern).length - String(r1.pattern).length)[0]
      if (match) {
        const { data: cat } = await sb.from('categories').select('id')
          .eq('profile_id', profileId).eq('name', match.category_name).limit(1).maybeSingle()
        if (cat) categoryId = cat.id
      }
    }

    const { data: ins, error: insErr } = await sb.from('transactions').insert({
      profile_id: profileId, name: empresa, amount: -amt, type: 'gasto',
      category_id: categoryId, account_id: acc?.id ?? null,
      description: identificador ? `N° cliente ${identificador}` : null,
      source: 'gmail_pago', date: dateStr,
    }).select('id').single()
    if (insErr) return json({ error: 'insert_failed', detail: insErr.message }, 500)

    // El saldo lo sincroniza el trigger de BD (migración 006).
    await linkCommitment(sb, profileId, categoryId, ins.id, empresa, identificador, -amt, dateStr)

    return json({ ok: true, inserted: true, id: ins.id, kind: 'pago_servicio', empresa, amount: amt, account_matched: !!acc, category_matched: !!categoryId, date: dateStr })
  }

  const amount = parseInt(digits(b.amount), 10)
  if (!amount || amount <= 0) { await logFailure('bad_amount', b); return json({ error: 'bad_amount', got: b.amount }, 400) }
  const dateStr = normDate(b.date)
  const month = dateStr.slice(0, 7) + '-01'
  const originRut = digits(b.originRut)
  const destRut = digits(b.destRut)
  let originAcctD = digits(b.originAccount)
  const destAcctD = digits(b.destAccount)
  // Guard: si el parser conflació origen y destino al mismo número, no confiar en el de origen
  if (originAcctD && acctKey(originAcctD) === acctKey(destAcctD)) originAcctD = ''
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

  const { data: accts } = await sb.from('accounts').select('id, account_number, bank, name, type').eq('profile_id', profileId)
  const byNumber = (d: string) => {
    const k = acctKey(d)
    if (!k) return null
    const exact = (accts ?? []).find(a => a.account_number && acctKey(digits(a.account_number)) === k)
    if (exact) return exact
    // Cuenta RUT: llega CON dígito verificador cuando la escribe un banco externo y SIN él
    // cuando la escribe el propio BancoEstado (ej. "Desde 16798718" vs guardada 167987184).
    // Mismo respaldo que la rama pago_servicio: reintentar ignorando el último dígito de
    // cualquiera de los dos lados.
    return (accts ?? []).find(a => {
      if (!a.account_number) return false
      const ak = acctKey(digits(a.account_number))
      return ak.length > 1 && k.length > 1 && (ak.slice(0, -1) === k || ak === k.slice(0, -1))
    }) ?? null
  }
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
  const newAccts = [originAcctD, destAcctD].filter(Boolean).map(acctKey)
  const newPair = [originBankN, destBankN].filter(Boolean).sort().join('|')
  for (const c of (cands ?? [])) {
    const t = tokens(String(c.description ?? ''))
    const exAccts = [t.oa, t.da].filter(Boolean).map(acctKey)
    const sameTx = txnId && t.tx && txnId === t.tx
    let dup = !!sameTx
    if (!dup && txType === 'transfer') {
      // Interna: los 2 correos del MISMO movimiento comparten alguna cuenta o el par de bancos.
      const sharesAcct = newAccts.some(a => exAccts.includes(a))
      const exPair = [t.ob, t.db].filter(Boolean).sort().join('|')
      const samePair = !!(newPair && exPair && newPair === exPair)
      dup = sharesAcct || samePair
    } else if (!dup) {
      // Gasto/ingreso a/de un TERCERO: solo es duplicado si coincide la cuenta de la CONTRAPARTE.
      // NO basta con compartir el origen (tu misma cuenta paga muchos gastos distintos el mismo
      // día por el mismo monto — eran falsos duplicados que se perdían en silencio).
      const cpKey = acctKey(txType === 'gasto' ? destAcctD : originAcctD)
      dup = !!cpKey && exAccts.includes(cpKey)
    }
    if (dup) return json({ ok: true, inserted: false, reason: 'duplicate', matched: c.id })
  }

  // Dedup cross-fuente: la misma transferencia ya pudo llegar por notificación push
  // (notif-ingest, source 'bank_app') antes que por este mail — el push llega casi al
  // instante, el mail se procesa por polling. bank_app no escribe tags #oa/#da en la
  // descripción, así que el match es por fecha + monto + cuenta ya resuelta de cada lado.
  const { data: bankAppCands } = await sb.from('transactions').select('id, amount, account_id')
    .eq('profile_id', profileId).eq('source', 'bank_app').eq('date', dateStr).or(`amount.eq.${-amount},amount.eq.${amount}`)
  const bankAppDup = (bankAppCands ?? []).find(c =>
    (c.amount === -amount && originAcc && c.account_id === originAcc.id) ||
    (c.amount === amount && destAcc && c.account_id === destAcc.id)
  )
  if (bankAppDup) return json({ ok: true, inserted: false, reason: 'duplicate', matched: bankAppDup.id })

  const description = `${comment ? comment + ' ' : ''}#oa:${originAcctD} #da:${destAcctD} #ob:${originBankN} #db:${destBankN} #tx:${txnId}`.trim()

  // Categoría por reglas SOLO para gasto (transfer/ingreso entre tus propias cuentas o de
  // terceros no tienen una categoría de presupuesto que les aplique). Match sobre destName +
  // comment, igual criterio que pago_servicio (permite reconocer transferencias recurrentes
  // a un tercero fijo, ej. gasto común a un condominio).
  let gastoCategoryId: string | null = null
  if (txType === 'gasto') {
    const { data: rules } = await sb.from('category_rules').select('pattern, category_name').eq('profile_id', profileId)
    if (rules) {
      const up = `${destName} ${comment}`.toUpperCase()
      const match = rules.filter(r => up.includes(String(r.pattern).toUpperCase()))
        .sort((r1, r2) => String(r2.pattern).length - String(r1.pattern).length)[0]
      if (match) {
        const { data: cat } = await sb.from('categories').select('id')
          .eq('profile_id', profileId).eq('name', match.category_name).limit(1).maybeSingle()
        if (cat) gastoCategoryId = cat.id
      }
    }
  }

  // Aporte a ahorro: TODO lo que entra a la cuenta "Ahorro Premium" cuenta en el presupuesto
  // como "Ahorro - Personal" (pedido del usuario 2026-07-09). Mismo criterio que
  // coopeuch_cuotas: se categoriza la pata POSITIVA del transfer y la migración 008 la suma
  // al Gastado de la categoría. Si la categoría no existe ese mes, queda sin categoría.
  let savingsCategoryId: string | null = null
  if (txType === 'transfer' && destAcc && /ahorro premium/i.test(destAcc.name)) {
    const { data: cat } = await sb.from('categories').select('id')
      .eq('profile_id', profileId).eq('name', 'Ahorro - Personal').limit(1).maybeSingle()
    if (cat) savingsCategoryId = cat.id
  }

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

  const rows = legs.map(l => ({ profile_id: profileId, name: l.name, amount: l.amount, type: txType, category_id: txType === 'gasto' ? gastoCategoryId : (l.amount > 0 ? savingsCategoryId : null), account_id: l.account_id, description, source: 'gmail_transfer', date: dateStr }))
  const { data: ins, error: insErr } = await sb.from('transactions').insert(rows).select('id')
  if (insErr) return json({ error: 'insert_failed', detail: insErr.message }, 500)

  // Los saldos los sincroniza el trigger de BD (migración 006) por cada pata insertada.
  // (Caso "misma cuenta": las patas ±X se anulan solas.)
  if (txType === 'gasto' && ins && ins[0]) {
    await linkCommitment(sb, profileId, gastoCategoryId, ins[0].id, legs[0].name, description, legs[0].amount, dateStr)
  }

  return json({ ok: true, inserted: true, legs: (ins ?? []).length, ids: (ins ?? []).map(r => r.id), classification: txType, amount, date: dateStr, origin_matched: !!originAcc, dest_matched: !!destAcc })
})
