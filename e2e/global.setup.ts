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

/**
 * Pre-warm the public routes SEQUENTIALLY before any test project runs.
 *
 * Against `npm run dev`, routes compile on demand. When parallel workers hit
 * an uncompiled route simultaneously, the HTML can reference CSS chunks that
 * are not ready yet; those requests 404 and are never retried, so the page
 * stays permanently unstyled and layout assertions (e.g. mobile overflow)
 * fail on raw HTML. Warming each route once serializes compilation so tests
 * always measure styled pages. No-op cost on an already-warm server.
 */
setup('warm public routes', async ({ page }) => {
  setup.setTimeout(180_000)
  const paths = ['/en', '/en/gallery', '/en/studio', '/en/sign-in']
  for (const path of paths) {
    // 'load' (not 'networkidle'): pages with streaming media/image proxies may
    // never go network-idle; compilation is done once the document loads.
    await page.goto(path, { waitUntil: 'load', timeout: 120_000 })
  }
})
