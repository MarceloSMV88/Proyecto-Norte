import { describe, it, expect } from 'vitest'
import { digits, acctKey, normBank, nameTokens, nameTokensLoose, normDate, tokens, nextMonthStr, isDuplicateTransferCandidate } from './helpers.ts'

describe('digits', () => {
  it('deja solo los dígitos, quitando guiones', () => {
    expect(digits('00-407-01867-01')).toBe('004070186701')
  })

  it('normaliza null/undefined a string vacío', () => {
    expect(digits(undefined)).toBe('')
    expect(digits(null)).toBe('')
  })
})

describe('acctKey', () => {
  it('quita ceros a la izquierda para poder comparar formatos distintos del mismo número', () => {
    // Banco de Chile escribe la cuenta con ceros a la izquierda (00-407-01867-01, 12 dígitos);
    // otro banco puede mandar el mismo número sin ellos (4070186701, 10 dígitos).
    expect(acctKey(digits('00-407-01867-01'))).toBe(acctKey('4070186701'))
  })

  it('16798718 y 167987184 (con/sin dígito verificador) NO son iguales solo por acctKey', () => {
    // acctKey solo saca ceros a la izquierda; el manejo del dígito verificador es responsabilidad
    // de quien llama (ver byNumber en index.ts), no de acctKey.
    expect(acctKey('16798718')).not.toBe(acctKey('167987184'))
  })

  it('sin ceros a la izquierda no cambia nada', () => {
    expect(acctKey('4070186701')).toBe('4070186701')
  })
})

describe('normBank', () => {
  it('quita "Banco", tildes y mayúsculas', () => {
    expect(normBank('Banco de Chile')).toBe('chile')
  })

  it('quita espacios y tildes de un nombre de empresa', () => {
    // Nota: el token "s.a." con puntos no cae dentro de \b(...)\b (los puntos rompen el límite
    // de palabra), así que "sa" sobrevive como parte del nombre normalizado.
    expect(normBank('Aguas Andinas S.A.')).toBe('aguasandinassa')
  })

  it('deja pasar nombres de apps de pago que no son "Banco X"', () => {
    expect(normBank('Mercado Pago')).toBe('mercadopago')
  })

  it('normaliza null/undefined a string vacío', () => {
    expect(normBank(undefined)).toBe('')
    expect(normBank(null)).toBe('')
  })
})

describe('nameTokens / nameTokensLoose', () => {
  it('nameTokens quita tildes y descarta tokens de menos de 3 letras', () => {
    expect(nameTokens('José Ñíguez')).toEqual(['jose', 'niguez'])
  })

  it('nameTokens descarta números (solo letras)', () => {
    expect(nameTokens('Enel 123456')).toEqual(['enel'])
  })

  it('nameTokensLoose sí conserva números como tokens', () => {
    expect(nameTokensLoose('Enel 123456')).toEqual(['enel', '123456'])
  })
})

describe('normDate', () => {
  it('reconoce fecha ISO (yyyy-mm-dd, con o sin hora)', () => {
    expect(normDate('2026-07-08T23:26:58')).toBe('2026-07-08')
  })

  it('reconoce fecha dd/mm/yyyy y la normaliza a yyyy-mm-dd', () => {
    expect(normDate('8/7/2026')).toBe('2026-07-08')
  })

  it('rellena con ceros día y mes de un dígito', () => {
    expect(normDate('3/4/2026')).toBe('2026-04-03')
  })
})

describe('tokens', () => {
  it('extrae los tags #oa/#da/#ob/#db/#tx de la description', () => {
    const desc = 'Mensaje del usuario #oa:4070186701 #da:16798718 #ob:chile #db:bancoestado #tx:ABC123'
    expect(tokens(desc)).toEqual({ oa: '4070186701', da: '16798718', ob: 'chile', db: 'bancoestado', tx: 'ABC123' })
  })

  it('devuelve strings vacíos para los tags ausentes', () => {
    expect(tokens('sin tags acá')).toEqual({ oa: '', da: '', ob: '', db: '', tx: '' })
  })
})

describe('nextMonthStr', () => {
  it('avanza un mes dentro del mismo año', () => {
    expect(nextMonthStr('2026-08-01')).toBe('2026-09-01')
  })

  it('rueda el año al pasar de diciembre a enero', () => {
    expect(nextMonthStr('2026-12-01')).toBe('2027-01-01')
  })
})

