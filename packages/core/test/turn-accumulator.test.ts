import { describe, expect, it } from 'vitest'
import { StreamError, TurnAccumulator } from '../src/turn-accumulator.js'
import { textTurn, toolTurn } from './helpers.js'

describe('TurnAccumulator', () => {
  it('joins text deltas and records usage', () => {
    const t = new TurnAccumulator()
    textTurn(['Hola, ', 'tienes ', '$1,000']).forEach((e) => t.push(e))
    expect(t.text()).toBe('Hola, tienes $1,000')
    expect(t.stopReason).toBe('end_turn')
    expect(t.usage?.cacheReadInputTokens).toBe(80)
    expect(t.latencyMs).toBe(42)
    expect(t.assistantMessage()).toEqual({ role: 'assistant', content: [{ text: 'Hola, tienes $1,000' }] })
  })

  it('parses tool input only after all JSON fragments arrive', () => {
    const t = new TurnAccumulator()
    toolTurn('Déjame revisar.', [
      { id: 'tu_1', name: 'aggregate_spending', jsonParts: ['{"groupBy":"cat', 'egory","from":"2026-09-01",', '"to":"2026-09-30"}'] },
      { id: 'tu_2', name: 'get_overview', jsonParts: [] },
    ]).forEach((e) => t.push(e))

    expect(t.stopReason).toBe('tool_use')
    expect(t.toolUses()).toEqual([
      { toolUseId: 'tu_1', name: 'aggregate_spending', input: { groupBy: 'category', from: '2026-09-01', to: '2026-09-30' } },
      { toolUseId: 'tu_2', name: 'get_overview', input: {} },
    ])
    const msg = t.assistantMessage()
    expect(msg.content?.[0]).toEqual({ text: 'Déjame revisar.' })
    expect(msg.content?.[1]).toEqual({ toolUse: { toolUseId: 'tu_1', name: 'aggregate_spending', input: { groupBy: 'category', from: '2026-09-01', to: '2026-09-30' } } })
  })

  it('keeps unparseable tool JSON so the registry can report it', () => {
    const t = new TurnAccumulator()
    toolTurn('', [{ id: 'x', name: 'list_accounts', jsonParts: ['{"type":'] }]).forEach((e) => t.push(e))
    expect(t.toolUses()[0]?.input).toEqual({ __unparseable: '{"type":' })
  })

  it('preserves reasoning blocks with their signature', () => {
    const t = new TurnAccumulator()
    t.push({ contentBlockDelta: { contentBlockIndex: 0, delta: { reasoningContent: { text: 'think ' } } } } as any)
    t.push({ contentBlockDelta: { contentBlockIndex: 0, delta: { reasoningContent: { text: 'more' } } } } as any)
    t.push({ contentBlockDelta: { contentBlockIndex: 0, delta: { reasoningContent: { signature: 'sig123' } } } } as any)
    t.push({ contentBlockDelta: { contentBlockIndex: 1, delta: { text: 'Answer' } } } as any)
    expect(t.assistantMessage().content).toEqual([
      { reasoningContent: { reasoningText: { text: 'think more', signature: 'sig123' } } },
      { text: 'Answer' },
    ])
    expect(t.text()).toBe('Answer')
  })

  it('throws a retryable StreamError on throttling', () => {
    const t = new TurnAccumulator()
    expect(() => t.push({ throttlingException: { message: 'slow down', name: 'ThrottlingException' } } as any)).toThrow(StreamError)
    try {
      t.push({ throttlingException: { message: 'slow down' } } as any)
    } catch (e) {
      expect((e as StreamError).retryable).toBe(true)
    }
  })
})
