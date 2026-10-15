import type { Tool } from '@aws-sdk/client-bedrock-runtime'
import type { ContractSet, ToolHandlers } from '../contracts/define.js'
import type { ToolCtx } from '../types.js'
import { toToolSpec } from './to-tool-spec.js'
import type { Registry, ToolOutcome } from './types.js'

export interface LocalRegistryOptions {
  /** Called when a handler throws or returns data that breaks its output schema. */
  onHandlerError?: (name: string, error: unknown) => void
}

/** Zod issue list → one line the model can act on ("from: YYYY-MM-DD; limit: <= 50"). */
function describeIssues(error: { issues: { path: (string | number)[]; message: string }[] }): string {
  return error.issues.map((i) => `${i.path.join('.') || '(input)'}: ${i.message}`).join('; ')
}

/**
 * Runs handlers in-process. Never throws: every failure becomes a tool result the
 * model can read and recover from, and no ZodError ever leaves the core.
 */
export function createLocalRegistry<S extends ContractSet>(
  contracts: S,
  handlers: ToolHandlers<S>,
  options: LocalRegistryOptions = {},
): Registry {
  const byName = new Map(Object.values(contracts).map((c) => [c.name, c]))
  for (const [key, contract] of Object.entries(contracts)) {
    if (key !== contract.name) throw new Error(`Contract key "${key}" must equal its tool name "${contract.name}"`)
  }
  const specs: Tool[] = Object.values(contracts).map(toToolSpec)

  return {
    async specs() {
      return specs
    },
    kindOf(name) {
      return byName.get(name)?.kind
    },
    async call(name: string, input: unknown, ctx: ToolCtx): Promise<ToolOutcome> {
      const contract = byName.get(name)
      if (!contract) return { ok: false, error: `Unknown tool "${name}"` }

      const parsed = contract.input.safeParse(input ?? {})
      if (!parsed.success) return { ok: false, error: `Invalid input: ${describeIssues(parsed.error)}` }

      let raw: unknown
      try {
        const handler = handlers[name as keyof S] as (input: unknown, ctx: ToolCtx) => Promise<unknown>
        raw = await handler(parsed.data, ctx)
      } catch (error) {
        options.onHandlerError?.(name, error)
        const message = error instanceof Error ? error.message : String(error)
        return { ok: false, error: `Tool failed: ${message}` }
      }

      const out = contract.output.safeParse(raw)
      if (!out.success) {
        options.onHandlerError?.(name, out.error)
        return { ok: false, error: `Tool returned malformed data: ${describeIssues(out.error)}` }
      }
      return { ok: true, data: out.data }
    },
  }
}
