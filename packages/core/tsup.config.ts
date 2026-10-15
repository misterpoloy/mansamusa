import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    sse: 'src/sse.ts',
    'compute/index': 'src/compute/index.ts',
    'contracts/index': 'src/contracts/index.ts',
  },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2022',
  external: ['zod', '@aws-sdk/client-bedrock-runtime'],
})
