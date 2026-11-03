import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    server: { deps: { inline: ['next-intl'] } },
    setupFiles: './vitest.setup.ts',
    globals: true,
    testTimeout: 15000,
    exclude: [
      'e2e/**',
      '**/.claude/worktrees/**',
      'node_modules/**',
      'workers/**',
    ],
    // 纯逻辑（.ts）跑 node，不为每个文件开一次 jsdom；组件（.tsx）跑 jsdom。
    // .ts 里要 DOM 的（renderHook、window、document…）文件头写
    // `// @vitest-environment jsdom`。见 docs/references/testing.md。
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['**/*.test.ts'],
          exclude: ['**/*.int.test.ts'],
        },
      },
      // L2a 真库测试（*.int.test.ts）：CI 连 Postgres 容器，本机自动起 PGlite。
      // 共用一个库，串行跑；每例开头 resetDatabase()。见 src/test/int/。
      {
        extends: true,
        test: {
          name: 'int',
          environment: 'node',
          include: ['**/*.int.test.ts'],
          globalSetup: ['./src/test/int/global-setup.ts'],
          setupFiles: ['./src/test/int/setup.ts'],
          fileParallelism: false,
        },
      },
      {
        extends: true,
        test: { name: 'dom', environment: 'jsdom', include: ['**/*.test.tsx'] },
      },
    ],
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
