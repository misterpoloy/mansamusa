import { z } from 'zod'
import { defineTool } from './define.js'
import { AccountType, Currency, CurrencyTotal, Decimal, IsoDate, Period, TransactionType } from './money.js'

const Empty = z.object({}).strict()

// ─── get_overview ─────────────────────────────────────────────────────────────

export const getOverview = defineTool({
  name: 'get_overview',
  kind: 'read',
  description: [
    'Snapshot of the user\'s finances right now, per currency (never converted):',
    'cash in bank/debit/cash accounts, credit card debt and limits, loan balances, net position,',
    'and what is due in the next 14 days (card payments, loan payments, recurring charges, expected income).',
    'Use first for broad questions like "¿cómo voy?", "how much do I have?", "what do I owe?".',
  ].join(' '),
  input: Empty,
  output: z.object({
    asOf: IsoDate,
    cash: z.array(z.object({ currency: Currency, total: Decimal, accounts: z.number().int() })),
    creditCards: z.array(z.object({
      currency: Currency,
      owed: Decimal,
      limit: Decimal.nullable(),
      utilizationPct: z.number().nullable(),
      cards: z.number().int(),
    })),
    loans: z.array(z.object({ currency: Currency, balance: Decimal, loans: z.number().int() })),
    netByCurrency: z.array(CurrencyTotal).describe('cash − card debt − loan balance, per currency'),
    upcoming: z.array(z.object({
      kind: z.enum(['card_payment', 'loan_payment', 'recurring', 'income']),
      name: z.string(),
      date: IsoDate,
      amount: Decimal.nullable(),
      currency: Currency,
    })),
    notes: z.array(z.string()),
  }),
})

// ─── list_accounts ────────────────────────────────────────────────────────────

export const AccountSummary = z.object({
  id: z.string(),
  name: z.string(),
  institution: z.string(),
  type: AccountType,
  currency: Currency,
  balance: Decimal.describe('bank/cash: money available; credit_card: amount owed'),
  creditLimit: Decimal.nullable(),
  available: Decimal.nullable(),
  lastFour: z.string().nullable(),
  statementDay: z.number().int().nullable(),
  paymentDueDay: z.number().int().nullable(),
})

export const listAccounts = defineTool({
  name: 'list_accounts',
  kind: 'read',
  description: 'List the user\'s accounts with current balances. Use to resolve an account the user names ("la de débito", "mi tarjeta azul", "dólares") into an accountId for other tools.',
  input: z.object({
    type: z.enum(['all', 'bank', 'credit_card', 'cash']).default('all').describe('bank = checking/savings/debit'),
    currency: Currency.optional(),
    includeInactive: z.boolean().default(false),
  }),
  output: z.object({ accounts: z.array(AccountSummary) }),
})

// ─── search_transactions ──────────────────────────────────────────────────────

export const TransactionRow = z.object({
  id: z.string(),
  date: IsoDate,
  accountId: z.string(),
  account: z.string(),
  type: TransactionType,
  category: z.string(),
  amount: Decimal.describe('always positive; direction is given by type'),
  currency: Currency,
  refAmountMXN: Decimal.describe('MXN equivalent at the time of the transaction'),
  payee: z.string().nullable(),
  note: z.string().nullable(),
  isTransfer: z.boolean(),
})

