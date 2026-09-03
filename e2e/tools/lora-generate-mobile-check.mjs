/**
 * `/zh/studio/lora` Generate 移动端形态的验收夹具
 * ────────────────────────────────────────────────────────────────────────
 * 施工基准：owner 2026-09-03 拍板「结果在眼前、输入在拇指区」
 * （`docs/references/domains/lora.md` 移动端节 · `pages/lora-generate.md` §9）。
 *
 * 跑什么：
 *  - 375×812：结果卡在 composer 之上、底栏 fixed、摘要是 ≥44px 的按钮、点它开
 *    装配 Drawer（内含 LoraSpineBar）、横向不溢出。
 *  - 375×812 + `page.route` 假成功/假失败：**不真出图、不花 runner 额度**——
 *    生成/轮询两个端点全被拦下，验「生成开始时结果卡滚到视口顶」「完成后元信息
 *    可见」「失败时结果卡里有重试」。
 *  - 1440×900：桌面 60/40 网格不变（结果在右列、无底栏摘要按钮）。
 *
 * ⛔ 全程不点真出图：生成端点在点之前就已经被 page.route 拦死。
 *
 * 前置：owner 的 dev 跑在 3000；`e2e/.auth/user.json` 已生成。
 * 运行：node e2e/tools/lora-generate-mobile-check.mjs
 * 产出：scratchpad/mobile-pass/lora-gen-*.png + stdout 上的一份 JSON。
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { chromium } from '@playwright/test'

const REPO = path.resolve(import.meta.dirname, '../..')
const OUT_DIR = path.join(REPO, 'scratchpad/mobile-pass')
const STORAGE_STATE = path.join(REPO, 'e2e/.auth/user.json')
const URL = 'http://localhost:3000/zh/studio/lora?section=generate'
const SETTLE_MS = 4000
const READY_TIMEOUT_MS = 45000

const report = {}

function log(key, value) {
  report[key] = value
  console.log(`· ${key} =`, JSON.stringify(value))
}

/** dev + Clerk 偶发握手/重建失败，重试但不吞。 */
async function gotoWithRetry(page, url, attempts = 3) {
  for (let i = 1; i <= attempts; i += 1) {
    try {
      // dev 首次编译 /studio/lora（这页很大）实测能超过 30s 默认导航超时。
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 })
      return
    } catch (error) {
      if (i === attempts) throw error
      console.log(`  (retry ${i}: ${String(error).split('\n')[0]})`)
    }
  }
}

/**
 * Next dev 的错误浮层（`<nextjs-portal>`）是 fixed 全屏宿主，会拦掉底栏上的
 * 点击（Playwright 报 "intercepts pointer events"）。它是 dev-only chrome，
 * 不是被验对象，直接摘掉。
 */
async function dropDevOverlay(page) {
  await page.evaluate(() =>
    document.querySelectorAll('nextjs-portal').forEach((node) => node.remove()),
  )
}

/**
 * iOS 聚焦缩放审计：<768 下任何可聚焦文本控件的计算字号 <16px，Safari 就会在
 * 聚焦时整页放大。range 豁免（滑杆没有输入法/不触发缩放）。返回空数组才算过。
 */
async function smallFontControls(page) {
  return page.evaluate(() =>
    Array.from(
      document.querySelectorAll(
        'input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=range]), textarea, select, [contenteditable=true]',
      ),
    )
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute('type'),
        id: el.id || null,
        label: el.getAttribute('aria-label'),
        fontSize: parseFloat(getComputedStyle(el).fontSize),
      }))
      .filter((row) => row.fontSize < 16),
  )
}

async function rect(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return {
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      height: Math.round(r.height),
      width: Math.round(r.width),
    }
  }, selector)
}

/** 假成功：拦生成 + 轮询两个端点，用库里已有的一张图当结果。 */
async function installFakeGenerate(page, generation) {
  await page.route('**/api/studio/generate', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: { jobId: 'fake-job', requestId: 'fake-request' },
      }),
    }),
  )
  await page.route('**/api/studio/generate/status*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: { jobId: 'fake-job', status: 'COMPLETED', generation },
      }),
    }),
  )
}

