import type { Tool } from '@aws-sdk/client-bedrock-runtime'
import { zodToJsonSchema } from 'zod-to-json-schema'
import type { ToolContract } from '../contracts/define.js'

/** JSON Schema for a tool input, inlined (no $ref) so every model can read it. */
export function inputJsonSchema(contract: ToolContract): Record<string, unknown> {
  const schema = zodToJsonSchema(contract.input, { target: 'jsonSchema7', $refStrategy: 'none' }) as Record<string, unknown>
  delete schema.$schema
  if (schema.type !== 'object') {
    throw new Error(`Tool "${contract.name}" input must be a Zod object`)
  }
  return schema
}

export function toToolSpec(contract: ToolContract): Tool {
  return {
    toolSpec: {
      name: contract.name,
      description: contract.description,
      inputSchema: { json: inputJsonSchema(contract) as never },
    },
  }
}
