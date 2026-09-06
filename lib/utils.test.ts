import { describe, it, expect } from 'vitest'
import { clp, computeSummary } from './utils'

describe('clp', () => {
  it('formatea con separador de miles es-CL', () => {
    expect(clp(1234567)).toBe('$1.234.567')
  })

  it('redondea decimales', () => {
    expect(clp(999.6)).toBe('$1.000')
  })

  it('antepone signo menos (unicode) para negativos, sin withSign', () => {
    expect(clp(-5000)).toBe('−$5.000')
  })

  it('con withSign=true antepone + a los positivos', () => {
    expect(clp(5000, true)).toBe('+$5.000')
  })

  it('con withSign=true antepone − a los negativos', () => {
    expect(clp(-5000, true)).toBe('−$5.000')
  })

  it('cero sin withSign no lleva signo', () => {
    expect(clp(0)).toBe('$0')
  })
})

describe('computeSummary', () => {
  it('calcula los totales básicos del mes', () => {
    const categories = [
      { assigned: 100_000, spent: 40_000, fixed: true },
      { assigned: 50_000, spent: 60_000, fixed: false },
    ]
    const accounts = [
      { type: 'Cuenta', balance: 200_000 },
      { type: 'Ahorro', balance: 300_000 },
      { type: 'Crédito', balance: -80_000 },
    ]
    const summary = computeSummary(categories, accounts, 500_000, 10)

    expect(summary.assignedTotal).toBe(150_000)
    expect(summary.spentTotal).toBe(100_000)
    expect(summary.unassigned).toBe(350_000) // income - assignedTotal
    expect(summary.available).toBe(200_000) // solo cuentas tipo 'Cuenta'
    expect(summary.unassignedFunds).toBe(50_000) // available - assignedTotal
    expect(summary.savings).toBe(300_000)
    expect(summary.variableAssigned).toBe(50_000)
    expect(summary.variableSpent).toBe(60_000)
  })

  it('safeToday es el disponible variable repartido en los días restantes, redondeado a la centena', () => {
    const categories = [{ assigned: 100_000, spent: 20_000, fixed: false }]
    const accounts: { type: string; balance: number }[] = []
    // (100000 - 20000) / 10 = 8000 -> ya es múltiplo de 100
    const summary = computeSummary(categories, accounts, 0, 10)
    expect(summary.safeToday).toBe(8_000)
  })

  it('safeToday nunca es negativo aunque el gasto variable supere lo asignado', () => {
    const categories = [{ assigned: 10_000, spent: 50_000, fixed: false }]
    const summary = computeSummary(categories, [], 0, 10)
    expect(summary.safeToday).toBe(0)
  })

  it('usa daysLeft=12 por defecto si no se pasa', () => {
    const categories = [{ assigned: 120_000, spent: 0, fixed: false }]
    const summary = computeSummary(categories, [], 0)
    expect(summary.daysLeft).toBe(12)
    expect(summary.safeToday).toBe(10_000) // 120000 / 12
  })

  it('categorías fijas no entran en variableAssigned/variableSpent ni en safeToday', () => {
    const categories = [
      { assigned: 1_000_000, spent: 1_000_000, fixed: true }, // gasto fijo, no debería afectar safeToday
      { assigned: 24_000, spent: 0, fixed: false },
    ]
    const summary = computeSummary(categories, [], 0, 12)
    expect(summary.variableAssigned).toBe(24_000)
    expect(summary.variableSpent).toBe(0)
    expect(summary.safeToday).toBe(2_000) // 24000 / 12
  })
})
