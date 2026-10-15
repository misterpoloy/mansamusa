import {
  ConverseStreamCommand,
  type BedrockRuntimeClient,
  type ContentBlock,
  type GuardrailStreamConfiguration,
  type InferenceConfiguration,
  type Message,
  type SystemContentBlock,
  type Tool,
} from '@aws-sdk/client-bedrock-runtime'
import type { Registry, ToolOutcome } from './registry/types.js'
import { StreamError, TurnAccumulator } from './turn-accumulator.js'
import type { AgentEvent, ProposalCard, ToolCtx } from './types.js'

export interface RunAgentOptions {
  client: Pick<BedrockRuntimeClient, 'send'>
  modelId: string
  /** Stable instructions. Cached together with the tool specs. */
  persona: string
  /** Per-request context (today's date, channel, locale). Placed after the cache point. */
  context?: string
  /** Conversation so far, ending with the user's new message. Not mutated. */
  messages: Message[]
  registry: Registry
  ctx: ToolCtx
  maxSteps?: number
  guardrail?: GuardrailStreamConfiguration
  inference?: InferenceConfiguration
  /** Model-specific fields, e.g. extended thinking for the advisor. */
  additionalModelRequestFields?: Record<string, unknown>
  promptCaching?: boolean
  signal?: AbortSignal
  /** Hook to rewrite tool output before the model and the client see it (demo masking). */
  transformToolResult?: (name: string, outcome: ToolOutcome, ctx: ToolCtx) => Promise<ToolOutcome>
}

const DEFAULT_MAX_STEPS = 8
const MAX_SEND_RETRIES = 2

/**
 * The whole agent: call ConverseStream, stream text out, run any requested tools,
 * feed results back, repeat until the model stops asking for tools.
 * Runs unchanged in a Next.js route (raw) and in the AgentCore Runtime container (core).
 */
export async function* runAgent(opts: RunAgentOptions): AsyncGenerator<AgentEvent, void, void> {
  const maxSteps = opts.maxSteps ?? DEFAULT_MAX_STEPS
  const caching = opts.promptCaching ?? true
  const messages: Message[] = [...opts.messages]

  const specs = await opts.registry.specs()
  const tools: Tool[] = caching && specs.length > 0 ? [...specs, { cachePoint: { type: 'default' } }] : specs
  const system: SystemContentBlock[] = [{ text: opts.persona }]
  if (caching) system.push({ cachePoint: { type: 'default' } })
  if (opts.context) system.push({ text: opts.context })

  yield { type: 'start', model: opts.modelId, runtime: opts.ctx.runtime }

  let stopReason = 'max_steps'
  let step = 0
  for (; step < maxSteps; step++) {
    const command = new ConverseStreamCommand({
      modelId: opts.modelId,
      system,
      messages,
      toolConfig: tools.length > 0 ? { tools } : undefined,
      guardrailConfig: opts.guardrail,
      inferenceConfig: opts.inference ?? { maxTokens: 4096 },
      additionalModelRequestFields: opts.additionalModelRequestFields as never,
    })

    const turn = new TurnAccumulator()
    try {
      const response = await sendWithRetry(opts, command)
      if (!response.stream) throw new StreamError('Bedrock returned no stream', true)
      for await (const event of response.stream) {
        turn.push(event)
        const text = event.contentBlockDelta?.delta?.text
        if (text) yield { type: 'text', text }
      }
    } catch (error) {
      if (opts.signal?.aborted) {
        stopReason = 'aborted'
        break
      }
      yield { type: 'error', message: errorMessage(error), retryable: isRetryable(error) }
      stopReason = 'error'
      break
    }

    yield {
      type: 'usage',
      step,
      inputTokens: turn.usage?.inputTokens ?? 0,
      outputTokens: turn.usage?.outputTokens ?? 0,
      cacheReadTokens: turn.usage?.cacheReadInputTokens ?? 0,
      cacheWriteTokens: turn.usage?.cacheWriteInputTokens ?? 0,
      latencyMs: turn.latencyMs ?? null,
    }

    const assistant = turn.assistantMessage()
    if (assistant.content && assistant.content.length > 0) messages.push(assistant)

    stopReason = turn.stopReason ?? 'end_turn'
    if (stopReason !== 'tool_use') break

    const results: ContentBlock[] = []
    for (const use of turn.toolUses()) {
      yield { type: 'tool_call', id: use.toolUseId, name: use.name, input: use.input }
      const started = Date.now()
      let outcome = await opts.registry.call(use.name, use.input, opts.ctx)
      if (opts.transformToolResult) outcome = await opts.transformToolResult(use.name, outcome, opts.ctx)
      const ms = Date.now() - started
      yield { type: 'tool_result', id: use.toolUseId, name: use.name, ok: outcome.ok, data: outcome.ok ? outcome.data : outcome.error, ms }

      const proposal = outcome.ok && opts.registry.kindOf(use.name) === 'propose' ? asProposal(use.name, outcome.data) : null
      if (proposal) yield { type: 'proposal', proposal }

      results.push({
        toolResult: {
          toolUseId: use.toolUseId,
          status: outcome.ok ? 'success' : 'error',
          content: outcome.ok ? [{ json: asJsonObject(outcome.data) as never }] : [{ text: outcome.error }],
        },
      })
    }
    messages.push({ role: 'user', content: results })
  }

  if (step >= maxSteps) {
    stopReason = 'max_steps'
    yield { type: 'error', message: `Stopped after ${maxSteps} tool steps`, retryable: false }
  }
  yield { type: 'done', stopReason, steps: Math.min(step + 1, maxSteps), messages }
}

async function sendWithRetry(opts: RunAgentOptions, command: ConverseStreamCommand) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await opts.client.send(command, { abortSignal: opts.signal })
    } catch (error) {
      if (attempt >= MAX_SEND_RETRIES || !isRetryable(error) || opts.signal?.aborted) throw error
      await new Promise((r) => setTimeout(r, 400 * 2 ** attempt))
    }
  }
}

function isRetryable(error: unknown): boolean {
  if (error instanceof StreamError) return error.retryable
  const name = (error as { name?: string })?.name ?? ''
  return ['ThrottlingException', 'ServiceUnavailableException', 'InternalServerException', 'ModelNotReadyException'].includes(name)
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`
  return String(error)
}

/** Converse requires a JSON object in toolResult.json, never a bare array or scalar. */
function asJsonObject(data: unknown): Record<string, unknown> {
  if (data !== null && typeof data === 'object' && !Array.isArray(data)) return data as Record<string, unknown>
  return { result: data ?? null }
}

function asProposal(kind: string, data: unknown): ProposalCard | null {
  const d = data as Partial<ProposalCard> & { proposalId?: string }
  if (!d?.proposalId) return null
  return { proposalId: d.proposalId, kind, summary: d.summary ?? '', status: d.status ?? 'pending', preview: d.preview ?? null }
}
