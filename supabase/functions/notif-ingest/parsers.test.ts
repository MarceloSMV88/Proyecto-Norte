import { describe, it, expect } from 'vitest'
import { parsers } from './parsers.ts'

function parse(title: string, text: string) {
  for (const p of parsers) {
    const r = p(title, text)
    if (r) return r
  }
  return null
}

describe('notif-ingest parsers — Banco Ripley', () => {
  it('parsea una compra con tarjeta', () => {
    const r = parse(
      'Compraste $22.428 en ANTHROPIC* CLAUDE SUB',
      'Con tu Tarjeta Banco Ripley Mastercard Black terminada en 5116 el 02/07/2026 a las 22:23',
    )
    expect(r).toMatchObject({
      parser: 'ripley_compra', kind: 'gasto', merchant: 'ANTHROPIC* CLAUDE SUB',
      amt: 22428, last4: '5116', cardName: 'Banco Ripley Mastercard Black', dateStr: '2026-07-02',
    })
  })

  it('parsea una transferencia recibida', () => {
    const r = parse(
      'Transferencia recibida por $300.000',
      'Has recibido una transferencia por $300.000 de Marcelo Segundo Moya desde el BANCO CHILE el 03/07/2026 a las 01:11.',
    )
    expect(r).toMatchObject({
      parser: 'ripley_trf_recibida', kind: 'trf_recibida', amt: 300000,
      senderName: 'Marcelo Segundo Moya', senderBank: 'BANCO CHILE', destBankHint: 'ripley', dateStr: '2026-07-03',
    })
  })

  it('parsea un pago de la tarjeta de crédito (no es gasto, es transferencia interna)', () => {
    const r = parse(
      'Pago por $1.847.199 a tu Tarjeta Ripley',
      'Has realizado un pago por $1.847.199 a tu Tarjeta Ripley terminada en 5116 el 03/07/2026 a las 13:55.',
    )
    expect(r).toMatchObject({
      parser: 'ripley_pago_tc', kind: 'pago_tc', amt: 1847199,
      last4: '5116', originBankHint: 'ripley', dateStr: '2026-07-03',
    })
  })
})

describe('notif-ingest parsers — Banco Santander', () => {
  it('parsea una compra normal con Tarjeta de Crédito', () => {
    const r = parse(
      '',
      'Transacción por $ 1.790. se realizó una compra con tu Tarjeta de Crédito ****1147 en SERVICIOS Y COMERCIAL, el 01-07-2026 a las 16:38:41.',
    )
    expect(r).toMatchObject({
      parser: 'santander_compra', kind: 'gasto', merchant: 'SERVICIOS Y COMERCIAL',
      amt: 1790, last4: '1147', dateStr: '2026-07-01', bankHint: 'santander',
    })
  })

  it('tolera el calificativo "online" entre "compra" y "con tu Tarjeta" (regresión 2026-08-23)', () => {
    const r = parse(
      '',
      'Transacción por $ 15.000. se realizó una compra online con tu Tarjeta de Crédito ****2838 en MERPAGO*MCDONALDS, el 15-07-2026 a las 12:00:00.',
    )
    expect(r).toMatchObject({ parser: 'santander_compra', kind: 'gasto', merchant: 'MERPAGO*MCDONALDS', amt: 15000 })
  })

  it('parsea una transferencia recibida sin nombre de remitente, capturando la hora exacta', () => {
    const r = parse(
      '',
      'El 05-07-2026 12:14:06 se realizó una Transferencia hacia tu cuenta 000062610654 por $ 40.000.',
    )
    expect(r).toMatchObject({
      parser: 'santander_trf_recibida', kind: 'trf_recibida_cuenta',
      amt: 40000, destAccount: '000062610654', dateStr: '2026-07-05', timeStr: '12:14:06',
    })
  })
})

describe('notif-ingest parsers — Mercado Pago', () => {
  it('parsea dinero recibido en la billetera desde una cuenta propia (traspaso interno)', () => {
    const r = parse('Tu dinero ya está disponible', 'Transferiste $ 58.180 desde tu cuenta de Banco Ripley.')
    expect(r).toMatchObject({
      parser: 'mercadopago_recibido_interno', kind: 'trf_interna',
      amt: 58180, originBankHint: 'ripley', destBankHint: 'mercadopago', dateStr: null,
    })
  })
})

describe('notif-ingest parsers — sin match', () => {
  it('devuelve null para una notificación que ningún parser reconoce', () => {
    expect(parse('Promoción especial', 'Aprovecha nuestros descuentos de la semana')).toBeNull()
  })
})
