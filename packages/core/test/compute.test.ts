import { describe, expect, it } from 'vitest'
import { checkStatement, comparePayoff, findDuplicates, fromCents, mansaHash, simulatePayoff, toCents } from '../src/compute/index.js'

describe('cents', () => {
  it.each([
    ['0', 0], ['12', 1200], ['12.3', 1230], ['12.34', 1234], ['12.345', 1235], ['12.344', 1234], ['-5.5', -550], ['1234567.89', 123456789],
  ])('toCents(%s) = %i', (input, cents) => expect(toCents(input)).toBe(cents))

  it('rejects junk and formats back', () => {
    expect(() => toCents('1,000.00')).toThrow()
    expect(() => toCents(Number.NaN)).toThrow()
    expect(fromCents(-1)).toBe('-0.01')
    expect(fromCents(65950)).toBe('659.50')
  })
})

describe('checkStatement', () => {
  // Synthetic two-week statement: 12,500.00 + 40,000.25 − 51,840.75 = 659.50
  it('walks a statement balance to the cent', () => {
    const r = checkStatement({
      opening: '12500.00',
      closing: '659.50',
      rows: [
        { amount: '40000.25', direction: 'credit' },
        { amount: '51840.75', direction: 'debit' },
      ],
    })
    expect(r).toMatchObject({ ok: true, expectedClosing: '659.50', difference: '0.00' })
  })

  it('reports the exact difference when a row is missing', () => {
    const r = checkStatement({ opening: 100, closing: 50, rows: [{ amount: 40, direction: 'debit' }] })
    expect(r).toMatchObject({ ok: false, expectedClosing: '60.00', difference: '-10.00' })
  })
})

describe('dedup', () => {
  it('hashes stably and ignores accents/case in the note', async () => {
    const a = await mansaHash({ accountId: 'acc', date: '2026-03-10', type: 'expense', amount: '450', note: 'Gimnasio Demo SA de CV' })
    const b = await mansaHash({ accountId: 'acc', date: '2026-03-10', type: 'expense', amount: 450.0, note: 'gimnasio  demo sa de cv' })
    expect(a).toBe(b)
    expect(a).toMatch(/^m1:[0-9a-f]{64}$/)
  })

  it('matches seed rows without a contentHash within ±1 day, each at most once', async () => {
    const existing = [
      { id: 'seed_1', accountId: 'acc', date: '2026-03-10', type: 'expense' as const, amount: '450.00' },
      { id: 'seed_2', accountId: 'acc', date: '2026-03-15', type: 'income' as const, amount: '30000.00' },
    ]
    const result = await findDuplicates(
      [
        { accountId: 'acc', date: '2026-03-11', type: 'expense', amount: '450' }, // shifted a day by the bank
        { accountId: 'acc', date: '2026-03-11', type: 'expense', amount: '450' }, // a genuine second charge
        { accountId: 'acc', date: '2026-03-15', type: 'income', amount: '30000.00' },
        { accountId: 'other', date: '2026-03-15', type: 'income', amount: '30000.00' },
      ],
      existing,
    )
    expect(result).toEqual([{ existingId: 'seed_1', reason: 'fuzzy' }, null, { existingId: 'seed_2', reason: 'fuzzy' }, null])
  })
})

describe('debt payoff', () => {
  it('matches the closed-form amortization for one loan', () => {
    // 1,000 at 1%/month paying 100: n = -ln(1 - 0.01·1000/100) / ln(1.01) ≈ 10.59 → 11 payments
    const plan = simulatePayoff([{ id: 'a', name: 'A', balance: 1000, aprPct: 12, minPayment: 100 }], 'avalanche')
    expect(plan.months).toBe(11)
    expect(toCents(plan.totalPaid) - toCents(plan.totalInterest)).toBe(100000)
  })

  it('avalanche targets the highest rate, snowball the smallest balance, and avalanche costs less', () => {
    const debts = [
      { id: 'small', name: 'Small 0%', balance: 500, aprPct: 0, minPayment: 50 },
      { id: 'pricey', name: 'Pricey 48%', balance: 3000, aprPct: 48, minPayment: 150 },
    ]
    const cmp = comparePayoff(debts, 300)
    const [avalanche, snowball, minimum] = cmp.plans
    expect(avalanche!.payoffOrder[0]!.id).toBe('pricey')
    expect(snowball!.payoffOrder[0]!.id).toBe('small')
    expect(toCents(avalanche!.totalInterest)).toBeLessThan(toCents(snowball!.totalInterest))
    expect(avalanche!.months!).toBeLessThan(minimum!.months!)
    expect(cmp.monthlyBudget).toBe('500.00')
    expect(toCents(cmp.savingsVsMinimum.avalanche!)).toBeGreaterThan(0)
  })

  it('warns when the minimum does not cover interest', () => {
    const cmp = comparePayoff([{ id: 'x', name: 'Card', balance: 10000, aprPct: 60, minPayment: 400 }], 0)
    expect(cmp.warnings.join(' ')).toMatch(/does not cover the monthly interest/)
    expect(cmp.plans[2]!.months).toBeNull()
  })
})
