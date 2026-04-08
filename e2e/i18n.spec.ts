import { test, expect } from '@playwright/test'

test.describe('Internationalization', () => {
  test('English locale loads correctly', async ({ page }) => {
    await page.goto('/en')
    const html = page.locator('html')
    await expect(html).toHaveAttribute('lang', 'en')
  })

  test('Japanese locale loads correctly', async ({ page }) => {
    await page.goto('/ja')
    const html = page.locator('html')
    await expect(html).toHaveAttribute('lang', 'ja')
  })

  test('Chinese locale loads correctly', async ({ page }) => {
    await page.goto('/zh')
    const html = page.locator('html')
    await expect(html).toHaveAttribute('lang', 'zh')
  })

  test('root URL redirects to default locale', async ({ page }) => {
    await page.goto('/')
    const url = page.url()
    // Should redirect to /en (default locale)
    expect(url).toMatch(/\/(en|ja|zh)/)
  })

  test('gallery is accessible in all locales', async ({ page }) => {
    for (const locale of ['en', 'ja', 'zh']) {
      const response = await page.goto(`/${locale}/gallery`)
      expect(response?.status()).toBeLessThan(400)
    }
  })
})
