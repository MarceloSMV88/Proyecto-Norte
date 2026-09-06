// Helpers de normalización de texto compartidos entre index.ts y parsers.ts. Puros (sin Deno.env
// ni Supabase) para poder importarlos también desde los tests.

export function nameTokens(s: unknown): string[] {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(t => t.length >= 3)
}

export function normBank(s: unknown): string {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\b(banco|de|del|la|el|cuenta|corriente|vista|ahorro|cl|sa|s\.a\.)\b/g, '').replace(/[^a-z0-9]/g, '')
}

export const digits = (s: unknown) => String(s ?? '').replace(/\D/g, '')
// Los bancos escriben la misma cuenta con o sin ceros a la izquierda (00-407-01867-01 vs 4070186701)
export const acctKey = (d: string) => d.replace(/^0+/, '')
