import { defineConfig } from 'tsup'

export default defineConfig({
  entry: { handler: 'src/handler.ts' },
  format: ['cjs'],
  platform: 'node',
  target: 'node20',
  noExternal: [/.*/],
  clean: true,
})
