import { test, expect } from '@playwright/test'

test.describe('Studio Auth Guard', () => {
  test('redirects unauthenticated users away from /studio', async ({
    page,
  }) => {
    const response = await page.goto('/en/studio')

    // Clerk middleware should redirect to sign-in or block access
    // The final URL should NOT be /studio for unauthenticated users
    const finalUrl = page.url()
    expect(finalUrl).not.toContain('/studio')

    // Should end up at sign-in or home
    expect(
      finalUrl.includes('/sign-in') || finalUrl.includes('/en'),
    ).toBeTruthy()
  })

  test('redirects unauthenticated users away from /profile', async ({
    page,
  }) => {
    await page.goto('/en/profile')
    const finalUrl = page.url()
    expect(finalUrl).not.toContain('/profile')
  })

  test('allows access to public gallery without auth', async ({ page }) => {
    const response = await page.goto('/en/gallery')
    expect(response?.status()).toBeLessThan(400)
    await expect(page.locator('body')).toBeVisible()
  })
})
