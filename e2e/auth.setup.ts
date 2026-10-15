import path from 'node:path'

import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright'
import { test as setup, expect } from '@playwright/test'

/**
 * Signs in a dedicated test user programmatically (no UI form, so Clerk bot
 * detection doesn't trip) and saves the authenticated session to
 * e2e/.auth/user.json. The `studio` project in playwright.config.ts reuses
 * this storageState so studio specs start already signed in.
 *
 * Sign-in uses the email-code strategy (the app no longer allows passwords).
 * The address comes from env (set it in .env.local, never commit):
 *   E2E_CLERK_USER_EMAIL=xxx+clerk_test@yyy
 * It **must** be a `+clerk_test` address: Clerk accepts the fixed code 424242
 * for those in development, so no real inbox is needed
 * (https://clerk.com/docs/guides/development/testing/test-emails-and-phones).
 * Create the user once in the Clerk dashboard (development instance).
 */

export const STORAGE_STATE = path.join(__dirname, '.auth', 'user.json')

setup('authenticate test user', async ({ page }) => {
  // 默认 30s 不够：`global.setup.ts` 暖的是**未登录**的 /en/studio（会被重定向
  // 到 sign-in），登录后的 studio 子树是第一次访问才现编译，冷跑要一分钟以上。
  // 与 global.setup 的 warm-up 同一档，避免把编译时间误报成登录失败。
  setup.setTimeout(180_000)

  const email = process.env.E2E_CLERK_USER_EMAIL
  if (!email) {
    throw new Error(
      'Missing E2E_CLERK_USER_EMAIL. Add a dedicated Clerk test user with a ' +
        '+clerk_test address and put it in .env.local before running ' +
        'authenticated specs.',
    )
  }

  // Inject the testing token, then load a page where ClerkProvider is mounted.
  await setupClerkTestingToken({ page })
  await page.goto('/en')
  await clerk.loaded({ page })

  await clerk.signIn({
    page,
    signInParams: { strategy: 'email_code', identifier: email },
  })

  // Confirm the session actually lands on studio (not bounced to sign-in, and
  // not a 404 — a broken route keeps the /studio URL but renders not-found).
  await page.goto('/en/studio')
  await expect(page).toHaveURL(/\/studio/)
  await expect(page.getByText('This page could not be found')).toHaveCount(0)

  await page.context().storageState({ path: STORAGE_STATE })
})
