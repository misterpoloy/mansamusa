// SSE encode/parse for AgentEvent streams. No Node imports: used by Next.js routes,
// the AgentCore container, browsers and React Native (expo/fetch).
import type { AgentEvent } from './types.js'

export const SSE_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
} as const

export function formatSSE(event: AgentEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`
}

/** Turn an event iterator into a byte stream. Iterator errors become an `error` event. */
export function encodeSSE(
  events: AsyncIterable<AgentEvent>,
  hooks: { onEvent?: (e: AgentEvent) => void | Promise<void>; onClose?: () => void | Promise<void> } = {},
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const iterator = events[Symbol.asyncIterator]()
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await iterator.next()
        if (done) {
          await hooks.onClose?.()
          controller.close()
          return
        }
        await hooks.onEvent?.(value)
        controller.enqueue(encoder.encode(formatSSE(value)))
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        controller.enqueue(encoder.encode(formatSSE({ type: 'error', message, retryable: false })))
        await hooks.onClose?.()
        controller.close()
      }
    },
    async cancel() {
      await iterator.return?.()
      await hooks.onClose?.()
    },
  })
}

/** Parse an SSE byte stream back into AgentEvents (handles events split across chunks). */
export async function* parseSSE(stream: ReadableStream<Uint8Array>): AsyncGenerator<AgentEvent> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (value) buffer += decoder.decode(value, { stream: true })
      if (done) buffer += decoder.decode()
      let boundary = buffer.indexOf('\n\n')
      while (boundary !== -1) {
        const raw = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        const event = parseBlock(raw)
        if (event) yield event
        boundary = buffer.indexOf('\n\n')
      }
      if (done) break
    }
    const tail = parseBlock(buffer)
    if (tail) yield tail
  } finally {
    reader.releaseLock()
  }
}

function parseBlock(raw: string): AgentEvent | null {
  const data = raw
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n')
  if (!data) return null
  try {
    return JSON.parse(data) as AgentEvent
  } catch {
    return null
  }
}
