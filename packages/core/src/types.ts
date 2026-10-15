import type { Message } from '@aws-sdk/client-bedrock-runtime'

export type Locale = 'es' | 'en' | 'auto'
export type Channel = 'web' | 'ios' | 'telegram' | 'alert' | 'cli'
export type RuntimeKind = 'raw' | 'core'
export type Role = 'owner' | 'admin' | 'viewer'

/**
 * Who is asking, built by the host from a verified session or JWT.
 * Tools never accept a tenant id as input; they read it from here.
 */
export interface ToolCtx {
  tenantId: string
  userId: string
  role: Role
  locale: Locale
  channel: Channel
  runtime: RuntimeKind
  /** Demo mode: stricter guardrail and masked tool output (stage use). */
  demo: boolean
  /** IANA zone used for "today", statement windows and paydays. */
  timezone: string
}

export interface ProposalCard {
  proposalId: string
  kind: string
  summary: string
  status: 'pending' | 'approved' | 'rejected' | 'applied' | 'failed' | 'expired'
  preview: unknown
}

export interface UsageEvent {
  type: 'usage'
  step: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  latencyMs: number | null
}

/** Everything the loop emits. Hosts forward these over SSE unchanged. */
export type AgentEvent =
  | { type: 'start'; model: string; runtime: RuntimeKind }
  | { type: 'text'; text: string }
  | { type: 'tool_call'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; id: string; name: string; ok: boolean; data: unknown; ms: number }
  | { type: 'proposal'; proposal: ProposalCard }
  | UsageEvent
  | { type: 'error'; message: string; retryable: boolean }
  | { type: 'done'; stopReason: string; steps: number; messages: Message[] }

export type AgentEventType = AgentEvent['type']
