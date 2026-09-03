/**
 * `/zh/studio/image` 移动端画布优先形态的验收夹具
 * ────────────────────────────────────────────────────────────────────────
 * 施工基准：`docs/references/pages/studio-image-mobile-request.md`
 * （owner 2026-09-03 拍板方向 A）。
 *
 * 跑什么：
 *  - 375×812：composer 定位/高度、桌面参数栏是否真的不在 DOM、空态标题、
 *    横向不溢出、模型抽屉与规格 sheet、示例卡回填、触屏命中区计数。
 *  - 375×812 + `page.route` 假成功：**不花钱**验「结果卡自动滚到顶部、
 *    composer 保留原提示词」。
 *  - 1440×900：桌面参数栏还在、composer 不在 DOM。
 *
 * 前置：owner 的 dev 跑在 3000；`e2e/.auth/user.json` 已生成。
 * 运行：node e2e/tools/studio-image-mobile-check.mjs
 * 产出：scratchpad/mobile-pass/*.png + stdout 上的一份 JSON。
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { chromium } from '@playwright/test'

const REPO = path.resolve(import.meta.dirname, '../..')
const OUT_DIR = path.join(REPO, 'scratchpad/mobile-pass')
const STORAGE_STATE = path.join(REPO, 'e2e/.auth/user.json')
const URL = 'http://localhost:3000/zh/studio/image'
const SETTLE_MS = 4000
/** 首帧后再等一次「目标元素出现」—— dev 下 Turbopack 重建能让首屏晚到十几秒。 */
const READY_TIMEOUT_MS = 45000
const GUIDE_SEEN_KEY = 'pixelvault:studio-guide-seen'

const report = {}

function log(key, value) {
  report[key] = value
  console.log(`· ${key} =`, JSON.stringify(value))
}

/**
 * dev + Clerk 偶发 ERR_TOO_MANY_REDIRECTS（会话握手撞上 Turbopack 重建）。
 * 不是被验对象的问题，重试一次即可 —— 但**不吞**：连续失败照旧抛出去。
 */
async function gotoWithRetry(page, url, attempts = 3) {
  for (let i = 1; i <= attempts; i += 1) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded' })
      return
    } catch (error) {
      if (i === attempts) throw error
      console.log(`  (retry ${i}: ${String(error).split('\n')[0]})`)
      await page.waitForTimeout(3000)
    }
  }
}

