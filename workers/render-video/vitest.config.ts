import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      'cloudflare:workers': fileURLToPath(
        new URL('./src/test/cloudflare-workers-stub.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    globals: true,
  },
})
