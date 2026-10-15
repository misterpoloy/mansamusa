import type { ConverseStreamOutput } from '@aws-sdk/client-bedrock-runtime'
import type { ToolCtx } from '../src/types.js'

export const ctx: ToolCtx = {
  tenantId: 'tenant_test',
  userId: 'user_test',
  role: 'owner',
  locale: 'auto',
  channel: 'cli',
  runtime: 'raw',
  demo: false,
  timezone: 'America/Mexico_City',
}

export async function* streamOf(events: ConverseStreamOutput[]) {
  for (const e of events) yield e
}

/** A text-only assistant turn, split into deltas the way Bedrock sends it. */
export function textTurn(parts: string[], stopReason = 'end_turn'): ConverseStreamOutput[] {
  return [
    { messageStart: { role: 'assistant' } },
    ...parts.map((text) => ({ contentBlockDelta: { contentBlockIndex: 0, delta: { text } } }) as ConverseStreamOutput),
    { contentBlockStop: { contentBlockIndex: 0 } },
    { messageStop: { stopReason } },
    { metadata: { usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120, cacheReadInputTokens: 80, cacheWriteInputTokens: 0 }, metrics: { latencyMs: 42 } } },
  ] as ConverseStreamOutput[]
}

/** A turn that says something and then calls tools, with JSON input split into fragments. */
export function toolTurn(preamble: string, calls: { id: string; name: string; jsonParts: string[] }[]): ConverseStreamOutput[] {
  const events: ConverseStreamOutput[] = [{ messageStart: { role: 'assistant' } }]
  if (preamble) {
    events.push({ contentBlockDelta: { contentBlockIndex: 0, delta: { text: preamble } } } as ConverseStreamOutput)
    events.push({ contentBlockStop: { contentBlockIndex: 0 } })
  }
  calls.forEach((c, i) => {
    const index = i + 1
    events.push({ contentBlockStart: { contentBlockIndex: index, start: { toolUse: { toolUseId: c.id, name: c.name } } } } as ConverseStreamOutput)
    for (const input of c.jsonParts) {
      events.push({ contentBlockDelta: { contentBlockIndex: index, delta: { toolUse: { input } } } } as ConverseStreamOutput)
    }
    events.push({ contentBlockStop: { contentBlockIndex: index } })
  })
  events.push({ messageStop: { stopReason: 'tool_use' } })
  events.push({ metadata: { usage: { inputTokens: 200, outputTokens: 30, totalTokens: 230, cacheReadInputTokens: 0, cacheWriteInputTokens: 150 }, metrics: { latencyMs: 55 } } } as ConverseStreamOutput)
  return events
}

/** Minimal stand-in for BedrockRuntimeClient: returns one scripted turn per send(). */
export function fakeClient(turns: ConverseStreamOutput[][]) {
  const requests: any[] = []
  let i = 0
  return {
    requests,
    async send(command: any) {
      requests.push(structuredClone(command.input))
      const turn = turns[i++]
      if (!turn) throw new Error('fakeClient: no more scripted turns')
      return { stream: streamOf(turn) } as any
    },
  }
}