async function settle(page) {
  await page.waitForTimeout(SETTLE_MS)
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  const browser = await chromium.launch()

  // ── 375×812 ────────────────────────────────────────────────────
  const mobile = await browser.newContext({
    storageState: STORAGE_STATE,
    viewport: { width: 375, height: 812 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  })
  // 首访教程轮播会自动弹一次并盖住 composer —— 那是既有行为，不是本轮改动。
  // 验收前先把"看过"标记写上，否则每一次 tap 都被抽屉遮罩吞掉。
  await mobile.addInitScript((key) => {
    try { localStorage.setItem(key, '1') } catch {}
  }, GUIDE_SEEN_KEY)
  const page = await mobile.newPage()
  await gotoWithRetry(page, URL)
  await settle(page)
  await page
    .locator('.studio-mobile-composer')
    .waitFor({ timeout: READY_TIMEOUT_MS })

  log(
    'composer',
    await page.evaluate(() => {
      const el = document.querySelector('.studio-mobile-composer')
      if (!el) return null
      const rect = el.getBoundingClientRect()
      return {
        position: getComputedStyle(el).position,
        height: Math.round(rect.height),
        bottom: Math.round(rect.bottom),
        viewportHeight: window.innerHeight,
        bottomWithinViewport: rect.bottom <= window.innerHeight + 1,
        id: el.id,
      }
    }),
  )

  log(
    'desktopParamColumnInDom',
    await page.locator('.studio-param-panel').count(),
  )

  log(
    'emptyStateTitle',
    await page.evaluate(() => {
      const composer = document.querySelector('.studio-mobile-composer')
      const heading = Array.from(document.querySelectorAll('h2')).find((h) =>
        h.textContent?.includes('想画什么'),
      )
      if (!heading || !composer) return null
      const h = heading.getBoundingClientRect()
      const c = composer.getBoundingClientRect()
      return {
        text: heading.textContent?.trim(),
        visible: h.height > 0 && h.top >= 0 && h.bottom <= window.innerHeight,
        aboveComposer: h.bottom <= c.top,
      }
    }),
  )

  /**
   * iOS 聚焦放大探针（owner 2026-09-03 报）：<768 上任何可聚焦文本控件的
   * 计算字号 < 16px，Safari 聚焦时会**自动放大整页**。必须为空。
   * ⚠ LoRA 域归另一条线，这里排除掉。
   */
  log(
    'smallFocusableControls',
    await page.evaluate(() => {
      const sel =
        'input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=range]), textarea, select, [contenteditable=true]'
      return Array.from(document.querySelectorAll(sel))
        .filter((el) => !el.closest('[class*="lora"]'))
        .map((el) => ({
          tag: el.tagName.toLowerCase(),
          fontSize: parseFloat(getComputedStyle(el).fontSize),
          label:
            el.getAttribute('aria-label') ??
            el.getAttribute('placeholder') ??
            el.id ??
            '',
        }))
        .filter((entry) => entry.fontSize < 16)
    }),
  )

  log(
    'scrollWidth',
    await page.evaluate(() => ({
      documentScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      viewport: window.innerWidth,
    })),
  )

  log(
    'shortButtonsOutsideChipRow',
    await page.evaluate(() => {
      const offenders = []
      for (const el of document.querySelectorAll('button')) {
        if (el.closest('.studio-mobile-chip-row')) continue
        const rect = el.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) continue
        if (rect.height < 44) {
          offenders.push({
            height: Math.round(rect.height),
            label:
              el.getAttribute('aria-label') ??
              el.textContent?.trim().slice(0, 24) ??
              '',
          })
        }
      }
      return { count: offenders.length, offenders: offenders.slice(0, 12) }
    }),
  )

  await page.screenshot({ path: path.join(OUT_DIR, 'image-impl-375.png') })
  // 同一帧另存一份带 `-polished` 后缀：本轮示例卡渐变 + 摘录的对照底片。
  await page.screenshot({
    path: path.join(OUT_DIR, 'image-impl-375-polished.png'),
  })

  // ── 模型抽屉 ───────────────────────────────────────────────────
  await page.locator('[data-testid="studio-mobile-model-chip"]').tap()
  await page.waitForTimeout(1200)
  log(
    'modelDrawer',
    await page.evaluate(() => {
      const drawer = document.querySelector('.studio-mobile-drawer')
      if (!drawer) return null
      const rows = Array.from(
        drawer.querySelectorAll('[data-slot="command-item"]'),
      )
      const firstRow = rows[0]?.getBoundingClientRect()
      return {
        open: true,
        drawerHeight: Math.round(drawer.getBoundingClientRect().height),
        viewportHeight: window.innerHeight,
        rowCount: rows.length,
        firstRowHeight: firstRow ? Math.round(firstRow.height) : null,
        firstRowFullWidth: firstRow
          ? Math.round(firstRow.width) >= window.innerWidth - 40
          : null,
        footer: drawer.querySelector('button:last-of-type')?.textContent?.trim(),
      }
    }),
  )
  await page.screenshot({ path: path.join(OUT_DIR, 'image-impl-375-model.png') })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(800)
  log(
    'modelDrawerClosedByEscape',
    (await page.locator('.studio-mobile-drawer').count()) === 0,
  )

  // ── 规格 sheet ─────────────────────────────────────────────────
  await page.locator('[data-testid="studio-mobile-spec-chip"]').tap()
  await page.waitForTimeout(1200)
  log(
    'specSheet',
    await page.evaluate(() => {
      const drawer = document.querySelector('.studio-mobile-drawer')
      if (!drawer) return null
      const radios = Array.from(drawer.querySelectorAll('[role="radio"]')).map(
        (r) => r.textContent?.trim(),
      )
      return {
        aspectOptions: radios.filter((label) => label?.includes(':')),
        batchOptions: radios.filter((label) => label?.startsWith('×')),
        hasNegativePrompt: Boolean(
          Array.from(drawer.querySelectorAll('button')).find((b) =>
            b.textContent?.includes('负面提示词'),
          ),
        ),
      }
    }),
  )
  await page.screenshot({ path: path.join(OUT_DIR, 'image-impl-375-spec.png') })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(800)

  // ── 示例卡回填 ─────────────────────────────────────────────────
  const exampleCards = page.locator('.studio-empty-state .grid button')
  const exampleCount = await exampleCards.count()
  let examplePrompt = null
  if (exampleCount > 0) {
    await exampleCards.first().tap()
    await page.waitForTimeout(600)
    examplePrompt = await page.evaluate(
      () =>
        document.querySelector('#studio-prompt textarea')?.value ?? null,
    )
  }
  log('exampleCards', {
    count: exampleCount,
    promptAfterTap: examplePrompt,
    // 没有历史缩略图时也**不能是一块灰**：封面要么有 <img>，要么有渐变底。
    ...(await page.evaluate(() => {
      const cards = Array.from(
        document.querySelectorAll('[data-testid="studio-mobile-example-card"]'),
      )
      return {
        coverNotTransparent: cards.every((c) => {
          const cover = c.firstElementChild
          if (!cover) return false
          const bg = getComputedStyle(cover).backgroundImage
          return Boolean(cover.querySelector('img')) || (bg && bg !== 'none')
        }),
        excerpts: cards.map((c) => c.lastElementChild?.textContent?.trim()),
      }
    })),
  })

  // ── 假成功：不花钱验「结果滚到顶 + composer 保留提示词」 ──────
  const sample = await page.evaluate(async () => {
    const res = await fetch('/api/images?type=image&mine=1&limit=1')
    if (!res.ok) return { error: `status ${res.status}` }
    const json = await res.json()
    const list =
      json?.data?.images ?? json?.data?.generations ?? json?.data ?? []
    return Array.isArray(list) ? (list[0] ?? null) : { error: 'shape' }
  })

  if (sample && !sample.error && sample.url) {
    const fake = {
      ...sample,
      id: `fake-${Date.now()}`,
      prompt: '真机验收用的假结果',
    }
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
          data: { jobId: 'fake-job', status: 'COMPLETED', generation: fake },
        }),
      }),
    )

    await page.evaluate(() => {
      const ta = document.querySelector('#studio-prompt textarea')
      if (!ta) return
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value',
      ).set
      setter.call(ta, '一只戴墨镜的柴犬')
      ta.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await page.waitForTimeout(500)
    await page.locator('[data-testid="studio-mobile-generate"]').tap()
    await page.waitForTimeout(6000)

    log(
      'afterGeneration',
      await page.evaluate(() => {
        const content = document.querySelector(
          '[data-testid="studio-canvas-content"]',
        )
        const stage = document.querySelector('.studio-workbench-stage')
        const ta = document.querySelector('#studio-prompt textarea')
        const img = content?.querySelector('img')
        return {
          resultImageRendered: Boolean(img),
          contentTop: content
            ? Math.round(content.getBoundingClientRect().top)
            : null,
          stageTop: stage ? Math.round(stage.getBoundingClientRect().top) : null,
          promptKept: ta?.value ?? null,
        }
      }),
    )
    // 结果动作行：短标签、等宽、单行、≥44px；下面一行 mono 元信息。
    log(
      'resultActionRow',
      await page.evaluate(() => {
        const row = document.querySelector(
          '[data-testid="studio-mobile-action-row"]',
        )
        const meta = document.querySelector(
          '[data-testid="studio-mobile-result-meta"]',
        )
        if (!row) return null
        const cells = Array.from(row.querySelectorAll('button'))
        const widths = cells.map((c) =>
          Math.round(c.getBoundingClientRect().width),
        )
        return {
          labels: cells.map((c) => c.textContent?.trim()),
          heights: cells.map((c) =>
            Math.round(c.getBoundingClientRect().height),
          ),
          allTallEnough: cells.every(
            (c) => c.getBoundingClientRect().height >= 44,
          ),
          // 折行的格子会明显更高；等宽则说明 `basis-0` 生效了。
          allSingleLine: cells.every(
            (c) => c.getBoundingClientRect().height <= 64,
          ),
          equalWidths: Math.max(...widths) - Math.min(...widths) <= 2,
          metaLine: meta?.textContent?.trim() ?? null,
          // 反馈行紧跟在元信息之下 —— `StudioResultFeedback` 的根节点带
          // `data-generation-id`，用它定位比猜类名稳。
          feedbackRowAfterMeta: (() => {
            const feedback = document.querySelector('[data-generation-id]')
            if (!feedback || !meta) return false
            return (
              feedback.getBoundingClientRect().top >=
              meta.getBoundingClientRect().bottom - 1
            )
          })(),
        }
      }),
    )
    await page.screenshot({
      path: path.join(OUT_DIR, 'image-impl-375-result.png'),
    })
    await page.screenshot({
      path: path.join(OUT_DIR, 'image-impl-375-result-polished.png'),
    })

    // ── 同一份假成功，改跑 2 模型 × 2 张 ────────────────────────
    // 走搜索框选模型：drill 的搜索**绕过全部分层**（平铺过滤），点一条就是
    // 加进名单，不用一层层钻进去。
    try {
      await page.locator('[data-testid="studio-mobile-model-chip"]').tap()
      await page.waitForTimeout(1000)
      for (const query of ['FLUX', 'Gemini']) {
        const search = page.locator('.studio-mobile-drawer input')
        await search.fill(query)
        await page.waitForTimeout(800)
        await page
          .locator('.studio-mobile-drawer [data-slot="command-item"]')
          .first()
          .click()
        await page.waitForTimeout(800)
      }
      log(
        'modelSheetSelectionRows',
        await page.evaluate(
          () =>
            document.querySelectorAll(
              '[data-testid="studio-mobile-model-selection"] > div',
            ).length,
        ),
      )
      await page.locator('[data-testid="studio-mobile-model-done"]').tap()
      await page.waitForTimeout(600)

      await page.locator('[data-testid="studio-mobile-spec-chip"]').tap()
      await page.waitForTimeout(900)
      await page
        .locator('.studio-mobile-drawer [role="radio"]', { hasText: '×2' })
        .first()
        .click()
      await page.waitForTimeout(400)
      await page.keyboard.press('Escape')
      await page.waitForTimeout(600)

      log(
        'matrixChips',
        await page.evaluate(() => ({
          modelChip: document
            .querySelector('[data-testid="studio-mobile-model-chip"]')
            ?.textContent?.trim(),
          specChip: document
            .querySelector('[data-testid="studio-mobile-spec-chip"]')
            ?.textContent?.trim(),
          countBadge: document
            .querySelector('[data-testid="studio-mobile-generate-count"]')
            ?.textContent?.trim(),
          generateAria: document
            .querySelector('[data-testid="studio-mobile-generate"]')
            ?.getAttribute('aria-label'),
        })),
      )

      await page.locator('[data-testid="studio-mobile-generate"]').tap()
      await page.waitForTimeout(8000)
      log(
        'matrixRun',
        await page.evaluate(() => {
          const groups = Array.from(
            document.querySelectorAll('.studio-result-tiles'),
          )
          const firstCells = groups[0] ? Array.from(groups[0].children) : []
          const top = firstCells[0]?.getBoundingClientRect().top ?? 0
          const content = document.querySelector(
            '[data-testid="studio-canvas-content"]',
          )
          return {
            groups: groups.length,
            cells: groups.reduce((n, g) => n + g.children.length, 0),
            columns: firstCells.filter(
              (c) => Math.abs(c.getBoundingClientRect().top - top) < 2,
            ).length,
            documentScrollWidth: document.documentElement.scrollWidth,
            contentTop: content
              ? Math.round(content.getBoundingClientRect().top)
              : null,
            promptKept:
              document.querySelector('#studio-prompt textarea')?.value ?? null,
          }
        }),
      )
      await page.screenshot({
        path: path.join(OUT_DIR, 'image-impl-375-matrix-run.png'),
      })
    } catch (error) {
      log('matrixRun', { failed: String(error).slice(0, 200) })
    }
  } else {
    log('afterGeneration', { skipped: true, sample })
  }

  // ── 图墙（多模型 × 多张）的栅格几何 ───────────────────────────
  // 先用 dev 样板间量几何：它是假数据、不发任何请求，几何可复现。
  await gotoWithRetry(page, 'http://localhost:3000/zh/dev/ui-states')
  await settle(page)
  await page
    .locator('[data-ui-case-trigger="matrix-2x2-portrait"]')
    .click({ timeout: READY_TIMEOUT_MS })
  await page.waitForTimeout(1500)
  log(
    'matrixGridAtDevPage',
    await page.evaluate(() => {
      const groups = Array.from(
        document.querySelectorAll('.studio-result-tiles'),
      )
      const cells = groups.flatMap((g) => Array.from(g.children))
      const first = groups[0]
      const firstCells = first ? Array.from(first.children) : []
      const top = firstCells[0]?.getBoundingClientRect().top ?? 0
      const columns = firstCells.filter(
        (c) => Math.abs(c.getBoundingClientRect().top - top) < 2,
      ).length
      return {
        groups: groups.length,
        cells: cells.length,
        columns,
        display: first ? getComputedStyle(first).display : null,
        cellWidth: firstCells[0]
          ? Math.round(firstCells[0].getBoundingClientRect().width)
          : null,
        documentScrollWidth: document.documentElement.scrollWidth,
        viewport: window.innerWidth,
      }
    }),
  )
  await page.screenshot({
    path: path.join(OUT_DIR, 'image-impl-375-matrix.png'),
    fullPage: false,
  })
  log(
    'matrixCellActionsTouchSize',
    await page.evaluate(() => {
      // 每格的动作走的是图墙底部那条 sticky 动作栏（图上零可点元素）——
      // 先点一格让它出现，再量按钮高度。
      const cell = document.querySelector('.studio-result-tiles > *')
      cell?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      return new Promise((resolve) =>
        setTimeout(() => {
          const bar = document.querySelector('.studio-touch-actions')
          const buttons = bar ? Array.from(bar.querySelectorAll('button')) : []
          resolve({
            actionBarPresent: Boolean(bar),
            buttonCount: buttons.length,
            shortButtons: buttons.filter(
              (b) => b.getBoundingClientRect().height < 44,
            ).length,
          })
        }, 600),
      )
    }),
  )

  await mobile.close()

  // ── 1440×900 ───────────────────────────────────────────────────
  const desktop = await browser.newContext({
    storageState: STORAGE_STATE,
    viewport: { width: 1440, height: 900 },
  })
  await desktop.addInitScript((key) => {
    try { localStorage.setItem(key, '1') } catch {}
  }, GUIDE_SEEN_KEY)
  const dpage = await desktop.newPage()
  await gotoWithRetry(dpage, URL)
  await settle(dpage)
  await dpage
    .locator('.studio-param-panel')
    .waitFor({ timeout: READY_TIMEOUT_MS })
  log(
    'desktop',
    await dpage.evaluate(() => ({
      paramPanel: document.querySelectorAll('.studio-param-panel').length,
      composer: document.querySelectorAll('.studio-mobile-composer').length,
      modelLabel: Array.from(document.querySelectorAll('span')).some((s) =>
        s.textContent?.trim().startsWith('模型'),
      ),
      specLabel: Array.from(document.querySelectorAll('span')).some(
        (s) => s.textContent?.trim() === '规格',
      ),
    })),
  )
  await dpage.screenshot({ path: path.join(OUT_DIR, 'image-impl-1440.png') })
  await desktop.close()

  await browser.close()
  await writeFile(
    path.join(OUT_DIR, 'image-impl-report.json'),
    JSON.stringify(report, null, 2),
    'utf8',
  )
  console.log('\n=== REPORT ===\n' + JSON.stringify(report, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
