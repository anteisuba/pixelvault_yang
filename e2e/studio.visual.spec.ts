import { test, expect } from '@playwright/test'

/**
 * Visual regression for the authenticated studio surface.
 *
 * Runs only under the `studio` project (see playwright.config.ts), which loads
 * the saved storageState from auth.setup.ts, so the page starts signed in.
 *
 * First run / intentional changes: regenerate with
 *   npx playwright test --project=studio --update-snapshots
 *
 * Studio has dynamic/canvas content — if diffs are flaky, mask the unstable
 * regions via the `mask` option (e.g. mask: [page.locator('[data-canvas]')]).
 */
test('studio shell', async ({ page }) => {
  await page.goto('/en/studio')
  await page.waitForURL(/\/studio\/image/) // follow the thin redirect to workspace

  // Never baseline / diff against a broken route (404 keeps the /studio URL).
  await expect(page.getByText('This page could not be found')).toHaveCount(0)

  // studio is app-like (HMR socket, Clerk polling) so `networkidle` never
  // settles — wait for the sidebar shell to render instead. toHaveScreenshot's
  // retry handles the remaining settle (fonts/animations frozen below).
  await expect(page.locator('[data-sidebar="sidebar"]').first()).toBeVisible()

  await expect(page).toHaveScreenshot('studio.png', {
    fullPage: true,
    animations: 'disabled',
    maxDiffPixelRatio: 0.01,
  })
})
