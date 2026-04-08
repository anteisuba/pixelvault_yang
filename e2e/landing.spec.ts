import { test, expect } from '@playwright/test'

test.describe('Landing Page', () => {
  test('renders hero section and navigation', async ({ page }) => {
    await page.goto('/en')
    await expect(page).toHaveTitle(/PixelVault|AI Gallery/i)

    // Navbar should be visible
    const nav = page.locator('nav').first()
    await expect(nav).toBeVisible()

    // Hero section should render (main heading)
    const heading = page.locator('h1').first()
    await expect(heading).toBeVisible()
  })

  test('has working navigation links', async ({ page }) => {
    await page.goto('/en')

    // Gallery link should exist and be accessible
    const galleryLink = page.locator('a[href*="/gallery"]').first()
    await expect(galleryLink).toBeVisible()
  })

  test('loads without console errors', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })

    await page.goto('/en')
    await page.waitForLoadState('networkidle')

    // Filter out known non-critical errors (e.g., Clerk, analytics)
    const criticalErrors = errors.filter(
      (e) =>
        !e.includes('clerk') &&
        !e.includes('sentry') &&
        !e.includes('Failed to load resource'),
    )
    expect(criticalErrors).toHaveLength(0)
  })
})
