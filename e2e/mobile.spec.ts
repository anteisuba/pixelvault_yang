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

/**
 * The `mobile` project runs on real WebKit (`devices['iPhone 14']` sets
 * `defaultBrowserType: 'webkit'`). There, Clerk's dev-browser handshake
 * (`__clerk_hs_reason=dev-browser-missing`) settles ~1s later than it does on
 * Chromium, and that extra delay consistently lands the page's first
 * `[HMR] connected` inside whatever the test does next — Turbopack responds
 * with one unprompted full-document reload (`[Fast Refresh] rebuilding` in
 * the console), tearing out any element mid-interaction. Verified with a
 * standalone trace: reproduces 5/5 on webkit, 0/2 on
 * `devices['Desktop Chrome']`, always exactly one reload.
 *
 * Where the reload lands inside the block varies by run — sometimes it
 * throws a distinctive "not attached to the DOM", sometimes it surfaces as a
 * `toHaveCSS` timeout reporting an empty string, since Playwright's own
 * assertion retry loop swallows the intermediate detach and only reports the
 * last value it saw. No error-text pattern covers every shape, so this
 * retries on ANY failure — safe here because the block is read-only
 * (assertions + `boundingBox()` reads, no mutations): a genuine bug
 * reproduces identically on the retry and still fails the test, one attempt
 * later. Locators re-resolve against the fresh DOM on their own, so a single
 * retry is enough — this is not covering for a real bug, `[chromium]` never
 * needs it.
 */
async function toleratingOneDevReload<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch {
    return run()
  }
}

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
    await page.goto(localizedPath(ROUTES.HOME), {
      waitUntil: 'domcontentloaded',
    })

    const galleryLinks = page.locator(`a[href*="${ROUTES.GALLERY}"]`)
    await expect(galleryLinks.first()).toBeVisible()
  })

  test('homepage product preview keeps tabs readable and clears the next section', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(localizedPath(ROUTES.HOME), {
      waitUntil: 'domcontentloaded',
    })

    const app = page.locator('.home-v3-app')
    const views = page.locator('.home-v3-views')
    const firstCapability = page.locator('.home-v3-cap-row').first()

    await toleratingOneDevReload(async () => {
      // The reload lands at an unpredictable point in this window — sometimes
      // before the first CSS read, sometimes mid scroll — so everything from
      // here through the box measurements below is inside the retry.
      await expect(app).toBeVisible()
      await expect(views).toHaveCSS('height', '510px')

      // The app reveal starts at scale(.93) while it is below the fold. Bring the
      // real interaction surface into view before measuring its touch targets.
      await app.scrollIntoViewIfNeeded()

      const tabs = page.locator('.home-v3-tabs label')
      await expect
        .poll(
          async () =>
            Promise.all(
              (await tabs.all()).map(
                async (tab) => (await tab.boundingBox())?.height,
              ),
            ),
          { timeout: 10_000 },
        )
        .toEqual([44, 44, 44, 44])
      for (const tab of await tabs.all()) {
        const box = await tab.boundingBox()
        expect(box?.width).toBeGreaterThan(box?.height ?? 0)
      }

      const appBox = await app.boundingBox()
      const capabilityBox = await firstCapability.boundingBox()
      expect(appBox).not.toBeNull()
      expect(capabilityBox).not.toBeNull()
      // Each box is independently rounded by the engine's layout math (more so
      // under the transform `.home-v3-app` animates through), so their edges
      // don't always telescope to the exact same float — observed misses were
      // ~0.008px, invisible at any zoom. A 1px tolerance absorbs that without
      // hiding a real overlap.
      expect(capabilityBox!.y).toBeGreaterThanOrEqual(
        appBox!.y + appBox!.height - 1,
      )
    })

    const canvas = page.locator('.home-v3-canvas')
    await expect(canvas).toHaveCSS('width', '760px')
    const canvasViewport = await page
      .locator('.home-v3-view')
      .first()
      .evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      }))
    expect(canvasViewport.scrollWidth).toBe(760)
    expect(canvasViewport.scrollWidth).toBeGreaterThan(
      canvasViewport.clientWidth,
    )

    // The owner reports the same layout through a ~608px embedded preview.
    // This width still belongs to the documented <=760px mobile product
    // surface; without this guard the asset grid falls back to four explicit
    // rows plus one oversized implicit row.
    await page.setViewportSize({ width: 608, height: 844 })
    await page
      .locator('#home-v3-view-assets')
      .evaluate((element: HTMLInputElement) => {
        element.checked = true
        element.dispatchEvent(new Event('change', { bubbles: true }))
      })

    await expect(page.locator('.home-v3-views')).toHaveCSS('height', '520px')
    const assetGridTracks = await page
      .locator('.home-v3-grid')
      .evaluate((element) => {
        const style = getComputedStyle(element)
        return {
          columns: style.gridTemplateColumns.split(' ').length,
          rows: style.gridTemplateRows.split(' ').length,
        }
      })
    expect(assetGridTracks).toEqual({ columns: 4, rows: 5 })
  })

  test('homepage keeps capability copy in flow and gives footer copy full width below desktop', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 600, height: 844 })
    await page.goto(localizedPath(ROUTES.HOME), {
      waitUntil: 'domcontentloaded',
    })

    const capabilityStage = page.locator('.home-v3-capstage')
    await expect(capabilityStage).not.toHaveClass(/is-pinned/)

    const footerTop = page.locator('.home-v3-footer-top')
    const footerBrand = page.locator('.home-v3-footer-brand')
    const footerCopy = footerBrand.locator('p')
    await expect
      .poll(
        async () => {
          try {
            await page.locator('.home-v3-footer-top').scrollIntoViewIfNeeded()
            return true
          } catch {
            return false
          }
        },
        { timeout: 10_000 },
      )
      .toBe(true)

    const footerBox = await footerTop.boundingBox()
    const brandBox = await footerBrand.boundingBox()
    const copyBox = await footerCopy.boundingBox()

    expect(footerBox).not.toBeNull()
    expect(brandBox).not.toBeNull()
    expect(copyBox).not.toBeNull()
    expect(brandBox!.width).toBeGreaterThan(footerBox!.width * 0.9)
    expect(copyBox!.height).toBeLessThan(72)
  })
})