/** 假失败：生成端点直接 500，`generateImageAPI` 会把它变成 hook 的 error。 */
async function installFakeFailure(page) {
  await page.unrouteAll({ behavior: 'ignoreErrors' })
  await page.route('**/api/studio/generate', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({
        success: false,
        error: '假失败（真机验收夹具，未真的派发）',
      }),
    }),
  )
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  const browser = await chromium.launch()

  // ── 375×812 ───────────────────────────────────────────────────
  const mobile = await browser.newContext({
    storageState: STORAGE_STATE,
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  })
  const page = await mobile.newPage()
  const consoleErrors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200))
  })
  await gotoWithRetry(page, URL)
  await page
    .locator('[data-testid="lora-result-card"]')
    .waitFor({ timeout: READY_TIMEOUT_MS })
  // 底栏摘要是移动端分支（useIsMobile 在挂载后才为 true），等它出现再量。
  await page
    .locator('[data-testid="lora-mobile-summary"]')
    .waitFor({ timeout: READY_TIMEOUT_MS })
  await page.waitForTimeout(SETTLE_MS)
  await dropDevOverlay(page)

  const resultBox = await rect(page, '[data-testid="lora-result-card"]')
  const composerBox = await rect(page, '[data-testid="lora-composer-card"]')
  log('order375', {
    resultTop: resultBox?.top ?? null,
    composerTop: composerBox?.top ?? null,
    resultAboveComposer:
      resultBox && composerBox ? resultBox.top < composerBox.top : null,
  })

  log(
    'actionBar375',
    await page.evaluate(() => {
      const bar = document.querySelector('.lora-mobile-actionbar')
      const summary = document.querySelector(
        '[data-testid="lora-mobile-summary"]',
      )
      if (!bar) return { present: false }
      const barRect = bar.getBoundingClientRect()
      return {
        present: true,
        position: getComputedStyle(bar).position,
        barBottom: Math.round(barRect.bottom),
        summaryTag: summary ? summary.tagName.toLowerCase() : null,
        summaryHeight: summary
          ? Math.round(summary.getBoundingClientRect().height)
          : null,
        summaryText: summary ? summary.textContent.trim() : null,
      }
    }),
  )

  log(
    'noHorizontalOverflow375',
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  )
  log('smallFontControls375', await smallFontControls(page))

  // 空态硬门（owner 2026-09-03 追加）：结果卡是第一屏，但它不许把提示词输入框
  // 顶出视口——不滚动就得看得见能打字的地方，而且要在固定出图条**上面**。
  log(
    'emptyState375',
    await page.evaluate(() => {
      const media = document.querySelector('.lora-result-media')
      const ta = document.querySelector('#lora-prompt')
      const bar = document.querySelector('.lora-mobile-actionbar')
      const taTop = ta ? ta.getBoundingClientRect().top : null
      const barTop = bar ? bar.getBoundingClientRect().top : null
      return {
        mediaHasEmptyModifier: Boolean(
          media?.classList.contains('lora-result-media--empty'),
        ),
        emptyMediaHeight: media
          ? Math.round(media.getBoundingClientRect().height)
          : null,
        emptyMediaMaxHeight: media ? getComputedStyle(media).maxHeight : null,
        promptTextareaTop: taTop == null ? null : Math.round(taTop),
        actionBarTop: barTop == null ? null : Math.round(barTop),
        viewportHeight: window.innerHeight,
        promptTextareaTopWithinViewport375:
          taTop != null && taTop >= 0 && taTop < window.innerHeight,
        promptTextareaAboveActionBar:
          taTop != null && barTop != null && taTop < barTop,
      }
    }),
  )
  await page.screenshot({ path: path.join(OUT_DIR, 'lora-gen-375.png') })

  // ── 摘要 → 装配 sheet ─────────────────────────────────────────
  await dropDevOverlay(page)
  await page.locator('[data-testid="lora-mobile-summary"]').tap()
  await page.waitForTimeout(1200)
  log(
    'assemblySheet',
    await page.evaluate(() => {
      // vaul 的 content 没有 data-slot，认 `[data-vaul-drawer]`。装配栏本体
      // （LoraSpineBar）在移动端**只**渲染在这个 sheet 里（桌面左栏被
      // `!isAssistantMobile` 关掉），所以它出现 = sheet 里装的是装配内容。
      const drawer =
        document.querySelector('[data-vaul-drawer]') ??
        document.querySelector('[role="dialog"]')
      const spine = document.querySelector('[data-testid="lora-spine-bar"]')
      return {
        drawerOpen: Boolean(drawer),
        containsSpineBar: Boolean(spine),
        spineInsideDrawer: Boolean(drawer && spine && drawer.contains(spine)),
      }
    }),
  )
  log('smallFontControls375Sheet', await smallFontControls(page))
  await page.screenshot({ path: path.join(OUT_DIR, 'lora-gen-375-sheet.png') })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(800)

  // ── 假成功：自动滚 + 元信息 ────────────────────────────────────
  const sample = await page.evaluate(async () => {
    const res = await fetch('/api/images?type=image&mine=1&limit=1')
    if (!res.ok) return { error: `status ${res.status}` }
    const json = await res.json()
    const list =
      json?.data?.images ?? json?.data?.generations ?? json?.data ?? []
    return Array.isArray(list) ? (list[0] ?? null) : { error: 'shape' }
  })

  if (sample && !sample.error && sample.url) {
    await installFakeGenerate(page, {
      ...sample,
      id: `fake-${Date.now()}`,
      prompt: '真机验收用的假结果',
    })
    // 出图按钮的可用条件之一是「有内容」——空栈（×0）时正文必须非空，否则
    // canGenerate=false，按钮 disabled，什么都验不到。
    await page.evaluate(() => {
      const ta = document.querySelector('#lora-prompt')
      if (!ta) return
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value',
      ).set
      setter.call(ta, '真机验收用的提示词')
      ta.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await page.waitForTimeout(600)

    // 先把页面滚到底（结果卡滚出视口），这样「自动滚到顶」才是可证伪的。
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForTimeout(400)
    const beforeTop = (await rect(page, '[data-testid="lora-result-card"]'))
      ?.top

    await dropDevOverlay(page)
    await page.getByRole('button', { name: /出图/ }).last().tap()
    await page.waitForTimeout(1500)
    const duringTop = (await rect(page, '[data-testid="lora-result-card"]'))
      ?.top
    await page.waitForTimeout(6000)

    log('fakeSuccess', {
      resultTopBeforeRun: beforeTop ?? null,
      resultTopAfterRunStart: duringTop ?? null,
      scrolledToTop: duringTop != null && duringTop >= 0 && duringTop <= 120,
      ...(await page.evaluate(() => {
        const card = document.querySelector('[data-testid="lora-result-card"]')
        const media = card?.querySelector('.lora-result-media')
        const meta = card?.querySelector('p.font-mono')
        return {
          mediaHasImage: Boolean(
            media && getComputedStyle(media).backgroundImage !== 'none',
          ),
          mediaHeight: media
            ? Math.round(media.getBoundingClientRect().height)
            : null,
          mediaMaxHeight: media ? getComputedStyle(media).maxHeight : null,
          metaVisible: Boolean(
            meta && meta.getBoundingClientRect().height > 0,
          ),
          metaText: meta?.textContent?.trim() ?? null,
        }
      })),
    })
    await page.screenshot({
      path: path.join(OUT_DIR, 'lora-gen-375-result.png'),
    })
  } else {
    log('fakeSuccess', { skipped: true, reason: sample?.error ?? 'no sample' })
  }

  // ── 假失败：结果卡里的重试 ────────────────────────────────────
  await installFakeFailure(page)
  await dropDevOverlay(page)
  await page.getByRole('button', { name: /出图/ }).last().tap()
  await page.waitForTimeout(4000)
  log(
    'fakeFailure',
    await page.evaluate(() => {
      const card = document.querySelector('[data-testid="lora-result-card"]')
      const retry = Array.from(card?.querySelectorAll('button') ?? []).find(
        (b) => b.textContent?.includes('重试'),
      )
      return {
        retryInsideResultCard: Boolean(retry),
        retryHeight: retry
          ? Math.round(retry.getBoundingClientRect().height)
          : null,
        cardText: card?.textContent?.trim().slice(0, 160) ?? null,
      }
    }),
  )
  await page.screenshot({ path: path.join(OUT_DIR, 'lora-gen-375-failed.png') })
  log('consoleErrors375', consoleErrors.slice(0, 5))
  await mobile.close()

  // ── 1440×900：桌面不变 ────────────────────────────────────────
  const desktop = await browser.newContext({
    storageState: STORAGE_STATE,
    viewport: { width: 1440, height: 900 },
  })
  const dPage = await desktop.newPage()
  await gotoWithRetry(dPage, URL)
  await dPage
    .locator('[data-testid="lora-result-card"]')
    .waitFor({ timeout: READY_TIMEOUT_MS })
  await dPage.waitForTimeout(SETTLE_MS)

  log(
    'desktop1440',
    await dPage.evaluate(() => {
      const result = document
        .querySelector('[data-testid="lora-result-card"]')
        ?.getBoundingClientRect()
      const composer = document
        .querySelector('[data-testid="lora-composer-card"]')
        ?.getBoundingClientRect()
      return {
        resultLeft: result ? Math.round(result.left) : null,
        composerLeft: composer ? Math.round(composer.left) : null,
        resultIsRightColumn:
          result && composer ? result.left > composer.left : null,
        summaryButtonPresent: Boolean(
          document.querySelector('[data-testid="lora-mobile-summary"]'),
        ),
        actionBarPosition: (() => {
          const bar = document.querySelector('.lora-mobile-actionbar')
          return bar ? getComputedStyle(bar).position : null
        })(),
      }
    }),
  )
  await dPage.screenshot({ path: path.join(OUT_DIR, 'lora-gen-1440.png') })
  await desktop.close()
  await browser.close()

  await writeFile(
    path.join(OUT_DIR, 'lora-gen-report.json'),
    JSON.stringify(report, null, 2),
    'utf8',
  )
  console.log('\n' + JSON.stringify(report, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
