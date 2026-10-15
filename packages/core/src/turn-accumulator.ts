import type { ContentBlock, ConverseStreamOutput, Message, TokenUsage } from '@aws-sdk/client-bedrock-runtime'

type Block =
  | { kind: 'text'; text: string }
  | { kind: 'tool'; toolUseId: string; name: string; json: string }
  | { kind: 'reasoning'; text: string; signature?: string; redacted?: Uint8Array }

export interface ToolUse {
  toolUseId: string
  name: string
  input: unknown
}

export class StreamError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message)
    this.name = 'StreamError'
  }
}

/**
 * Rebuilds one assistant turn from ConverseStream events. Text arrives as deltas,
 * tool input arrives as JSON string fragments that only parse once the block stops,
 * and reasoning blocks must be echoed back verbatim (with signature) on the next call.
 */
export class TurnAccumulator {
  private blocks = new Map<number, Block>()
  stopReason: string | undefined
  usage: TokenUsage | undefined
  latencyMs: number | undefined

  push(event: ConverseStreamOutput): void {
    const err =
      event.internalServerException ?? event.modelStreamErrorException ?? event.validationException ??
      event.throttlingException ?? event.serviceUnavailableException
    if (err) {
      const retryable = Boolean(event.throttlingException || event.serviceUnavailableException || event.internalServerException)
      throw new StreamError(err.message ?? 'Bedrock stream error', retryable)
    }

    if (event.contentBlockStart) {
      const index = event.contentBlockStart.contentBlockIndex ?? 0
      const toolUse = event.contentBlockStart.start?.toolUse
      if (toolUse) {
        this.blocks.set(index, { kind: 'tool', toolUseId: toolUse.toolUseId ?? '', name: toolUse.name ?? '', json: '' })
      }
      return
    }

    if (event.contentBlockDelta) {
      const index = event.contentBlockDelta.contentBlockIndex ?? 0
      const delta = event.contentBlockDelta.delta
      if (!delta) return
      if (delta.text !== undefined) {
        const block = this.blocks.get(index)
        if (block?.kind === 'text') block.text += delta.text
        else this.blocks.set(index, { kind: 'text', text: delta.text })
      } else if (delta.toolUse) {
        const block = this.blocks.get(index)
        if (block?.kind === 'tool') block.json += delta.toolUse.input ?? ''
      } else if (delta.reasoningContent) {
        let block = this.blocks.get(index)
        if (block?.kind !== 'reasoning') {
          block = { kind: 'reasoning', text: '' }
          this.blocks.set(index, block)
        }
        const r = delta.reasoningContent
        if (r.text) block.text += r.text
        if (r.signature) block.signature = r.signature
        if (r.redactedContent) block.redacted = r.redactedContent
      }
      return
    }

    if (event.messageStop) {
      this.stopReason = event.messageStop.stopReason
      return
    }

    if (event.metadata) {
      this.usage = event.metadata.usage
      this.latencyMs = event.metadata.metrics?.latencyMs
    }
  }

  private ordered(): Block[] {
    return [...this.blocks.entries()].sort(([a], [b]) => a - b).map(([, b]) => b)
  }

  toolUses(): ToolUse[] {
    return this.ordered()
      .filter((b): b is Extract<Block, { kind: 'tool' }> => b.kind === 'tool')
      .map((b) => ({ toolUseId: b.toolUseId, name: b.name, input: parseToolInput(b.json) }))
  }

  text(): string {
    return this.ordered().filter((b) => b.kind === 'text').map((b) => (b as { text: string }).text).join('')
  }

  assistantMessage(): Message {
    const content: ContentBlock[] = []
    for (const b of this.ordered()) {
      if (b.kind === 'text') {
        if (b.text.length > 0) content.push({ text: b.text })
      } else if (b.kind === 'tool') {
        content.push({ toolUse: { toolUseId: b.toolUseId, name: b.name, input: parseToolInput(b.json) as never } })
      } else if (b.redacted) {
        content.push({ reasoningContent: { redactedContent: b.redacted } })
      } else {
        content.push({ reasoningContent: { reasoningText: { text: b.text, signature: b.signature } } })
      }
    }
    return { role: 'assistant', content }
  }
}

function parseToolInput(json: string): unknown {
  if (json.trim() === '') return {}
  try {
    return JSON.parse(json)
  } catch {
    // Keep the raw string so the registry reports a validation error the model can fix.
    return { __unparseable: json }
  }
}
