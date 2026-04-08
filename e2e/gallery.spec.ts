import { test, expect } from '@playwright/test'

test.describe('Gallery Page', () => {
  test('renders gallery page with grid layout', async ({ page }) => {
    await page.goto('/en/gallery')

    // Page should load successfully
    await expect(page).toHaveTitle(/Gallery|PixelVault/i)

    // Should have some content area (grid or empty state)
    const main = page.locator('main').first()
    await expect(main).toBeVisible()
  })

  test('gallery page is publicly accessible', async ({ page }) => {
    const response = await page.goto('/en/gallery')
    expect(response?.status()).toBe(200)
  })

  test('loads without hydration errors', async ({ page }) => {
    const hydrationErrors: string[] = []
    page.on('console', (msg) => {
      const text = msg.text()
      if (
        text.includes('Hydration') ||
        text.includes('hydration') ||
        text.includes('mismatch')
      ) {
        hydrationErrors.push(text)
      }
    })

    await page.goto('/en/gallery')
    await page.waitForLoadState('networkidle')

    expect(hydrationErrors).toHaveLength(0)
  })
})
