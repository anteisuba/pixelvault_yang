import { expect, test } from '@playwright/test'

import { ROUTES, type Route } from '../src/constants/routes'

const LOCALE = 'en'
// 820 守住平板区间（768–1023 现在走移动 chrome，docs/references/frontend.md §布局壳 C4 决议）。
const MOBILE_WIDTHS = [375, 390, 430, 600, 820] as const

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
          page.on('pageerror', (error) => {
            const message = error.message
            const isStaleDevChunk =
              message.includes('ChunkLoadError') &&
              message.toLowerCase().includes('turbopack')
            if (!isStaleDevChunk) pageErrors.push(message)
          })

          // Third-party auth and image requests can keep `load` pending even
          // after the page is interactive. The settle-poll below is the real
          // "layout is stable" gate, so only wait for the DOM here.
          await page.goto(responsivePage.path, {
            waitUntil: 'domcontentloaded',
          })

          // 判「画出来了」看有没有可见元素，不看 body 自身：首页翻页站全是 fixed 层，
          // html / body 实测高 0，`body` 的 toBeVisible 永远判 hidden（画面其实正常）。
          await expect(page.locator('body *:visible').first()).toBeVisible()

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

  test('homepage stage fits a phone without sideways scroll', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(localizedPath(ROUTES.HOME), {
      waitUntil: 'domcontentloaded',
    })

    await expect(page.locator('.home-v6 .win')).toBeVisible()
    await expect(page.locator('.home-v6 h1')).toBeVisible()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })
})
