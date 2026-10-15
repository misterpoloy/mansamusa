import { describe, expect, it } from 'vitest'
import { encodeSSE, parseSSE } from '../src/sse.js'
import type { AgentEvent } from '../src/types.js'

async function* events(list: AgentEvent[]) {
  for (const e of list) yield e
}

/** Re-chunk a byte stream at arbitrary boundaries, as networks do. */
function rechunk(stream: ReadableStream<Uint8Array>, size: number): ReadableStream<Uint8Array> {
  const reader = stream.getReader()
  let pending = new Uint8Array(0)
  return new ReadableStream({
    async pull(controller) {
      while (pending.length < size) {
        const { value, done } = await reader.read()
        if (done) {
          if (pending.length) controller.enqueue(pending)
          controller.close()
          return
        }
        const merged = new Uint8Array(pending.length + value.length)
        merged.set(pending)
        merged.set(value, pending.length)
        pending = merged
      }
      controller.enqueue(pending.slice(0, size))
      pending = pending.slice(size)
    },
  })
}

describe('SSE', () => {
  const list: AgentEvent[] = [
    { type: 'start', model: 'm', runtime: 'raw' },
    { type: 'text', text: 'Hola 👑 — ¿cómo estás?\nsegunda línea' },
    { type: 'tool_call', id: '1', name: 'get_overview', input: {} },
    { type: 'done', stopReason: 'end_turn', steps: 1, messages: [] },
  ]

  it.each([1, 3, 7, 64, 4096])('round-trips with %i-byte chunks', async (size) => {
    const out: AgentEvent[] = []
    for await (const e of parseSSE(rechunk(encodeSSE(events(list)), size))) out.push(e)
    expect(out).toEqual(list)
  })

  it('turns an iterator failure into an error event', async () => {
    async function* broken(): AsyncGenerator<AgentEvent> {
      yield { type: 'text', text: 'a' }
      throw new Error('boom')
    }
    const out: AgentEvent[] = []
    for await (const e of parseSSE(encodeSSE(broken()))) out.push(e)
    expect(out).toEqual([{ type: 'text', text: 'a' }, { type: 'error', message: 'boom', retryable: false }])
  })
})
