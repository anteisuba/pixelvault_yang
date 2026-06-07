import { test, expect } from '@playwright/test'

/**
 * Visual regression baselines for key UI surfaces.
 *
 * Runs under both the `chromium` (desktop) and `mobile` projects defined in
 * playwright.config.ts, so each `toHaveScreenshot` produces a desktop + mobile
 * baseline from one test.
 *
 * First run / intentional UI changes: regenerate baselines with
 *   npx playwright test e2e/visual.spec.ts --update-snapshots
 * and call out which snapshots changed in the completion report.
 *
 * Note: auth-gated surfaces (e.g. /studio) redirect unauthenticated users, so
 * they cannot be baselined here without a signed-in fixture — tracked separately.
 */

/** Wait until the page is visually settled: network idle + fonts loaded. */
async function settle(page: import('@playwright/test').Page) {
  await page.waitForLoadState('networkidle')
  await page.evaluate(() => document.fonts.ready)
}

test.describe('Visual regression', () => {
  test('homepage', async ({ page }) => {
    await page.goto('/en')
    await settle(page)

    await expect(page).toHaveScreenshot('homepage.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixelRatio: 0.01,
    })
  })
})