export const searchTransactions = defineTool({
  name: 'search_transactions',
  kind: 'read',
  description: [
    'Find individual transactions. Use to show or verify specific movements ("muéstrame los gastos de más de 5,000 en agosto").',
    'For totals or rankings use aggregate_spending instead of adding rows yourself.',
    'Transfers between the user\'s own accounts are excluded unless includeTransfers is true.',
  ].join(' '),
  input: z.object({
    accountId: z.string().optional(),
    from: IsoDate.optional(),
    to: IsoDate.optional().describe('inclusive'),
    type: TransactionType.optional(),
    category: z.string().optional().describe('exact category name as returned by aggregate_spending'),
    text: z.string().min(2).optional().describe('matches payee, note and raw category'),
    currency: Currency.optional(),
    minAmount: z.number().nonnegative().optional().describe('in the transaction\'s own currency'),
    maxAmount: z.number().nonnegative().optional(),
    includeTransfers: z.boolean().default(false),
    sort: z.enum(['date_desc', 'date_asc', 'amount_desc']).default('date_desc'),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  output: z.object({
    total: z.number().int().describe('matches before the limit'),
    returned: z.number().int(),
    transactions: z.array(TransactionRow),
  }),
})

// ─── aggregate_spending ───────────────────────────────────────────────────────

export const aggregateSpending = defineTool({
  name: 'aggregate_spending',
  kind: 'read',
  description: [
    'Totals grouped by category, payee, month, account or currency over a date range.',
    'Use for "¿cuánto gasté en…?", top payees, month-over-month trends.',
    'measure "refMXN" sums the MXN equivalent across all currencies; measure "native" sums in each transaction\'s own currency and returns the currency per group.',
    'Transfers between own accounts are excluded by default.',
  ].join(' '),
  input: z.object({
    groupBy: z.enum(['category', 'payee', 'month', 'account', 'currency']),
    from: IsoDate,
    to: IsoDate.describe('inclusive'),
    type: z.enum(['expense', 'income']).default('expense'),
    measure: z.enum(['refMXN', 'native']).default('refMXN'),
    currency: Currency.optional().describe('only transactions in this currency'),
    accountId: z.string().optional(),
    category: z.string().optional(),
    includeTransfers: z.boolean().default(false),
    limit: z.number().int().min(1).max(50).default(10),
  }),
  output: z.object({
    from: IsoDate,
    to: IsoDate,
    type: z.enum(['expense', 'income']),
    measure: z.enum(['refMXN', 'native']),
    groups: z.array(z.object({
      key: z.string(),
      currency: Currency.describe('MXN when measure is refMXN'),
      total: Decimal,
      count: z.number().int(),
    })),
    totals: z.array(z.object({ currency: Currency, total: Decimal, count: z.number().int() })).describe('over all groups, not just the returned ones'),
  }),
})

// ─── get_card_status ──────────────────────────────────────────────────────────

export const getCardStatus = defineTool({
  name: 'get_card_status',
  kind: 'read',
  description: [
    'Credit card detail: amount owed, limit, utilization, statement (corte) and payment due dates,',
    'and the statement balance to pay to avoid interest ("pago para no generar intereses") when the statement day is configured.',
    'Omit accountId for all cards.',
  ].join(' '),
  input: z.object({ accountId: z.string().optional() }),
  output: z.object({
    cards: z.array(z.object({
      id: z.string(),
      name: z.string(),
      institution: z.string(),
      currency: Currency,
      owed: Decimal,
      limit: Decimal.nullable(),
      available: Decimal.nullable(),
      utilizationPct: z.number().nullable(),
      statementDay: z.number().int().nullable(),
      paymentDueDay: z.number().int().nullable(),
      lastStatementDate: IsoDate.nullable(),
      nextStatementDate: IsoDate.nullable(),
      nextDueDate: IsoDate.nullable(),
      statementBalance: Decimal.nullable().describe('owed as of the last statement date; pay this by the due date to avoid interest'),
      paidSinceStatement: Decimal.nullable(),
      spentSinceStatement: Decimal.nullable(),
      notes: z.array(z.string()),
    })),
  }),
})

// ─── get_loans ────────────────────────────────────────────────────────────────

const LoanPaymentRow = z.object({
  period: Period,
  dueDate: IsoDate,
  dueAmount: Decimal,
  principal: Decimal.nullable(),
  interest: Decimal.nullable(),
  paidAmount: Decimal.nullable(),
  status: z.enum(['scheduled', 'paid', 'partial', 'missed', 'skipped']),
})

export const getLoans = defineTool({
  name: 'get_loans',
  kind: 'read',
  description: 'Loans and credits with rate, remaining balance, monthly payment, payoff date, next payment and missed periods. Set includeSchedule for the full amortization table (only when asked).',
  input: z.object({
    loanId: z.string().optional(),
    includeInactive: z.boolean().default(false),
    includeSchedule: z.boolean().default(false),
  }),
  output: z.object({
    loans: z.array(z.object({
      id: z.string(),
      name: z.string(),
      lender: z.string(),
      type: z.string(),
      currency: Currency,
      originalAmount: Decimal,
      currentBalance: Decimal,
      interestRatePct: z.number().describe('annual'),
      monthlyPayment: Decimal,
      termMonths: z.number().int(),
      startDate: IsoDate,
      endDate: IsoDate,
      paidPeriods: z.number().int(),
      remainingPeriods: z.number().int(),
      nextPayment: LoanPaymentRow.nullable(),
      missedPeriods: z.array(Period),
      schedule: z.array(LoanPaymentRow).optional(),
    })),
  }),
})

// ─── get_income ───────────────────────────────────────────────────────────────

export const getIncome = defineTool({
  name: 'get_income',
  kind: 'read',
  description: [
    'Income sources and, for a month, what was expected vs received per pay period.',
    'Semimonthly salaries (quincenas) have subPeriod 1 (paid ~15th) and 2 (paid last day).',
    'Entries with status "projected" have no record yet and come from the source\'s expected amount.',
  ].join(' '),
  input: z.object({
    period: Period.optional().describe('YYYY-MM; defaults to the current month'),
    sourceId: z.string().optional(),
    includeInactive: z.boolean().default(false),
  }),
  output: z.object({
    period: Period,
    sources: z.array(z.object({
      id: z.string(),
      name: z.string(),
      type: z.string(),
      employer: z.string().nullable(),
      currency: Currency,
      frequency: z.string(),
      expectedPerPeriod: Decimal,
      isActive: z.boolean(),
      entries: z.array(z.object({
        subPeriod: z.number().int(),
        expected: Decimal,
        actual: Decimal.nullable(),
        status: z.enum(['expected', 'received', 'partial', 'missed', 'skipped', 'projected']),
        receivedAt: IsoDate.nullable(),
      })),
    })),
    totals: z.array(z.object({ currency: Currency, expected: Decimal, received: Decimal })),
  }),
})

// ─── list_recurring ───────────────────────────────────────────────────────────

export const listRecurring = defineTool({
  name: 'list_recurring',
  kind: 'read',
  description: 'Recurring charges (subscriptions, rent, gym, installments) with next due date, the last charges actually seen, and price drift vs the configured amount. Use for "¿qué suscripciones tengo?", "what went up?".',
  input: z.object({
    activeOnly: z.boolean().default(true),
    accountId: z.string().optional(),
  }),
  output: z.object({
    recurring: z.array(z.object({
      id: z.string(),
      name: z.string(),
      category: z.string(),
      accountId: z.string(),
      account: z.string(),
      currency: Currency,
      amount: Decimal,
      frequency: z.string(),
      dayOfMonth: z.number().int().nullable(),
      nextDueDate: IsoDate.nullable(),
      isActive: z.boolean(),
      lastCharges: z.array(z.object({ date: IsoDate, amount: Decimal })),
      priceDriftPct: z.number().nullable().describe('(latest charge − configured amount) / configured amount × 100'),
    })),
    monthlyEquivalentByCurrency: z.array(CurrencyTotal),
  }),
})

export const readContracts = {
  get_overview: getOverview,
  list_accounts: listAccounts,
  search_transactions: searchTransactions,
  aggregate_spending: aggregateSpending,
  get_card_status: getCardStatus,
  get_loans: getLoans,
  get_income: getIncome,
  list_recurring: listRecurring,
} as const
