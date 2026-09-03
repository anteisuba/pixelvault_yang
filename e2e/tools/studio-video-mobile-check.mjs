/**
 * `/zh/studio/video` 移动端画布优先形态的验收夹具
 * ────────────────────────────────────────────────────────────────────────
 * 施工基准：`docs/references/pages/studio-video-mobile-request.md`
 * （owner 2026-09-03 拍板）。
 *
 * 跑什么：
 *  - 375×812：composer 定位/高度、用途分段置顶、chip 集合、费用行、按钮带时长、
 *    模型抽屉（只列当前用途的视频模型、行 ≥44px）、规格 sheet（时长/分辨率/比例）。
 *  - 375×812 + `page.route` 假任务：**不花钱**验「排队卡 + 说明文案 + 计时」，
 *    再切成 COMPLETED 验「播放器 ≤45vh、结果置顶、动作行无 编辑/用作参考、
 *    按钮变 ↻ Ns」。
 *  - 1440×900：桌面参数栏还在、composer 不在 DOM。
 *
 * 前置：owner 的 dev 跑在 3000；`e2e/.auth/user.json` 已生成。
 * 运行：node e2e/tools/studio-video-mobile-check.mjs
 * 产出：scratchpad/mobile-pass/video-impl-*.png + stdout 上的一份 JSON。
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { chromium } from '@playwright/test'

const REPO = path.resolve(import.meta.dirname, '../..')
const OUT_DIR = path.join(REPO, 'scratchpad/mobile-pass')
const STORAGE_STATE = path.join(REPO, 'e2e/.auth/user.json')
const URL = 'http://localhost:3000/zh/studio/video'
const SETTLE_MS = 4000
const READY_TIMEOUT_MS = 45000
const GUIDE_SEEN_KEY = 'pixelvault:studio-guide-seen'
/** 没有历史视频时的兜底源（公有样片）—— 报告里会标出用的是哪一个。 */
const FALLBACK_VIDEO_URL =
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4'

const report = {}

function log(key, value) {
  report[key] = value
  console.log(`· ${key} =`, JSON.stringify(value))
}

/** dev + Clerk 偶发 ERR_TOO_MANY_REDIRECTS（握手撞 Turbopack 重建）：重试但不吞。 */
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

