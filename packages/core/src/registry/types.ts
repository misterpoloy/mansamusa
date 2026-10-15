import type { Tool } from '@aws-sdk/client-bedrock-runtime'
import type { ToolKind } from '../contracts/define.js'
import type { ToolCtx } from '../types.js'

export type ToolOutcome =
  | { ok: true; data: unknown }
  | { ok: false; error: string }

/**
 * What runAgent needs from a tool source. The local registry runs handlers in-process;
 * the MCP registry (AgentCore path) calls the same contracts over the network.
 */
export interface Registry {
  specs(): Promise<Tool[]>
  kindOf(name: string): ToolKind | undefined
  call(name: string, input: unknown, ctx: ToolCtx): Promise<ToolOutcome>
}
