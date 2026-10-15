import { defineConfig } from 'tsup'

// One self-contained file: the image only needs node + dist/server.cjs.
export default defineConfig({
  entry: { server: 'src/server.ts' },
  format: ['cjs'],
  platform: 'node',
  target: 'node20',
  noExternal: [/.*/],
  sourcemap: true,
  clean: true,
})
