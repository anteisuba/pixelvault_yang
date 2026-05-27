import { expect, test } from '@playwright/test'

import { ROUTES, type Route } from '../src/constants/routes'

const LOCALE = 'en'
const MOBILE_WIDTHS = [375, 390, 430] as const

interface ResponsivePage {
  name: string
  path: string
}

const localizedPath = (route: Route): string =>
  route === ROUTES.HOME ? `/${LOCALE}` : `/${LOCALE}${route}`

const pages: ResponsivePage[] = [
  { name: 'root', path: ROUTES.HOME },
  { name: 'home', path: localizedPath(ROUTES.HOME) },
  { name: 'gallery', path: localizedPath(ROUTES.GALLERY) },
  { name: 'studio', path: localizedPath(ROUTES.STUDIO) },
  { name: 'sign in', path: localizedPath(ROUTES.SIGN_IN) },
]

test.describe('Mobile Responsive', () => {
  for (const width of MOBILE_WIDTHS) {
    test.describe(`${width}px`, () => {
      test.use({
        viewport: { width, height: 844 },
        isMobile: true,
        hasTouch: true,
      })

      for (const responsivePage of pages) {
        test(`renders ${responsivePage.name} without horizontal overflow`, async ({
          page,
        }) => {
          const pageErrors: string[] = []
          page.on('pageerror', (error) => pageErrors.push(error.message))

          await page.goto(responsivePage.path)
          await page.waitForLoadState('networkidle')
          await page.waitForTimeout(500)

          const metrics = await page.evaluate(() => {
            const root = document.documentElement
            const body = document.body

            return {
              bodyTextLength: body.innerText.trim().length,
              innerWidth: window.innerWidth,
              maxScrollWidth: Math.max(root.scrollWidth, body.scrollWidth),
            }
          })

          await expect(page.locator('body')).toBeVisible()
          expect(metrics.bodyTextLength).toBeGreaterThan(0)
          expect(metrics.maxScrollWidth).toBeLessThanOrEqual(
            metrics.innerWidth + 1,
          )
          expect(pageErrors).toHaveLength(0)
        })
      }
    })
  }

  test('mobile navigation exposes gallery access', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(localizedPath(ROUTES.HOME))

    const galleryLinks = page.locator(`a[href*="${ROUTES.GALLERY}"]`)
    await expect(galleryLinks.first()).toBeVisible()
  })
})
