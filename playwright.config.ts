import { loadEnvConfig } from '@next/env'
import { defineConfig, devices } from '@playwright/test'

// Load .env.local exactly like Next.js does, so Clerk keys (clerkSetup) and the
// E2E_CLERK_USER_* credentials (auth.setup.ts) are available to the test runner.
loadEnvConfig(process.cwd())

const SETUP_FILES = /.*\.setup\.ts/
const STUDIO_VISUAL = /studio\.visual\.spec\.ts/

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'html',
  timeout: 30_000,

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    // 1. Clerk testing token (bypass bot detection) — must run before sign-in.
    { name: 'global setup', testMatch: /global\.setup\.ts/ },
    // 2. Programmatic sign-in → saves storageState to e2e/.auth/user.json.
    {
      name: 'auth setup',
      testMatch: /auth\.setup\.ts/,
      dependencies: ['global setup'],
    },
    // Public (unauthenticated) tests — exclude setup files and auth-only specs.
    // Depend on global setup so its sequential route warm-up finishes first;
    // parallel workers hitting uncompiled dev-server routes get permanently
    // unstyled pages (CSS chunk 404s) and fail layout assertions.
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: [SETUP_FILES, STUDIO_VISUAL],
      dependencies: ['global setup'],
    },
    {
      name: 'mobile',
      use: { ...devices['iPhone 14'] },
      testIgnore: [SETUP_FILES, STUDIO_VISUAL],
      dependencies: ['global setup'],
    },
    // Authenticated studio visual regression — reuses the saved session.
    {
      name: 'studio',
      testMatch: STUDIO_VISUAL,
      dependencies: ['auth setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/user.json',
      },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
