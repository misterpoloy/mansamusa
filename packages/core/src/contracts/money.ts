import { z } from 'zod'

export const Currency = z.enum(['MXN', 'GTQ', 'USD', 'COP', 'TRY', 'EGP', 'EUR'])
export type Currency = z.infer<typeof Currency>

/** Money travels as decimal strings so no float ever touches a balance. */
export const Decimal = z.string().regex(/^-?\d+(\.\d{1,6})?$/, 'decimal string, e.g. "1234.50"')

/** Calendar day in the user's timezone. */
export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')

export const Period = z.string().regex(/^\d{4}-\d{2}$/, 'YYYY-MM')

export const AccountType = z.enum(['checking', 'savings', 'credit_card', 'debit', 'cash'])

export const TransactionType = z.enum(['expense', 'income', 'transfer'])

export const CurrencyTotal = z.object({ currency: Currency, total: Decimal })
