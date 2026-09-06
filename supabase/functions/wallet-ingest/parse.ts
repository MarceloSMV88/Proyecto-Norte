// Parseo puro de notificaciones de Google Wallet. Sin Deno.env/Deno.serve/Supabase, para poder
// testearlo sin levantar el runtime de Deno.
//
// Formato: título=comercio, cuerpo="CLP1,500 with <tarjeta> ••5116" (tolerante a "$1.500" y "con").

export type ParsedWalletNotification = {
  merchant: string
  amt: number // NaN si no se pudo extraer el monto
  last4: string | null
  cardName: string | null
}

export function parseWalletNotification(title: string, text: string): ParsedWalletNotification {
  const merchant = title.replace(/\s+/g, ' ').trim()
  const amountMatch = text.match(/(?:CLP|\$)\s*([\d.,]+)/i)
  const amt = amountMatch ? parseInt(amountMatch[1].replace(/[^0-9]/g, ''), 10) : NaN
  const last4 = (text.match(/(\d{4})(?=\D*$)/) ?? [])[1] ?? null
  const cardName = (text.match(/(?:with|con)\s+(.+?)\s+[••·*]{1,2}\s*\d{4}/i) ?? [])[1] ?? null
  return { merchant, amt, last4, cardName }
}
