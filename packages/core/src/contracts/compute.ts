import { z } from 'zod'
import { defineTool } from './define.js'
import { Currency, Decimal } from './money.js'

const PlanSummary = z.object({
  strategy: z.enum(['avalanche', 'snowball', 'minimum_only']),
  months: z.number().int().nullable().describe('null when the debt never gets paid off at this budget'),
  totalInterest: Decimal,
  totalPaid: Decimal,
  payoffOrder: z.array(z.object({ id: z.string(), name: z.string(), month: z.number().int() })),
})

export const simulateDebtPayoff = defineTool({
  name: 'simulate_debt_payoff',
  kind: 'compute',
  description: [
    'Deterministic payoff simulation over the user\'s real loans and credit cards in one currency.',
    'Compares avalanche (highest rate first) and snowball (smallest balance first) against paying only minimums, given an extra monthly amount.',
    'Always use this instead of estimating months or interest yourself.',
  ].join(' '),
  input: z.object({
    currency: Currency.default('MXN'),
    extraMonthly: Decimal.default('0').describe('extra money per month on top of all minimum payments'),
  }),
  output: z.object({
    currency: Currency,
    debts: z.array(z.object({
      id: z.string(),
      name: z.string(),
      kind: z.enum(['loan', 'credit_card']),
      balance: Decimal,
      aprPct: z.number(),
      minPayment: Decimal,
    })),
    monthlyBudget: Decimal,
    plans: z.array(PlanSummary),
    savingsVsMinimum: z.object({ avalanche: Decimal.nullable(), snowball: Decimal.nullable() }),
    warnings: z.array(z.string()),
  }),
})

export const computeContracts = {
  simulate_debt_payoff: simulateDebtPayoff,
} as const
