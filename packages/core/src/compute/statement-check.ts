import { fromCents, toCents } from './money.js'

export interface StatementRow {
  amount: string | number
  direction: 'credit' | 'debit'
}

export interface StatementCheck {
  ok: boolean
  opening: string
  credits: string
  debits: string
  expectedClosing: string
  statedClosing: string
  /** statedClosing − expectedClosing; "0.00" when the statement adds up. */
  difference: string
  rows: number
}

/**
 * opening + Σcredits − Σdebits must equal the stated closing balance to the cent.
 * For a credit card pass balances as "amount owed" and swap meaning: charges are
 * credits to the debt, payments are debits.
 */
export function checkStatement(input: { opening: string | number; closing: string | number; rows: StatementRow[] }): StatementCheck {
  const opening = toCents(input.opening)
  const closing = toCents(input.closing)
  let credits = 0
  let debits = 0
  for (const row of input.rows) {
    const cents = Math.abs(toCents(row.amount))
    if (row.direction === 'credit') credits += cents
    else debits += cents
  }
  const expected = opening + credits - debits
  return {
    ok: expected === closing,
    opening: fromCents(opening),
    credits: fromCents(credits),
    debits: fromCents(debits),
    expectedClosing: fromCents(expected),
    statedClosing: fromCents(closing),
    difference: fromCents(closing - expected),
    rows: input.rows.length,
  }
}
