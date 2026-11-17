import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { devices, test } from '@playwright/test'

import { SMOKE_PAGES } from './helpers'

/**
 * 触屏命中区报告（owner 2026-11-16 拍 A）：用手机视口 + 触屏（`pointer: coarse`）把冒烟的
 * 每一页打开，用 `scripts/ui-probe.js` 量所有可点元素，小于 44px 的记下来。
 *
 * ⚠ **只报告、不拦截**：本用例永远不红。清单写进 `e2e/.pages/tap-targets/<页>.json`
 * （随 artifact「e2e-pages」上传），日志里打一行摘要。为什么不做成闸门：
 *  - 可点元素的无障碍名有一部分来自数据（素材名、卡片名、模型名），CI 每次是一次性库、
 *    前面的 journeys 用例又会造数据，「页面 + 角色 + 名字」做不到跨跑稳定；
 *  - 基线只能在 CI 那套环境（Linux、一次性库、生产构建）里产出，本机 dev + 真实账号量出来的
 *    对不上 CI。拿对不上的基线当闸门，就是往 main 上加一个随机红的来源。
 * 想升成棘轮：攒几次 CI 的报告，确认同一提交两次跑的 `key` 集合一致，再把它存成基线。
 *
 * 量法：getBoundingClientRect 与 `.touch-target(-y)` 的 `::before` 外扩取大
 * （见 ui-probe.js 的 hitSize）。只量声明出来的命中区：被祖先 overflow 裁掉、被邻居
 * 盖住的那部分量不出来。
 */
const PROBE_SOURCE = readFileSync(
  path.join(__dirname, '..', '..', 'scripts', 'ui-probe.js'),
  'utf8',
)
const OUT_DIR = path.join(__dirname, '..', '.pages', 'tap-targets')
/** 日志里每页列几条，完整清单在 json。 */
const LOG_LIMIT = 5

interface SmallTapTarget {
  element: string
  role: string
  name: string
  rect: { x: number; y: number; w: number; h: number }
  hit: { w: number; h: number }
}

interface ProbeResult {
  pointerCoarse: boolean
  counted: { interactive: number }
  smallTapTargets: SmallTapTarget[]
}

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
  userAgent: devices['Pixel 7'].userAgent,
})

for (const route of SMOKE_PAGES) {
  test(`触屏命中区（只报告）：${route}`, async ({ page }) => {
    test.setTimeout(60_000)
    const slug = route.replace(/^\//, '').replace(/\//g, '_')
    const report: Record<string, unknown> = { route }
    try {
      await page.goto(route, { timeout: 30_000 })
      // 网络一直不静（轮询、长连接）也照量：等不到就按当前画面量。
      await page
        .waitForLoadState('networkidle', { timeout: 10_000 })
        .catch(() => undefined)
      await page.addScriptTag({ content: PROBE_SOURCE })
      const probe = (await page.evaluate(() =>
        (window as unknown as { __uiProbe: () => ProbeResult }).__uiProbe(),
      )) as ProbeResult
      // 同一 role|name 收成一条带数量：同一页里一排同样的小钮只算一类问题。
      const byKey = new Map<string, { count: number; sample: SmallTapTarget }>()
      for (const t of probe.smallTapTargets) {
        const key = `${t.role}|${t.name}`
        const hit = byKey.get(key)
        if (hit) hit.count += 1
        else byKey.set(key, { count: 1, sample: t })
      }
      Object.assign(report, {
        finalUrl: new URL(page.url()).pathname,
        pointerCoarse: probe.pointerCoarse,
        // 量了多少个可点元素：0 = 页面没渲染出来，这页的「0 个违规」不可信。
        interactive: probe.counted.interactive,
        total: probe.smallTapTargets.length,
        keys: [...byKey.entries()]
          .map(([key, v]) => ({ key, count: v.count, sample: v.sample }))
          .sort((a, b) => a.key.localeCompare(b.key)),
      })
      const head = [...byKey.entries()]
        .slice(0, LOG_LIMIT)
        .map(
          ([key, v]) =>
            `${key} ×${v.count} (${v.sample.hit.w}×${v.sample.hit.h})`,
        )
        .join(' · ')
      console.log(
        `[tap-targets] ${route} coarse=${probe.pointerCoarse} 可点 ${probe.counted.interactive} 个，<44px: ${probe.smallTapTargets.length} 个 / ${byKey.size} 类${head ? ` — ${head}` : ''}`,
      )
    } catch (error) {
      // 只报告：打不开 / 量不了也不让 CI 红（打不开由 smoke.spec 负责拦）。
      report.error = String(error).split('\n')[0]
      console.log(`[tap-targets] ${route} 未量成：${report.error}`)
    }
    await mkdir(OUT_DIR, { recursive: true })
    await writeFile(
      path.join(OUT_DIR, `${slug}.json`),
      JSON.stringify(report, null, 2),
    )
  })
}
