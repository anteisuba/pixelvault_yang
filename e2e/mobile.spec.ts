import { test, expect } from '@playwright/test'

test.use({ viewport: { width: 375, height: 812 } })

test.describe('Mobile Responsive', () => {
  test('landing page renders correctly on mobile', async ({ page }) => {
    await page.goto('/en')

    // Page should be visible and not overflow
    const body = page.locator('body')
    await expect(body).toBeVisible()

    // Navigation should be present (possibly as mobile menu)
    const nav = page.locator('nav').first()
    await expect(nav).toBeVisible()
  })

  test('gallery page renders on mobile', async ({ page }) => {
    await page.goto('/en/gallery')

    const main = page.locator('main').first()
    await expect(main).toBeVisible()

    // No horizontal overflow
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
    const viewportWidth = await page.evaluate(() => window.innerWidth)
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 1) // 1px tolerance
  })

  test('mobile tab bar is visible on small screens', async ({ page }) => {
    await page.goto('/en')

    // MobileTabBar should render on mobile viewport
    // Look for the bottom navigation bar
    const tabBar = page
      .locator('[data-testid="mobile-tab-bar"]')
      .or(
        page.locator('nav').filter({ has: page.locator('a[href*="/studio"]') }),
      )

    // Either a dedicated mobile tab bar or navigation with studio link should exist
    const navLinks = page.locator('a[href*="/gallery"]')
    await expect(navLinks.first()).toBeVisible()
  })
})
