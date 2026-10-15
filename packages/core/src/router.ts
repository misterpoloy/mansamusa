import { BedrockRuntimeClient, type BedrockRuntimeClientConfig, type Message } from '@aws-sdk/client-bedrock-runtime'

export type ModelTask = 'chat' | 'vision' | 'triage' | 'narrate' | 'advisor'

const TASK_ENV: Record<ModelTask, string> = {
  chat: 'MANSA_MODEL_SONNET',
  vision: 'MANSA_MODEL_SONNET',
  triage: 'MANSA_MODEL_HAIKU',
  narrate: 'MANSA_MODEL_HAIKU',
  advisor: 'MANSA_MODEL_OPUS',
}

/** Tiered routing: cheap model for short jobs, mid for chat and vision, top for explicit advice. */
export function modelFor(task: ModelTask, env: Record<string, string | undefined>): string {
  const key = TASK_ENV[task]
  const id = env[key]
  if (!id) throw new Error(`Missing ${key} (Bedrock inference profile id for "${task}")`)
  return id
}

export function createBedrockClient(config: BedrockRuntimeClientConfig = {}): BedrockRuntimeClient {
  return new BedrockRuntimeClient({ region: 'us-east-1', maxAttempts: 2, ...config })
}

/**
 * Append the user's text, merging into a trailing user turn (e.g. tool results left
 * by a capped run) so roles keep alternating as Converse requires.
 */
export function appendUserText(messages: Message[], text: string): Message[] {
  const last = messages[messages.length - 1]
  if (last?.role === 'user') {
    return [...messages.slice(0, -1), { role: 'user', content: [...(last.content ?? []), { text }] }]
  }
  return [...messages, { role: 'user', content: [{ text }] }]
}