const settle = (page) => page.waitForTimeout(SETTLE_MS)

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
  await mobile.addInitScript((key) => {
    try {
      localStorage.setItem(key, '1')
    } catch {}
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
        heightWithinBudget: rect.height <= 130,
        bottomWithinViewport: rect.bottom <= window.innerHeight + 1,
        isVideoVariant: el.classList.contains('studio-mobile-composer--video'),
        id: el.id,
      }
    }),
  )

  log(
    'desktopParamColumnInDom',
    await page.locator('.studio-param-panel').count(),
  )

  log(
    'chips',
    await page.evaluate(() => {
      const pick = (id) => {
        const el = document.querySelector(`[data-testid="${id}"]`)
        if (!el) return null
        const rect = el.getBoundingClientRect()
        return {
          text: el.textContent?.trim(),
          height: Math.round(rect.height),
        }
      }
      return {
        model: pick('studio-mobile-model-chip'),
        spec: pick('studio-mobile-spec-chip'),
        audio: pick('studio-mobile-audio-chip'),
        audioRef: pick('studio-mobile-audio-ref-chip'),
        script: pick('studio-mobile-script-chip'),
        // 参考图那颗是既有组件（无 testid），按 aria-label 找。
        // 参考图那颗是既有组件（无 testid），`ImageChip.label` = 「图像」。
        referenceChipPresent: Boolean(
          document.querySelector('.studio-mobile-chip-row [aria-label="图像"]'),
        ),
      }
    }),
  )

  log(
    'videoModeSegment',
    await page.evaluate(() => {
      const seg = document.querySelector(
        '[data-testid="studio-mobile-video-mode"]',
      )
      const composer = document.querySelector('.studio-mobile-composer')
      if (!seg || !composer) return null
      const r = seg.getBoundingClientRect()
      return {
        options: Array.from(seg.querySelectorAll('[role="radio"]')).map((b) =>
          b.textContent?.trim(),
        ),
        checked: Array.from(seg.querySelectorAll('[role="radio"]'))
          .filter((b) => b.getAttribute('aria-checked') === 'true')
          .map((b) => b.textContent?.trim()),
        visible: r.height > 0 && r.top >= 0,
        aboveComposer: r.bottom <= composer.getBoundingClientRect().top,
      }
    }),
  )

  log(
    'costAndButton',
    await page.evaluate(() => {
      const cost = document.querySelector(
        '[data-testid="studio-mobile-cost-line"]',
      )
      const button = document.querySelector(
        '[data-testid="studio-mobile-generate"]',
      )
      const text = button?.textContent?.trim() ?? ''
      return {
        costText: cost?.textContent?.trim() ?? null,
        costMatches: /≈\s*\$/.test(cost?.textContent ?? ''),
        buttonText: text,
        buttonMatchesDuration: /\d+s$/.test(text),
      }
    }),
  )

  log(
    'exampleCards',
    await page.evaluate(() => {
      const cards = Array.from(
        document.querySelectorAll('[data-testid="studio-mobile-example-card"]'),
      )
      return {
        count: cards.length,
        // 16:9 封面：宽/高 ≈ 1.78。
        firstCoverRatio: cards[0]
          ? Number(
              (
                cards[0].firstElementChild.getBoundingClientRect().width /
                cards[0].firstElementChild.getBoundingClientRect().height
              ).toFixed(2),
            )
          : null,
        coverNotTransparent: cards.every((c) => {
          const cover = c.firstElementChild
          const bg = getComputedStyle(cover).backgroundImage
          const hasImg = Boolean(cover.querySelector('img'))
          return hasImg || (bg !== 'none' && bg !== '')
        }),
        excerpts: cards.map((c) => c.lastElementChild?.textContent?.trim()),
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
      viewport: window.innerWidth,
    })),
  )

  await page.screenshot({ path: path.join(OUT_DIR, 'video-impl-375.png') })

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
      return {
        drawerHeight: Math.round(drawer.getBoundingClientRect().height),
        viewportHeight: window.innerHeight,
        rowCount: rows.length,
        shortRows: rows.filter(
          (r) =>
            r.getBoundingClientRect().height < 44 &&
            r.getBoundingClientRect().height > 0,
        ).length,
        rowLabels: rows.slice(0, 12).map((r) => r.textContent?.trim()),
        // 图片档才有的「当前名单」块在视频档必须不存在（单选）。
        hasImageSelectionList: Boolean(
          drawer.querySelector('[data-testid="studio-mobile-model-selection"]'),
        ),
      }
    }),
  )
  await page.screenshot({
    path: path.join(OUT_DIR, 'video-impl-375-model.png'),
  })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(800)

  // ── 规格 sheet ─────────────────────────────────────────────────
  // ⚠ 没选模型时这颗 chip **本来就不该在**（档位全部实算自型号）。本机的视频
  //   模型全部缺 key，所以这一段在本账号上会被跳过 —— 如实记下来，不假装跑过。
  const specChipCount = await page
    .locator('[data-testid="studio-mobile-spec-chip"]')
    .count()
  if (specChipCount === 0) {
    log('specSheet', {
      skipped:
        '本账号无可用视频模型（选择器每行都路由去 QuickSetupDialog），规格 chip 按判据整颗不渲染',
    })
  } else {
    await page.locator('[data-testid="studio-mobile-spec-chip"]').tap()
    await page.waitForTimeout(1200)
    log(
      'specSheet',
      await page.evaluate(() => {
        const drawer = document.querySelector('.studio-mobile-drawer')
        if (!drawer) return null
        const radios = Array.from(
          drawer.querySelectorAll('[role="radio"]'),
        ).map((r) => r.textContent?.trim())
        return {
          durations: radios.filter((l) => /^\d+s$/.test(l ?? '')),
          resolutions: radios.filter((l) => /^\d+p$/.test(l ?? '')),
          ratios: radios.filter((l) => (l ?? '').includes(':')),
          hasSlider: Boolean(drawer.querySelector('[role="slider"]')),
          hasGenerateAudioSwitch: Boolean(
            drawer.querySelector('[role="switch"]'),
          ),
        }
      }),
    )
    await page.screenshot({
      path: path.join(OUT_DIR, 'video-impl-375-spec.png'),
    })
    await page.keyboard.press('Escape')
    await page.waitForTimeout(800)
  }

  // ── 假任务：排队 → 完成 ────────────────────────────────────────
  const sample = await page.evaluate(async () => {
    const res = await fetch('/api/images?type=video&mine=1&limit=1')
    if (!res.ok) return { error: `status ${res.status}` }
    const json = await res.json()
    const list =
      json?.data?.images ?? json?.data?.generations ?? json?.data ?? []
    return Array.isArray(list) ? (list[0] ?? null) : { error: 'shape' }
  })

  const fakeGeneration = {
    id: `fake-${Date.now()}`,
    createdAt: new Date().toISOString(),
    outputType: 'VIDEO',
    status: 'COMPLETED',
    url: sample?.url ?? FALLBACK_VIDEO_URL,
    storageKey: 'fake/key.mp4',
    mimeType: 'video/mp4',
    width: sample?.width ?? 1280,
    height: sample?.height ?? 720,
    duration: sample?.duration ?? 5,
    prompt: '真机验收用的假结果',
    model: sample?.model ?? 'seedance-2.5',
    provider: sample?.provider ?? 'volcengine',
    requestCount: 1,
    isPublic: false,
    isPromptPublic: false,
  }
  log('fakeResultSource', {
    fromAccount: Boolean(sample?.url),
    url: fakeGeneration.url,
  })

  // 提交恒成功；状态先 PROCESSING，`completed` 翻真之后才 COMPLETED。
  const state = { completed: false }
  await page.route('**/api/generate-video', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: { jobId: 'fake-video-job', requestId: 'fake-request' },
      }),
    }),
  )
  await page.route('**/api/generate-video/status*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: state.completed
          ? {
              jobId: 'fake-video-job',
              status: 'COMPLETED',
              generation: fakeGeneration,
            }
          : { jobId: 'fake-video-job', status: 'PROCESSING' },
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
    setter.call(ta, '镜头缓慢推近一杯热咖啡')
    ta.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await page.waitForTimeout(500)
  /**
   * ⚠ `force: true` 不是在绕过闸门：生成键被挡住时是 `aria-disabled` 而不是真
   * `disabled`（真禁用的按钮收不到点击，用户只剩「点了没反应」），而 Playwright
   * 的可操作性检查把 `aria-disabled` 也算作「未启用」。挡没挡住由下面
   * `submitAttempt.blockedReason` 如实报出来。
   */
  const blockedLabel = await page.evaluate(() =>
    document
      .querySelector('[data-testid="studio-mobile-generate"]')
      ?.getAttribute('aria-disabled') === 'true'
      ? document
          .querySelector('[data-testid="studio-mobile-generate"]')
          ?.getAttribute('aria-label')
      : null,
  )
  log('submitAttempt', { blockedReason: blockedLabel })
  await page
    .locator('[data-testid="studio-mobile-generate"]')
    .tap({ force: true })
  await page.waitForTimeout(7000)

  const readTimer = () =>
    page.evaluate(
      () =>
        document
          .querySelector('[data-testid="studio-video-queue-timer"]')
          ?.textContent?.trim() ?? null,
    )
  const timerA = await readTimer()
  await page.waitForTimeout(3000)
  const timerB = await readTimer()

  log(
    'queueCard',
    await page.evaluate(() => {
      const cards = document.querySelector(
        '[data-testid="studio-video-queue-cards"]',
      )
      const stage = document.querySelector('.studio-workbench-stage')
      const bar = cards?.querySelector('[role="progressbar"]')
      const hint = document.querySelector(
        '[data-testid="studio-video-queue-hint"]',
      )
      if (!cards) return null
      const r = cards.getBoundingClientRect()
      return {
        present: true,
        cardCount: cards.querySelectorAll('[role="progressbar"]').length,
        fullWidth: Math.round(r.width) >= window.innerWidth - 32,
        atTopOfStage: stage
          ? Math.round(r.top - stage.getBoundingClientRect().top) < 40
          : null,
        progressNow: bar?.getAttribute('aria-valuenow') ?? null,
        cancelPresent: Boolean(
          cards.querySelector('[data-testid="studio-video-queue-cancel"]'),
        ),
        hintText: hint?.textContent?.trim() ?? null,
        hintVisible: hint ? hint.getBoundingClientRect().height > 0 : false,
      }
    }),
  )
  log('queueTimerTicks', {
    first: timerA,
    later: timerB,
    ticked: timerA !== timerB,
  })
  await page.screenshot({
    path: path.join(OUT_DIR, 'video-impl-375-queue-live.png'),
  })

  // ── 让它完成 ───────────────────────────────────────────────────
  state.completed = true
  await page.waitForTimeout(9000)

  log(
    'result',
    await page.evaluate(() => {
      const content = document.querySelector(
        '[data-testid="studio-canvas-content"]',
      )
      const video = document.querySelector('video')
      const row = document.querySelector(
        '[data-testid="studio-mobile-action-row"]',
      )
      const meta = document.querySelector(
        '[data-testid="studio-mobile-result-meta"]',
      )
      const badge = document.querySelector(
        '[data-testid="studio-video-result-badge"]',
      )
      const labels = row
        ? Array.from(row.querySelectorAll('button')).map((b) =>
            b.textContent?.trim(),
          )
        : []
      const cells = row ? Array.from(row.querySelectorAll('button')) : []
      return {
        videoRendered: Boolean(video),
        videoHeight: video
          ? Math.round(video.getBoundingClientRect().height)
          : null,
        videoWithin45vh: video
          ? video.getBoundingClientRect().height <=
            window.innerHeight * 0.45 + 2
          : null,
        contentTop: content
          ? Math.round(content.getBoundingClientRect().top)
          : null,
        badge: badge?.textContent?.trim() ?? null,
        actionLabels: labels,
        actionHasEdit: labels.includes('编辑'),
        actionHasUseAsReference: labels.some((l) => l?.includes('用作参考')),
        actionCellsSingleLine: cells.every(
          (c) => c.getBoundingClientRect().height <= 64,
        ),
        actionCellsTallEnough: cells.every(
          (c) => c.getBoundingClientRect().height >= 44,
        ),
        metaLine: meta?.textContent?.trim() ?? null,
        buttonText: document
          .querySelector('[data-testid="studio-mobile-generate"]')
          ?.textContent?.trim(),
        queueStillThere: Boolean(
          document.querySelector('[data-testid="studio-video-queue-cards"]'),
        ),
      }
    }),
  )
  await page.screenshot({
    path: path.join(OUT_DIR, 'video-impl-375-result-live.png'),
  })

  /**
   * ── dev 样板间：本机验不到的两屏 ────────────────────────────────
   * 本账号的视频模型**全部缺 key**（选择器每一行都路由去 `QuickSetupDialog`），
   * 所以真机上排不出一条队列、也拿不到一条结果。这两屏改在 `/zh/dev/ui-states`
   * 上量 —— 假数据、零请求、几何可复现（同 `matrixGridAtDevPage` 的手法）。
   */
  await gotoWithRetry(page, 'http://localhost:3000/zh/dev/ui-states')
  await settle(page)
  await page
    .locator('[data-ui-case-trigger="video-queue-mobile"]')
    .click({ timeout: READY_TIMEOUT_MS })
  await page.waitForTimeout(1500)
  log(
    'queueCardsAtDevPage',
    await page.evaluate(() => {
      const cards = document.querySelector(
        '[data-testid="studio-video-queue-cards"]',
      )
      if (!cards) return null
      const bars = Array.from(cards.querySelectorAll('[role="progressbar"]'))
      const hint = document.querySelector(
        '[data-testid="studio-video-queue-hint"]',
      )
      const cancel = cards.querySelector(
        '[data-testid="studio-video-queue-cancel"]',
      )
      const r = cards.getBoundingClientRect()
      return {
        cardCount: bars.length,
        fullWidth: Math.round(r.width) >= window.innerWidth - 56,
        progressValues: bars.map((b) => b.getAttribute('aria-valuenow')),
        cappedAt95: bars.every(
          (b) =>
            Number(b.getAttribute('aria-valuenow')) <= 95 ||
            Number(b.getAttribute('aria-valuenow')) === 100,
        ),
        timers: Array.from(
          cards.querySelectorAll('[data-testid="studio-video-queue-timer"]'),
        ).map((t) => t.textContent?.trim()),
        cancelPresent: Boolean(cancel),
        cancelHeight: cancel
          ? Math.round(cancel.getBoundingClientRect().height)
          : null,
        hintText: hint?.textContent?.trim() ?? null,
        hintVisible: hint ? hint.getBoundingClientRect().height > 0 : false,
        documentScrollWidth: document.documentElement.scrollWidth,
      }
    }),
  )
  await page.screenshot({
    path: path.join(OUT_DIR, 'video-impl-375-queue.png'),
  })

  await page
    .locator('[data-ui-case-trigger="video-result-mobile"]')
    .click({ timeout: READY_TIMEOUT_MS })
  await page.waitForTimeout(2000)
  log(
    'videoResultAtDevPage',
    await page.evaluate(() => {
      const video = document.querySelector('video')
      const row = document.querySelector(
        '[data-testid="studio-mobile-action-row"]',
      )
      const meta = document.querySelector(
        '[data-testid="studio-mobile-result-meta"]',
      )
      const badge = document.querySelector(
        '[data-testid="studio-video-result-badge"]',
      )
      const cells = row ? Array.from(row.querySelectorAll('button')) : []
      const widths = cells.map((c) =>
        Math.round(c.getBoundingClientRect().width),
      )
      const labels = cells.map((c) => c.textContent?.trim())
      return {
        videoRendered: Boolean(video),
        videoHeight: video
          ? Math.round(video.getBoundingClientRect().height)
          : null,
        viewport45vh: Math.round(window.innerHeight * 0.45),
        videoWithin45vh: video
          ? video.getBoundingClientRect().height <=
            window.innerHeight * 0.45 + 2
          : null,
        badge: badge?.textContent?.trim() ?? null,
        actionLabels: labels,
        actionHasEdit: labels.includes('编辑'),
        actionHasUseAsReference: labels.some((l) => l?.includes('用作参考')),
        actionAllTallEnough: cells.every(
          (c) => c.getBoundingClientRect().height >= 44,
        ),
        actionAllSingleLine: cells.every(
          (c) => c.getBoundingClientRect().height <= 64,
        ),
        actionEqualWidths:
          widths.length > 0 && Math.max(...widths) - Math.min(...widths) <= 2,
        metaLine: meta?.textContent?.trim() ?? null,
        documentScrollWidth: document.documentElement.scrollWidth,
      }
    }),
  )
  await page.screenshot({
    path: path.join(OUT_DIR, 'video-impl-375-result.png'),
  })

  await mobile.close()

  // ── 1440×900 ───────────────────────────────────────────────────
  const desktop = await browser.newContext({
    storageState: STORAGE_STATE,
    viewport: { width: 1440, height: 900 },
  })
  await desktop.addInitScript((key) => {
    try {
      localStorage.setItem(key, '1')
    } catch {}
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
      // 桌面视频栏首那条「用途」标签 —— 参数栏没被动过的证据。
      videoModeLabel: Array.from(document.querySelectorAll('[role="radio"]'))
        .map((b) => b.textContent?.trim())
        .filter((l) => ['关键帧', '多图参考', '全能参考'].includes(l ?? '')),
    })),
  )
  await dpage.screenshot({ path: path.join(OUT_DIR, 'video-impl-1440.png') })
  await desktop.close()

  await browser.close()
  await writeFile(
    path.join(OUT_DIR, 'video-impl-report.json'),
    JSON.stringify(report, null, 2),
    'utf8',
  )
  console.log('\n=== REPORT ===\n' + JSON.stringify(report, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