describe('isDuplicateTransferCandidate', () => {
  const empty = { oa: '', da: '', ob: '', db: '', tx: '' }

  it('mismo txnId siempre es duplicado, sin importar el resto', () => {
    const dup = isDuplicateTransferCandidate({
      txType: 'gasto', txnId: 'ABC123', originAcctD: '', destAcctD: '',
      originBankN: 'chile', destBankN: 'otro',
      candidate: { ...empty, tx: 'ABC123' },
    })
    expect(dup).toBe(true)
  })

  it('transfer interna: mismo par de bancos sin cuentas compartidas SÍ es duplicado', () => {
    const dup = isDuplicateTransferCandidate({
      txType: 'transfer', txnId: '', originAcctD: '', destAcctD: '',
      originBankN: 'chile', destBankN: 'ripley',
      candidate: { ...empty, ob: 'ripley', db: 'chile' }, // orden invertido, se ordena antes de comparar
    })
    expect(dup).toBe(true)
  })

  it('transfer interna: cuenta compartida es duplicado aunque los bancos no matcheen', () => {
    const dup = isDuplicateTransferCandidate({
      txType: 'transfer', txnId: '', originAcctD: '4070186701', destAcctD: '',
      originBankN: 'chile', destBankN: 'ripley',
      candidate: { ...empty, oa: '4070186701', ob: 'otrobanco' },
    })
    expect(dup).toBe(true)
  })

  it('gasto: cuenta de la contraparte coincide -> duplicado', () => {
    const dup = isDuplicateTransferCandidate({
      txType: 'gasto', txnId: '', originAcctD: '', destAcctD: '16798718',
      originBankN: 'chile', destBankN: '',
      candidate: { ...empty, da: '16798718' },
    })
    expect(dup).toBe(true)
  })

  it('gasto: mismo monto/fecha/origen pero cuenta de contraparte DISTINTA -> no es duplicado', () => {
    // Este es el caso que el comentario original documentaba: tu misma cuenta paga dos gastos
    // distintos el mismo día por el mismo monto, a terceros con cuenta conocida y diferente.
    const dup = isDuplicateTransferCandidate({
      txType: 'gasto', txnId: '', originAcctD: '4070186701', destAcctD: '11111111',
      originBankN: 'chile', destBankN: 'ripley',
      candidate: { ...empty, oa: '4070186701', da: '22222222' },
    })
    expect(dup).toBe(false)
  })

  it('gasto: ninguno de los 2 correos trae cuenta de la contraparte, pero coincide el par de bancos -> duplicado (regresión 2026-09-06)', () => {
    // Pago de Internet del depto de Conchalí: 2 correos de Banco de Chile por la misma
    // transferencia, ninguno con la cuenta del ISP -> antes nunca se detectaba como duplicado.
    const dup = isDuplicateTransferCandidate({
      txType: 'gasto', txnId: '', originAcctD: '', destAcctD: '',
      originBankN: 'chile', destBankN: 'chile',
      candidate: { ...empty, ob: 'chile', db: 'chile' },
    })
    expect(dup).toBe(true)
  })

  it('gasto: sin cuenta de contraparte en el nuevo, pero el existente SÍ la trae -> no se asume duplicado', () => {
    // Si el existente ya tiene la cuenta real del tercero, no alcanza con que el par de bancos
    // coincida (podría ser un tercero distinto con el mismo banco).
    const dup = isDuplicateTransferCandidate({
      txType: 'gasto', txnId: '', originAcctD: '', destAcctD: '',
      originBankN: 'chile', destBankN: 'chile',
      candidate: { ...empty, ob: 'chile', db: 'chile', da: '99999999' },
    })
    expect(dup).toBe(false)
  })

  it('ingreso: usa la cuenta de ORIGEN como contraparte (no la de destino)', () => {
    const dup = isDuplicateTransferCandidate({
      txType: 'ingreso', txnId: '', originAcctD: '4070186701', destAcctD: '',
      originBankN: 'chile', destBankN: '',
      candidate: { ...empty, oa: '4070186701' },
    })
    expect(dup).toBe(true)
  })

  it('sin ninguna señal en común no es duplicado', () => {
    const dup = isDuplicateTransferCandidate({
      txType: 'gasto', txnId: '', originAcctD: '', destAcctD: '',
      originBankN: '', destBankN: '',
      candidate: empty,
    })
    expect(dup).toBe(false)
  })
})
