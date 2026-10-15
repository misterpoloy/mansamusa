import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { walletContracts } from '../src/contracts/index.js'
import { defineTool } from '../src/contracts/define.js'
import { createLocalRegistry } from '../src/registry/local.js'
import { inputJsonSchema } from '../src/registry/to-tool-spec.js'
import { ctx } from './helpers.js'

const echo = defineTool({
  name: 'echo',
  kind: 'read',
  description: 'echo',
  input: z.object({ n: z.number().int().max(5) }),
  output: z.object({ n: z.number() }),
})

describe('local registry', () => {
  it('reports bad input, handler throws and malformed output as tool errors', async () => {
    const errors: string[] = []
    const reg = createLocalRegistry({ echo }, { echo: async ({ n }) => (n === 3 ? ({ n: 'three' } as never) : n === 4 ? Promise.reject(new Error('db down')) : { n }) }, {
      onHandlerError: (name) => errors.push(name),
    })
    expect(await reg.call('echo', { n: 9 }, ctx)).toEqual({ ok: false, error: expect.stringMatching(/^Invalid input: n:/) })
    expect(await reg.call('echo', { n: 4 }, ctx)).toEqual({ ok: false, error: 'Tool failed: db down' })
    expect(await reg.call('echo', { n: 3 }, ctx)).toEqual({ ok: false, error: expect.stringMatching(/^Tool returned malformed data/) })
    expect(await reg.call('echo', { n: 2 }, ctx)).toEqual({ ok: true, data: { n: 2 } })
    expect(await reg.call('nope', {}, ctx)).toEqual({ ok: false, error: 'Unknown tool "nope"' })
    expect(errors).toEqual(['echo', 'echo'])
  })

  it('rejects a contract whose key differs from its name', () => {
    expect(() => createLocalRegistry({ other: echo } as never, { other: async () => ({ n: 1 }) } as never)).toThrow(/must equal its tool name/)
  })

  it('produces inline object schemas for every wallet contract', () => {
    for (const contract of Object.values(walletContracts)) {
      const schema = inputJsonSchema(contract)
      expect(schema.type, contract.name).toBe('object')
      expect(JSON.stringify(schema), contract.name).not.toContain('$ref')
      expect(contract.description.length, contract.name).toBeGreaterThan(40)
    }
    expect(Object.keys(walletContracts)).toHaveLength(14)
  })
})
