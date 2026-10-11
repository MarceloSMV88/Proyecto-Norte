// Helpers puros de normalización usados por transfer-ingest para clasificar transferencias
// (cuentas, bancos, nombres, fechas). Sin Deno.env/Deno.serve/Supabase, para poder testearlos
// sin levantar el runtime de Deno.

export const digits = (s: unknown) => String(s ?? '').replace(/\D/g, '')
// Los bancos escriben la misma cuenta con o sin ceros a la izquierda (00-407-01867-01 vs 4070186701)
export const acctKey = (d: string) => d.replace(/^0+/, '')

export function normBank(s: unknown): string {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\b(banco|de|del|la|el|cuenta|corriente|vista|ahorro|cl|sa|s\.a\.)\b/g, '').replace(/[^a-z0-9]/g, '')
}

export function nameTokens(s: unknown): string[] {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(t => t.length >= 3)
}

export function nameTokensLoose(s: unknown): string[] {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length >= 3)
}

export function chileDate(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

export function normDate(s: unknown): string {
  const str = String(s ?? '').trim()
  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})/); if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const dmy = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  return chileDate(new Date())
}

export function tokens(desc: string) {
  const g = (k: string) => (desc.match(new RegExp(`#${k}:([^\\s]*)`)) ?? [])[1] ?? ''
  return { oa: g('oa'), da: g('da'), ob: g('ob'), db: g('db'), tx: g('tx') }
}

export function nextMonthStr(month: string): string {
  const y = Number(month.slice(0, 4))
  const m = Number(month.slice(5, 7))
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
}

export type DescTokens = { oa: string; da: string; ob: string; db: string; tx: string }

// Decide si un movimiento 'gmail_transfer' ya insertado (candidate, con los tags de su
// description parseados por tokens()) es el MISMO pago real que el que se está por insertar.
// Ver comentarios inline por rama; la rama gasto/ingreso sin cuenta de contraparte (2026-09-06:
// pago de Internet del depto de Conchalí, 2 correos de Banco de Chile sin cuenta destino) es la
// que motivó extraer esto a una función pura y testeable.
export function isDuplicateTransferCandidate(params: {
  txType: 'transfer' | 'ingreso' | 'gasto'
  txnId: string
  originAcctD: string
  destAcctD: string
  originBankN: string
  destBankN: string
  candidate: DescTokens
}): boolean {
  const { txType, txnId, originAcctD, destAcctD, originBankN, destBankN, candidate: t } = params
  if (txnId && t.tx && txnId === t.tx) return true

  const newPair = [originBankN, destBankN].filter(Boolean).sort().join('|')
  const exPair = [t.ob, t.db].filter(Boolean).sort().join('|')
  const samePair = !!newPair && !!exPair && newPair === exPair

  if (txType === 'transfer') {
    // Interna: los 2 correos del MISMO movimiento comparten alguna cuenta o el par de bancos.
    const newAccts = [originAcctD, destAcctD].filter(Boolean).map(acctKey)
    const exAccts = [t.oa, t.da].filter(Boolean).map(acctKey)
    const sharesAcct = newAccts.some(a => exAccts.includes(a))
    return sharesAcct || samePair
  }

  // Gasto/ingreso a/de un TERCERO: solo es duplicado si coincide la cuenta de la CONTRAPARTE.
  // NO basta con compartir el origen (tu misma cuenta paga muchos gastos distintos el mismo
  // día por el mismo monto — eran falsos duplicados que se perdían en silencio).
  const exAccts = [t.oa, t.da].filter(Boolean).map(acctKey)
  const cpKey = acctKey(txType === 'gasto' ? destAcctD : originAcctD)
  if (cpKey) return exAccts.includes(cpKey)

  // Ningún correo trajo la cuenta de la contraparte -> nunca hay con qué comparar por cuenta.
  // Respaldo: mismo par de bancos (#ob/#db) Y el existente TAMPOCO trae cuenta de contraparte --
  // si el existente sí la trae, no se asume duplicado solo por el par de bancos (podría ser un
  // tercero distinto que resultó tener el mismo par de bancos).
  const exCpKey = acctKey(txType === 'gasto' ? t.da : t.oa)
  return !exCpKey && samePair
}

// Palabras que aparecen como ETIQUETAS en los comprobantes (no como parte de un nombre real).
const LABEL_WORDS = new Set(['cuenta', 'corriente', 'vista', 'ahorro', 'rut', 'banco', 'chile', 'estado',
  'destinatario', 'destino', 'origen', 'monto', 'nombre', 'apellido', 'transferencia', 'tipo', 'email',
  'de', 'del', 'la', 'el', 'los', 'las', 'a', 'al', 'y', 'en', 'su', 'tu'])

// Nombre de la contraparte usable como título del movimiento, o '' si lo que extrajo el parser no
// es un nombre sino un fragmento de frase/etiqueta del correo (caso real 2026-10-06: un pago a
// Ticketmaster desde Banco de Chile quedó como "Transferencia a de la cuenta).").
export function partyName(s: unknown): string {
  const n = String(s ?? '').replace(/\s+/g, ' ').trim()
  if (!n) return ''
  if (/[()$:;=<>#*@]/.test(n) || /\d{3,}/.test(n)) return ''
  if (/^(de|del|la|el|los|las|al|a|en|su|tu)\b/.test(n)) return ''
  const words = n.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean)
  if (!words.some(w => w.length >= 2 && !LABEL_WORDS.has(w))) return ''
  return n
}

export type CommitmentRow = { id: string; name: string; matcher_hint: string | null; month: string; status: string; paid_transaction_id: string | null; category_id?: string | null }

// Elige el compromiso que paga un movimiento: todos los tokens de su matcher_hint (o de su nombre)
// deben aparecer en el texto del movimiento. Los compromisos se agrupan por name (= identidad
// estable mes a mes): si el del mes ya está resuelto, el pago se corre al del mes siguiente.
// Devuelve null si no hay candidato o si hay más de uno (ambiguo => mejor no vincular).
export function pickCommitment(rows: CommitmentRow[], text: string, month: string): CommitmentRow | null {
  const next = nextMonthStr(month)
  const haystack = nameTokensLoose(text).join(' ')
  const hits = rows.filter(c => {
    const hintTokens = nameTokensLoose(c.matcher_hint || c.name)
    return hintTokens.length > 0 && hintTokens.every(t => haystack.includes(t))
  })

  // Libre = el usuario todavía no resolvió ese mes, en ningún sentido.
  const isFree = (c: CommitmentRow) =>
    !c.paid_transaction_id && c.status !== 'pagado' && c.status !== 'omitido' && c.status !== 'sin_gasto'

  const byName = new Map<string, CommitmentRow[]>()
  // Clave = categoría + nombre: el mismo nombre puede existir en otra categoría (ej. "Gasto común"
  // de dos propiedades distintas) y son identidades distintas.
  for (const c of hits) { const k = `${c.category_id ?? ''}|${c.name}`; byName.set(k, [...(byName.get(k) ?? []), c]) }

  const candidates: CommitmentRow[] = []
  for (const group of byName.values()) {
    const cur = group.find(c => c.month === month)
    if (!cur) continue
    // sin_gasto NO se corre al mes siguiente: el usuario ya dijo que esta cuenta no corre, así
    // que la identidad entera sale de la disputa por este pago.
    if (cur.status === 'sin_gasto') continue
    if (isFree(cur)) { candidates.push(cur); continue }
    const nxt = group.find(c => c.month === next)
    if (nxt && isFree(nxt)) candidates.push(nxt)
  }
  return candidates.length === 1 ? candidates[0] : null
}
