import path from 'node:path'

import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright'
import { test as setup, expect } from '@playwright/test'

/**
 * Signs in a dedicated test user programmatically (no UI form, so Clerk bot
 * detection doesn't trip) and saves the authenticated session to
 * e2e/.auth/user.json. The `studio` project in playwright.config.ts reuses
 * this storageState so studio specs start already signed in.
 *
 * Credentials come from env (set them in .env.local, never commit):
 *   E2E_CLERK_USER_EMAIL=...
 *   E2E_CLERK_USER_PASSWORD=...
 * Create the user once in the Clerk dashboard (development instance).
 */

export const STORAGE_STATE = path.join(__dirname, '.auth', 'user.json')

setup('authenticate test user', async ({ page }) => {
  const email = process.env.E2E_CLERK_USER_EMAIL
  const password = process.env.E2E_CLERK_USER_PASSWORD
  if (!email || !password) {
    throw new Error(
      'Missing E2E_CLERK_USER_EMAIL / E2E_CLERK_USER_PASSWORD. Add a dedicated ' +
        'Clerk test user and put its credentials in .env.local before running ' +
        'authenticated specs.',
    )
  }

  // Inject the testing token, then load a page where ClerkProvider is mounted.
  await setupClerkTestingToken({ page })
  await page.goto('/en')
  await clerk.loaded({ page })

  await clerk.signIn({
    page,
    signInParams: { strategy: 'password', identifier: email, password },
  })

  // Confirm the session actually lands on studio (not bounced to sign-in, and
  // not a 404 — a broken route keeps the /studio URL but renders not-found).
  await page.goto('/en/studio')
  await expect(page).toHaveURL(/\/studio/)
  await expect(page.getByText('This page could not be found')).toHaveCount(0)

  await page.context().storageState({ path: STORAGE_STATE })
})
