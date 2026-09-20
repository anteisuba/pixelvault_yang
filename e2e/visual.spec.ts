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
  /**
   * ⚠ 首页是一条长卷（v5，`docs/references/pages/home.md`）：九段加起来约
   * 1700vh，`fullPage` 会拍出一张十七屏高的图——又慢、又几乎必然因为一处
   * 微小差异整张失效，而且钉住（`position: sticky`）的段在整页截图里本来就
   * 拍不出它在视口里的样子。所以首页只基线**首屏**。
   *
   * ⭐ 基线按 OS 分套（当前只有 `-win32`）。改过首页之后要在**各自的 OS 上**
   * 跑 `npx playwright test e2e/visual.spec.ts --update-snapshots` 重出。
   */
  test('homepage', async ({ page }) => {
    await page.goto('/en')
    await settle(page)

    await expect(page).toHaveScreenshot('homepage.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.01,
    })
  })
})
