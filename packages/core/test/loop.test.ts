import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { defineTool } from '../src/contracts/define.js'
import { runAgent } from '../src/loop.js'
import { createLocalRegistry } from '../src/registry/local.js'
import { appendUserText } from '../src/router.js'
import type { AgentEvent } from '../src/types.js'
import { ctx, fakeClient, textTurn, toolTurn } from './helpers.js'

const balance = defineTool({
  name: 'get_balance',
  kind: 'read',
  description: 'balance',
  input: z.object({ currency: z.enum(['MXN', 'USD']) }),
  output: z.object({ currency: z.string(), total: z.string() }),
})
const draft = defineTool({
  name: 'propose_thing',
  kind: 'propose',
  description: 'draft',
  input: z.object({ note: z.string() }),
  output: z.object({ proposalId: z.string(), status: z.literal('pending'), summary: z.string(), preview: z.unknown(), instructions: z.string() }),
})
const contracts = { get_balance: balance, propose_thing: draft }

async function collect(gen: AsyncGenerator<AgentEvent>) {
  const events: AgentEvent[] = []
  for await (const e of gen) events.push(e)
  return events
}

describe('runAgent', () => {
  it('runs tools with the caller ctx and feeds results back until end_turn', async () => {
    const getBalance = vi.fn(async (input: { currency: string }) => ({ currency: input.currency, total: '1234.50' }))
    const registry = createLocalRegistry(contracts, {
      get_balance: getBalance,
      propose_thing: async () => ({ proposalId: 'p1', status: 'pending' as const, summary: 's', preview: null, instructions: 'approve' }),
    })
    const client = fakeClient([
      toolTurn('Reviso…', [{ id: 'tu_1', name: 'get_balance', jsonParts: ['{"currency":', '"MXN"}'] }]),
      textTurn(['Tienes $1,234.50 MXN.']),
    ])

    const events = await collect(runAgent({
      client, modelId: 'model-x', persona: 'PERSONA', context: 'CTX', registry, ctx,
      messages: [{ role: 'user', content: [{ text: '¿Cuánto tengo?' }] }],
    }))

    expect(getBalance).toHaveBeenCalledWith({ currency: 'MXN' }, ctx)
    expect(events.map((e) => e.type)).toEqual(['start', 'text', 'usage', 'tool_call', 'tool_result', 'text', 'usage', 'done'])

    const done = events.at(-1) as Extract<AgentEvent, { type: 'done' }>
    expect(done.stopReason).toBe('end_turn')
    expect(done.steps).toBe(2)
    expect(done.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant'])
    expect(done.messages[2]?.content?.[0]).toEqual({
      toolResult: { toolUseId: 'tu_1', status: 'success', content: [{ json: { currency: 'MXN', total: '1234.50' } }] },
    })

    // prompt caching: persona then cache point then dynamic context; tools end with a cache point
    const req = client.requests[0]
    expect(req.system).toEqual([{ text: 'PERSONA' }, { cachePoint: { type: 'default' } }, { text: 'CTX' }])
    expect(req.toolConfig.tools.at(-1)).toEqual({ cachePoint: { type: 'default' } })
    expect(req.toolConfig.tools[0].toolSpec.inputSchema.json).toMatchObject({ type: 'object', required: ['currency'] })
    expect(req.toolConfig.tools[0].toolSpec.inputSchema.json.$schema).toBeUndefined()
  })

  it('returns validation errors to the model instead of throwing', async () => {
    const registry = createLocalRegistry(contracts, {
      get_balance: async () => ({ currency: 'MXN', total: '1' }),
      propose_thing: async () => ({ proposalId: 'p1', status: 'pending' as const, summary: 's', preview: null, instructions: 'i' }),
    })
    const client = fakeClient([
      toolTurn('', [{ id: 'tu_1', name: 'get_balance', jsonParts: ['{"currency":"EUR"}'] }]),
      textTurn(['ok']),
    ])
    const events = await collect(runAgent({ client, modelId: 'm', persona: 'p', registry, ctx, messages: [{ role: 'user', content: [{ text: 'x' }] }] }))
    const result = events.find((e) => e.type === 'tool_result') as Extract<AgentEvent, { type: 'tool_result' }>
    expect(result.ok).toBe(false)
    expect(String(result.data)).toMatch(/^Invalid input: currency/)
    expect(client.requests[1].messages[2].content[0].toolResult.status).toBe('error')
  })

  it('emits a proposal event for successful propose tools', async () => {
    const registry = createLocalRegistry(contracts, {
      get_balance: async () => ({ currency: 'MXN', total: '1' }),
      propose_thing: async () => ({ proposalId: 'prop_9', status: 'pending' as const, summary: '3 movimientos', preview: { rows: 3 }, instructions: 'Aprueba en la app' }),
    })
    const client = fakeClient([toolTurn('', [{ id: 't', name: 'propose_thing', jsonParts: ['{"note":"x"}'] }]), textTurn(['Listo para aprobar.'])])
    const events = await collect(runAgent({ client, modelId: 'm', persona: 'p', registry, ctx, messages: [{ role: 'user', content: [{ text: 'x' }] }] }))
    expect(events.find((e) => e.type === 'proposal')).toEqual({
      type: 'proposal',
      proposal: { proposalId: 'prop_9', kind: 'propose_thing', summary: '3 movimientos', status: 'pending', preview: { rows: 3 } },
    })
  })

  it('stops at maxSteps and reports it', async () => {
    const registry = createLocalRegistry(contracts, {
      get_balance: async () => ({ currency: 'MXN', total: '1' }),
      propose_thing: async () => ({ proposalId: 'p', status: 'pending' as const, summary: '', preview: null, instructions: '' }),
    })
    const loopTurn = () => toolTurn('', [{ id: crypto.randomUUID(), name: 'get_balance', jsonParts: ['{"currency":"MXN"}'] }])
    const client = fakeClient([loopTurn(), loopTurn()])
    const events = await collect(runAgent({ client, modelId: 'm', persona: 'p', registry, ctx, maxSteps: 2, messages: [{ role: 'user', content: [{ text: 'x' }] }] }))
    const done = events.at(-1) as Extract<AgentEvent, { type: 'done' }>
    expect(done.stopReason).toBe('max_steps')
    expect(events.some((e) => e.type === 'error')).toBe(true)
    // history ends on a user turn; the next message must merge into it
    const next = appendUserText(done.messages, 'continue')
    expect(next.at(-1)?.role).toBe('user')
    expect(next.filter((m, i) => i > 0 && m.role === next[i - 1]?.role)).toHaveLength(0)
  })

  it('surfaces a send failure as an error event', async () => {
    const registry = createLocalRegistry({ get_balance: balance }, { get_balance: async () => ({ currency: 'MXN', total: '1' }) })
    const client = { async send() { throw Object.assign(new Error('not authorized'), { name: 'AccessDeniedException' }) } }
    const events = await collect(runAgent({ client, modelId: 'm', persona: 'p', registry, ctx, messages: [{ role: 'user', content: [{ text: 'x' }] }] }))
    expect(events.map((e) => e.type)).toEqual(['start', 'error', 'done'])
    expect(events[1]).toMatchObject({ type: 'error', retryable: false, message: expect.stringContaining('AccessDeniedException') })
  })
})
