import { describe, it, expect } from 'vitest'
import { parseWalletNotification } from './parse.ts'

describe('parseWalletNotification', () => {
  it('parsea el formato estándar de Google Wallet (CLP + with)', () => {
    const r = parseWalletNotification('MERCADOPAGO *NANY', 'CLP59,680 with Ripley Mastercard Black ••5116')
    expect(r).toEqual({ merchant: 'MERCADOPAGO *NANY', amt: 59680, last4: '5116', cardName: 'Ripley Mastercard Black' })
  })

  it('tolera "$" en vez de "CLP" y "con" en vez de "with"', () => {
    const r = parseWalletNotification('ALO CARNE LTDA.', '$51.270 con Ripley Mastercard Black ••5116')
    expect(r).toEqual({ merchant: 'ALO CARNE LTDA.', amt: 51270, last4: '5116', cardName: 'Ripley Mastercard Black' })
  })

  it('colapsa espacios múltiples del título', () => {
    const r = parseWalletNotification('  MERCADOPAGO   *NANY  ', 'CLP 1.500 with Visa ••1234')
    expect(r.merchant).toBe('MERCADOPAGO *NANY')
  })

  it('devuelve amt NaN cuando no hay monto reconocible', () => {
    const r = parseWalletNotification('Comercio', 'sin monto reconocible')
    expect(Number.isNaN(r.amt)).toBe(true)
  })

  it('last4 y cardName quedan null si el texto no trae tarjeta', () => {
    const r = parseWalletNotification('Comercio', 'CLP 1.000')
    expect(r.last4).toBeNull()
    expect(r.cardName).toBeNull()
  })
})
