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
