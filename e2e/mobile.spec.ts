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

          // 'load' (not 'networkidle'): gallery/studio keep image requests
          // trickling and may never go network-idle; the settle-poll below is
          // the real "layout is stable" gate.
          await page.goto(responsivePage.path, { waitUntil: 'load' })

          await expect(page.locator('body')).toBeVisible()

          // Dev-server cold compiles paint a transiently unstyled page whose
          // scrollWidth far exceeds the viewport. Poll until layout settles so
          // only overflow that PERSISTS fails the test.
          await expect
            .poll(
              () =>
                page.evaluate(() => {
                  const root = document.documentElement
                  return (
                    Math.max(root.scrollWidth, document.body.scrollWidth) -
                    window.innerWidth
                  )
                }),
              { timeout: 10_000 },
            )
            .toBeLessThanOrEqual(1)

          const bodyTextLength = await page.evaluate(
            () => document.body.innerText.trim().length,
          )
          expect(bodyTextLength).toBeGreaterThan(0)
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
