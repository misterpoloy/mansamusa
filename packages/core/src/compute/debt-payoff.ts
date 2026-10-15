import { fromCents, toCents } from './money.js'

export interface Debt {
  id: string
  name: string
  balance: string | number
  /** Annual percentage rate, e.g. 42.5 */
  aprPct: number
  minPayment: string | number
}

export type Strategy = 'avalanche' | 'snowball' | 'minimum_only'

export interface PayoffPlan {
  strategy: Strategy
  /** null when the budget never pays everything off within the horizon. */
  months: number | null
  totalInterest: string
  totalPaid: string
  payoffOrder: { id: string; name: string; month: number }[]
}

const HORIZON_MONTHS = 600

/**
 * Month-by-month simulation in integer cents. Each month: accrue interest, pay every
 * minimum, then send all remaining budget (extra + minimums freed by paid-off debts)
 * to the target debt chosen by the strategy.
 */
export function simulatePayoff(debts: Debt[], strategy: Strategy, extraMonthly: string | number = 0): PayoffPlan {
  const state = debts.map((d) => ({
    id: d.id,
    name: d.name,
    balance: Math.max(0, toCents(d.balance)),
    monthlyRate: d.aprPct / 100 / 12,
    min: Math.max(0, toCents(d.minPayment)),
    originalBalance: Math.max(0, toCents(d.balance)),
  }))
  const extra = strategy === 'minimum_only' ? 0 : Math.max(0, toCents(extraMonthly))
  const budget = state.reduce((s, d) => s + d.min, 0) + extra

  let totalInterest = 0
  let totalPaid = 0
  const payoffOrder: PayoffPlan['payoffOrder'] = []
  let month = 0

  while (state.some((d) => d.balance > 0) && month < HORIZON_MONTHS) {
    month++
    for (const d of state) {
      if (d.balance <= 0) continue
      const interest = Math.round(d.balance * d.monthlyRate)
      d.balance += interest
      totalInterest += interest
    }

    let available = strategy === 'minimum_only' ? Infinity : budget
    for (const d of state) {
      if (d.balance <= 0) continue
      const pay = Math.min(d.min, d.balance, available)
      d.balance -= pay
      totalPaid += pay
      if (available !== Infinity) available -= pay
    }

    if (strategy !== 'minimum_only') {
      const order = state
        .filter((d) => d.balance > 0)
        .sort((a, b) => (strategy === 'avalanche' ? b.monthlyRate - a.monthlyRate || a.balance - b.balance : a.balance - b.balance || b.monthlyRate - a.monthlyRate))
      for (const d of order) {
        if (available <= 0) break
        const pay = Math.min(d.balance, available)
        d.balance -= pay
        totalPaid += pay
        available -= pay
      }
    }

    for (const d of state) {
      if (d.originalBalance > 0 && d.balance <= 0 && !payoffOrder.some((p) => p.id === d.id)) {
        payoffOrder.push({ id: d.id, name: d.name, month })
      }
    }
  }

  const done = state.every((d) => d.balance <= 0)
  return {
    strategy,
    months: done ? month : null,
    totalInterest: fromCents(totalInterest),
    totalPaid: fromCents(totalPaid),
    payoffOrder,
  }
}

export interface PayoffComparison {
  monthlyBudget: string
  plans: PayoffPlan[]
  savingsVsMinimum: { avalanche: string | null; snowball: string | null }
  warnings: string[]
}

export function comparePayoff(debts: Debt[], extraMonthly: string | number = 0): PayoffComparison {
  const warnings: string[] = []
  for (const d of debts) {
    const firstInterest = Math.round(Math.max(0, toCents(d.balance)) * (d.aprPct / 100 / 12))
    if (toCents(d.minPayment) <= firstInterest && toCents(d.balance) > 0) {
      warnings.push(`${d.name}: the minimum payment does not cover the monthly interest, so the balance grows when paying only the minimum.`)
    }
  }
  const minimum = simulatePayoff(debts, 'minimum_only')
  const avalanche = simulatePayoff(debts, 'avalanche', extraMonthly)
  const snowball = simulatePayoff(debts, 'snowball', extraMonthly)
  const saving = (p: PayoffPlan) =>
    minimum.months === null || p.months === null ? null : fromCents(toCents(minimum.totalInterest) - toCents(p.totalInterest))
  if (minimum.months === null) warnings.push(`Paying only minimums does not clear the debt within ${HORIZON_MONTHS / 12} years.`)
  return {
    monthlyBudget: fromCents(debts.reduce((s, d) => s + toCents(d.minPayment), 0) + Math.max(0, toCents(extraMonthly))),
    plans: [avalanche, snowball, minimum],
    savingsVsMinimum: { avalanche: saving(avalanche), snowball: saving(snowball) },
    warnings,
  }
}
