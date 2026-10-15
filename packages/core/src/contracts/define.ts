import type { z } from 'zod'
import type { ToolCtx } from '../types.js'

/**
 * read    — answers questions, no side effects
 * propose — drafts a change the user must approve in the app
 * compute — deterministic math over data the handler gathers
 */
export type ToolKind = 'read' | 'propose' | 'compute'

export interface ToolContract<I extends z.ZodTypeAny = z.ZodTypeAny, O extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string
  description: string
  kind: ToolKind
  input: I
  output: O
}

export function defineTool<I extends z.ZodTypeAny, O extends z.ZodTypeAny>(contract: ToolContract<I, O>): ToolContract<I, O> {
  if (!/^[a-z][a-z0-9_]{1,63}$/.test(contract.name)) {
    throw new Error(`Invalid tool name "${contract.name}": use snake_case, max 64 chars`)
  }
  return contract
}

export type ContractSet = Record<string, ToolContract>

/** Handler receives parsed input and returns data that must satisfy the output schema. */
export type ToolHandler<C extends ToolContract> = (input: z.output<C['input']>, ctx: ToolCtx) => Promise<z.input<C['output']>>

/** One handler per contract key; a missing handler is a compile error in the host. */
export type ToolHandlers<S extends ContractSet> = { [K in keyof S]: ToolHandler<S[K]> }
