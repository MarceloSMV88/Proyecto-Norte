// Parsers puros de notificaciones bancarias (Banco Ripley, Santander, Mercado Pago). Sin
// dependencias de Deno.serve/Deno.env/Supabase: reciben (title, text) y devuelven el objeto
// parseado o null. Separados de index.ts para poder testearlos sin levantar el runtime de Deno.

import { normBank } from './helpers.ts'

export type Parsed =
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
  | {
      parser: string
      kind: 'trf_interna'
      amt: number
      originBankHint: string // banco de la cuenta que envía (siempre tuya: es un traspaso propio)
      destBankHint: string   // banco/app dueño de la app que notificó (destino del dinero, siempre tuya)
      dateStr: string | null
    }

export type ParserFn = (title: string, text: string) => Parsed | null

export const parsers: ParserFn[] = [
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
  // Santander mete un calificativo opcional entre "compra" y "con tu": "una compra ONLINE con
  // tu Tarjeta...". Sin tolerarlo se caían todas las compras por internet (2026-08-23: 3 en
  // ingest_failures — MERPAGO*MCDONALDS 15/07, COPEC APP 01/08 y 20/08 — las tres cargadas a
  // mano por el usuario). Se acepta UNA palabra suelta ahí para cubrir también variantes que
  // todavía no vimos (internacional, presencial, ...) sin abrir el resto del patron.
  // Ojo: el número enmascarado que muestra esta notificación (ej. 1147) no siempre coincide
  // con el last4 real guardado en la cuenta (ej. 2838) — por eso lleva bankHint como respaldo.
  (title, text) => {
    const m = text.match(/Transacci[oó]n por\s*\$\s*([\d.,]+)\.?\s+se realiz[oó] una compra(?:\s+[a-z]+)?\s+con tu Tarjeta de Cr[eé]dito\s*\**(\d{3,4})\s+en\s+(.+?),\s+el\s+(\d{1,2})-(\d{1,2})-(\d{4})/i)
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
  // Mercado Pago — dinero recibido en la billetera desde una cuenta bancaria propia (traspaso
  // interno). título: "Tu dinero ya está disponible"
  // cuerpo: "Transferiste $ 58.180 desde tu cuenta de Banco Ripley."
  // Siempre es un traspaso entre cuentas propias: Mercado Pago solo redacta este mensaje para
  // el vinculado que TÚ enviaste desde tu propia cuenta bancaria hacia tu propia billetera.
  // Encontrado 2026-08-16: dos transferencias Ripley -> MercadoPago ($58.180 y $50.000) nunca
  // se ingirieron por falta de este parser (Ripley no manda mail, a diferencia de Santander/Chile).
  (title, text) => {
    const m = text.match(/Transferiste\s*\$\s*([\d.,]+)\s+desde\s+tu\s+cuenta\s+de\s+(.+?)\.?\s*$/i)
    if (!m) return null
    const amt = parseInt(m[1].replace(/[^0-9]/g, ''), 10)
    const originBankHint = normBank(m[2].trim())
    return { parser: 'mercadopago_recibido_interno', kind: 'trf_interna', amt, originBankHint, destBankHint: 'mercadopago', dateStr: null }
  },
]
