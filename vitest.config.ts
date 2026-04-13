import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: './vitest.setup.ts',
    globals: true,
    exclude: ['e2e/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'json-summary'],
      include: ['src/lib/**', 'src/services/**'],
      exclude: [
        'src/lib/generated/**',
        'src/lib/api-client/**',
        'src/test/**',
        '**/*.test.ts',
        '**/*.test.tsx',
      ],
    },
  },
})
