import { clerkSetup } from '@clerk/testing/playwright'
import { test as setup } from '@playwright/test'

/**
 * Exchanges the Clerk secret key for a short-lived **testing token** that
 * bypasses Clerk's bot detection, so programmatic sign-in in auth.setup.ts
 * isn't blocked. Reads CLERK keys from env (loaded via @next/env in
 * playwright.config.ts). Runs once, before auth setup.
 *
 * Requires a Clerk **development** instance (pk_test_/sk_test_) — testing
 * tokens are not issued for production instances.
 */
setup('clerk testing token', async () => {
  await clerkSetup()
})
