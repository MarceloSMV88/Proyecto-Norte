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
