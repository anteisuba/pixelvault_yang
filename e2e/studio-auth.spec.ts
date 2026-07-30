import { test, expect } from '@playwright/test'

test.describe('Localized Auth Entry Routes', () => {
  test('serves sign-in and sign-up instead of the localized 404', async ({
    page,
  }) => {
    const signInResponse = await page.goto('/en/sign-in')
    expect(signInResponse?.status()).toBeLessThan(400)
    await expect(
      page.getByRole('heading', { name: 'Sign in to your account.' }),
    ).toBeVisible()
    await expect(page.locator('.cl-rootBox')).toBeVisible()

    const zhSignInResponse = await page.goto('/zh/sign-in')
    expect(zhSignInResponse?.status()).toBeLessThan(400)
    await expect(
      page.getByRole('heading', { name: '登录已有账号。' }),
    ).toBeVisible()

    const signUpResponse = await page.goto('/en/sign-up')
    expect(signUpResponse?.status()).toBeLessThan(400)
    await expect(
      page.getByRole('heading', { name: 'Create your account.' }),
    ).toBeVisible()

    const nestedFlowResponse = await page.goto(
      '/en/sign-in/verify-email-address',
    )
    expect(nestedFlowResponse?.status()).toBeLessThan(400)
  })
})

test.describe('Studio Auth Guard', () => {
  test('redirects unauthenticated users away from /studio', async ({
    page,
  }) => {
    await page.goto('/en/studio')

    // Clerk middleware should redirect to sign-in or block access
    // The final URL should NOT be /studio for unauthenticated users
    const finalUrl = page.url()
    expect(finalUrl).not.toContain('/studio')

    // Should end up at sign-in or home
    expect(
      finalUrl.includes('/sign-in') || finalUrl.includes('/en'),
    ).toBeTruthy()
  })

  test('shows signed-out asset gate without auth', async ({ page }) => {
    const response = await page.goto('/en/assets')
    expect(response?.status()).toBeLessThan(400)
    await expect(
      page.getByRole('heading', { name: 'Sign in required' }),
    ).toBeVisible()
  })

  test('allows access to public gallery without auth', async ({ page }) => {
    const response = await page.goto('/en/gallery')
    expect(response?.status()).toBeLessThan(400)
    await expect(page.locator('body')).toBeVisible()
  })
})
