import { z } from 'zod'
import { defineTool } from './define.js'
import { Currency, Decimal, IsoDate, Period } from './money.js'

/**
 * Propose tools never write. The host stores a pending proposal, computes a preview
 * from its own data (balances before/after, duplicates) and the user approves it.
 * The host re-validates the stored draft against these schemas at apply time.
 */

export const DraftTransaction = z.object({
  accountId: z.string(),
  date: IsoDate,
  type: z.enum(['expense', 'income']),
  amount: Decimal.describe('positive, in the account currency'),
  currency: Currency,
  category: z.string(),
  categoryRaw: z.string().optional(),
  payee: z.string().optional(),
  note: z.string().optional(),
  refAmountMXN: Decimal.optional().describe('only when the currency is not MXN and the rate is known'),
  transfer: z.object({
    groupKey: z.string().describe('same key on both legs of one transfer'),
    counterpartAccountId: z.string().optional(),
  }).optional(),
})
export type DraftTransaction = z.infer<typeof DraftTransaction>

export const CreateTransactionsDraft = z.object({
  kind: z.literal('create_transactions'),
  source: z.enum(['chat', 'statement', 'telegram']).default('chat'),
  statementUploadId: z.string().optional(),
  transactions: z.array(DraftTransaction).min(1).max(200),
})

export const AdjustBalanceDraft = z.object({
  kind: z.literal('adjust_balance'),
  accountId: z.string(),
  targetBalance: Decimal.describe('bank: money available; credit card: amount owed'),
  asOf: IsoDate,
  reason: z.string(),
})

export const LoanPaymentDraft = z.object({
  kind: z.literal('loan_payment'),
  loanId: z.string(),
  period: Period,
  paidAmount: Decimal,
  paidAt: IsoDate,
  fromAccountId: z.string().optional(),
})

export const IncomeConfirmDraft = z.object({
  kind: z.literal('income_confirm'),
  incomeSourceId: z.string(),
  period: Period,
  subPeriod: z.number().int().min(1).max(2).default(1),
  actualAmount: Decimal,
  receivedAt: IsoDate,
  accountId: z.string().optional(),
})

export const RecurringDraft = z.object({
  kind: z.literal('recurring'),
  recurringId: z.string().optional().describe('omit to create a new one'),
  accountId: z.string(),
  name: z.string(),
  category: z.string(),
  amount: Decimal,
  currency: Currency,
  frequency: z.enum(['daily', 'weekly', 'twice_monthly', 'monthly', 'quarterly', 'annual']),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
})

export const ProposalDraft = z.discriminatedUnion('kind', [
  CreateTransactionsDraft,
  AdjustBalanceDraft,
  LoanPaymentDraft,
  IncomeConfirmDraft,
  RecurringDraft,
])
export type ProposalDraft = z.infer<typeof ProposalDraft>
export type ProposalKind = ProposalDraft['kind']

export const ProposalResult = z.object({
  proposalId: z.string(),
  status: z.literal('pending'),
  summary: z.string(),
  preview: z.unknown(),
  instructions: z.string().describe('tell the user to review and approve it in the app'),
})

export const proposeTransactions = defineTool({
  name: 'propose_transactions',
  kind: 'propose',
  description: 'Draft one or more transactions for the user to approve (nothing is written until they approve). Use account ids from list_accounts. For a transfer between own accounts send both legs with the same transfer.groupKey.',
  input: CreateTransactionsDraft.omit({ kind: true }),
  output: ProposalResult,
})

export const proposeBalanceAdjustment = defineTool({
  name: 'propose_balance_adjustment',
  kind: 'propose',
  description: 'Draft a reconciliation that sets an account to the balance the user (or a statement) reports. Use only when the user gives an explicit balance.',
  input: AdjustBalanceDraft.omit({ kind: true }),
  output: ProposalResult,
})

export const proposeLoanPayment = defineTool({
  name: 'propose_loan_payment',
  kind: 'propose',
  description: 'Draft marking a loan period as paid (and the matching transaction). Use loan ids and periods from get_loans.',
  input: LoanPaymentDraft.omit({ kind: true }),
  output: ProposalResult,
})

export const proposeIncomeConfirmation = defineTool({
  name: 'propose_income_confirmation',
  kind: 'propose',
  description: 'Draft confirming that an expected income payment (e.g. a quincena) arrived, with the actual amount. Use ids from get_income.',
  input: IncomeConfirmDraft.omit({ kind: true }),
  output: ProposalResult,
})

export const proposeRecurring = defineTool({
  name: 'propose_recurring',
  kind: 'propose',
  description: 'Draft creating or updating a recurring charge (subscription, rent, installment).',
  input: RecurringDraft.omit({ kind: true }),
  output: ProposalResult,
})

export const proposeContracts = {
  propose_transactions: proposeTransactions,
  propose_balance_adjustment: proposeBalanceAdjustment,
  propose_loan_payment: proposeLoanPayment,
  propose_income_confirmation: proposeIncomeConfirmation,
  propose_recurring: proposeRecurring,
} as const
