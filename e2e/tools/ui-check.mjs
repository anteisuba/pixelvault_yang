/**
 * 登录后 UI 验收夹具：截图 + 动效参数 + 几何探针，一条命令跑完
 * ────────────────────────────────────────────────────────────────────────
 * 用途：改完 UI 后对 **Vercel Preview**（或本地 dev）跑一遍，产出给 owner
 * 看的图/视频，以及给 Claude 读的**文字**报告。约定见
 * `docs/references/testing.md` 的「UI 验收（preview）」节：平时 Claude 只读
 * report.json，不打开图片；owner 说要优化时才看图。
 *
 * 每个 path × 视口（桌面 1440×900、手机 390×844）：
 *  - 登录测试用户（Clerk testing token + `+clerk_test` 邮箱，同 auth.setup.ts）
 *  - 截首屏 png；`--video` 时同时录 webm
 *  - `document.getAnimations()`：实际时长 / 缓动 / 迭代次数
 *  - `prefers-reduced-motion: reduce` 下仍在跑的动画（应为 0 或仅极短过渡）
 *  - `scripts/ui-probe.js`：遮挡 / 相交 / 触控尺寸
 *  - console error、失败请求、横向溢出
 *
 * 运行：
 *   node e2e/tools/ui-check.mjs <baseURL> [path ...] [--video] [--out dir]
 *   node e2e/tools/ui-check.mjs https://pixelvault-xxx.vercel.app /zh/studio
 *
 * 环境变量：
 *   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY / CLERK_SECRET_KEY  Clerk **dev** 实例
 *     （必须和目标站点用的是同一个实例，否则 testing token 无效）
 *   E2E_CLERK_USER_EMAIL                 `+clerk_test` 测试用户
 *   VERCEL_AUTOMATION_BYPASS_SECRET      Preview 开了 Deployment Protection 时必填
 *   UI_CHECK_ANON=1                      不登录，只看公开页
 *
 * 产出：<out>/<slug>-<viewport>.png（+ .webm）与 <out>/report.json；
 * stdout 只打印一份精简摘要。
 */
import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

import nextEnv from '@next/env'
import {
  clerk,
  clerkSetup,
  setupClerkTestingToken,
} from '@clerk/testing/playwright'
import { chromium } from '@playwright/test'

const REPO = path.resolve(import.meta.dirname, '../..')
nextEnv.loadEnvConfig(REPO, true)

const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 } },
  mobile: {
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  },
}
/** 首屏稳定等待：入场动画一般 ≤ 1s，留余量给流式渲染。 */
const SETTLE_MS = 2500
/** 云端容器预装的 chromium（与 node_modules 里的 playwright 版本解耦）。 */
const CLOUD_CHROMIUM = '/opt/pw-browsers/chromium'
/**
 * 预置 localStorage：首访教程会盖住 studio（同 studio-image-mobile-check），
 * 隐私横幅会盖住底部 composer。横幅选「仅必要」，测试流量不进分析/录屏。
 * key 与 `src/constants/privacy-consent.ts` 的 CONSENT_STORAGE_KEY 保持一致。
 */
const PRESET_STORAGE = {
  'pixelvault:studio-guide-seen': '1',
  'pixelvault:privacy-consent:v1': 'rejected',
}
/** 动画录制窗口：入场动画通常在首屏 1s 内跑完，等页面稳定再采就全错过了。 */
const RECORD_MS = 6000
/** 摘要里每类最多列几条 —— 完整列表在 report.json。 */
const SUMMARY_LIMIT = 5

function parseArgs(argv) {
  const args = { base: 'http://localhost:3000', paths: [], video: false }
  args.out = path.join(REPO, 'scratchpad/ui-check')
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--video') args.video = true
    else if (a === '--out') args.out = path.resolve(argv[++i])
    else if (/^https?:\/\//.test(a)) args.base = a.replace(/\/$/, '')
    else args.paths.push(a.startsWith('/') ? a : `/${a}`)
  }
  if (args.paths.length === 0) args.paths.push('/zh/studio')
  return args
}

const slugOf = (p) =>
  p.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-') || 'root'

/**
 * 注入到页面的录制器：从文档创建起每 100ms 扫一次 `getAnimations()`，
 * 按「目标 + 名称」去重累积到 `window.__uiAnims` —— 跑完即消失的入场动画也能记下。
 */
function installAnimationRecorder(recordMs) {
  const seen = new Map()
  const labelOf = (target) =>
    target
      ? `${target.tagName?.toLowerCase() ?? ''}${
          typeof target.className === 'string' && target.className
            ? '.' + target.className.trim().split(/\s+/).slice(0, 2).join('.')
            : ''
        }`
      : '(no target)'
  const scan = () => {
    for (const anim of document.getAnimations()) {
      const timing = anim.effect?.getTiming?.() ?? {}
      const name =
        anim.animationName || anim.transitionProperty || anim.id || ''
      const target = labelOf(anim.effect?.target)
      const key = `${target}|${name}|${anim.constructor.name}`
      if (seen.has(key)) continue
      seen.set(key, {
        kind: anim.constructor.name,
        name,
        target,
        duration:
          typeof timing.duration === 'number'
            ? Math.round(timing.duration)
            : timing.duration,
        delay: Math.round(timing.delay ?? 0),
        easing: timing.easing,
        iterations: timing.iterations,
        atMs: Math.round(performance.now()),
      })
    }
  }
  const timer = setInterval(scan, 100)
  setTimeout(() => clearInterval(timer), recordMs)
  window.__uiAnims = () => {
    scan()
    return [...seen.values()]
  }
}

async function newContext(browser, viewportKey, opts) {
  const headers = {}
  if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
    headers['x-vercel-protection-bypass'] =
      process.env.VERCEL_AUTOMATION_BYPASS_SECRET
    headers['x-vercel-set-bypass-cookie'] = 'true'
  }
  const context = await browser.newContext({
    ...VIEWPORTS[viewportKey],
    extraHTTPHeaders: headers,
    reducedMotion: opts.reducedMotion ? 'reduce' : 'no-preference',
    ...(opts.videoDir
      ? {
          recordVideo: {
            dir: opts.videoDir,
            size: VIEWPORTS[viewportKey].viewport,
          },
        }
      : {}),
  })
  await context.addInitScript((preset) => {
    try {
      for (const [k, v] of Object.entries(preset)) localStorage.setItem(k, v)
    } catch {}
  }, PRESET_STORAGE)
  await context.addInitScript(installAnimationRecorder, RECORD_MS)
  return context
}

/**
 * 等 URL 稳定：studio 等路由会在客户端再跳一次（locale / 子路由），
 * 跳转中 evaluate 会抛 "Execution context was destroyed"。
 */
async function waitForStableUrl(page, quietMs = 1000, maxMs = 15_000) {
  const start = Date.now()
  let last = page.url()
  let since = Date.now()
  while (Date.now() - start < maxMs) {
    await page.waitForTimeout(200)
    if (page.url() !== last) {
      last = page.url()
      since = Date.now()
    } else if (Date.now() - since >= quietMs) break
  }
  await page.waitForLoadState('load')
}

async function signIn(page, base) {
  await setupClerkTestingToken({ page })
  await page.goto(`${base}/en`, { waitUntil: 'domcontentloaded' })
  await clerk.loaded({ page })
  await clerk.signIn({
    page,
    signInParams: {
      strategy: 'email_code',
      identifier: process.env.E2E_CLERK_USER_EMAIL,
    },
  })
}

async function checkPage(
  browser,
  args,
  pathname,
  viewportKey,
  probeSource,
  anon,
) {
  const slug = `${slugOf(pathname)}-${viewportKey}`
  const result = { path: pathname, viewport: viewportKey }
  const consoleErrors = []
  const failedRequests = []

  const context = await newContext(browser, viewportKey, {
    videoDir: args.video ? args.out : undefined,
  })
  const page = await context.newPage()
  page.on(
    'console',
    (m) => m.type() === 'error' && consoleErrors.push(m.text().slice(0, 200)),
  )
  page.on('requestfailed', (r) =>
    failedRequests.push(
      `${new URL(r.url()).host} ${r.failure()?.errorText ?? ''}`,
    ),
  )
  page.on(
    'response',
    (r) =>
      r.status() >= 500 &&
      failedRequests.push(`${r.status()} ${r.url().slice(0, 120)}`),
  )

  try {
    if (!anon) await signIn(page, args.base)
    await page.goto(`${args.base}${pathname}`, {
      waitUntil: 'load',
      timeout: 120_000,
    })
    await waitForStableUrl(page)
    // 落点：被弹回 sign-in = 登录没生效；保留 URL 给报告。
    result.finalUrl = page.url()
    result.signedIn = anon ? null : !/sign-in/.test(page.url())
    await page.waitForTimeout(SETTLE_MS)
    result.animations = await page.evaluate(() => window.__uiAnims?.() ?? [])
    await page.screenshot({ path: path.join(args.out, `${slug}.png`) })
    result.horizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    await page.addScriptTag({ content: probeSource })
    const probe = await page.evaluate(() => window.__uiProbe())
    result.probe = {
      occluded: probe.occluded,
      overlap: probe.overlap,
      counterWithoutControl: probe.counterWithoutControl,
      smallTapTargets:
        viewportKey === 'mobile' ? probe.smallTapTargets : undefined,
    }
  } catch (error) {
    result.error = String(error).split('\n')[0]
    await page
      .screenshot({ path: path.join(args.out, `${slug}-error.png`) })
      .catch(() => {})
  }

  result.consoleErrors = consoleErrors
  result.failedRequests = [...new Set(failedRequests)]
  const video = page.video()
  await context.close()
  if (video) {
    const target = path.join(args.out, `${slug}.webm`)
    await rename(await video.path(), target).catch(() => {})
    result.video = target
  }

  // reduced-motion：同页再开一次，记录仍有时长的动画。
  if (!result.error) {
    const reduced = await newContext(browser, viewportKey, {
      reducedMotion: true,
    })
    const rp = await reduced.newPage()
    try {
      if (!anon) await signIn(rp, args.base)
      await rp.goto(`${args.base}${pathname}`, {
        waitUntil: 'load',
        timeout: 120_000,
      })
      await waitForStableUrl(rp)
      await rp.waitForTimeout(SETTLE_MS)
      result.reducedMotionStillAnimating = (
        await rp.evaluate(() => window.__uiAnims?.() ?? [])
      ).filter((a) => typeof a.duration === 'number' && a.duration > 0)
    } catch (error) {
      result.reducedMotionError = String(error).split('\n')[0]
    }
    await reduced.close()
  }
  return result
}

function summarize(r) {
  const lines = [`■ ${r.path} [${r.viewport}]`]
  if (r.error) lines.push(`  ✗ error: ${r.error}`)
  if (r.signedIn === false) lines.push(`  ✗ 未登录，落在 ${r.finalUrl}`)
  if (r.horizontalOverflow > 0)
    lines.push(`  ✗ 横向溢出 ${r.horizontalOverflow}px`)
  const anims = r.animations ?? []
  lines.push(`  动画 ${anims.length} 个${anims.length ? '：' : ''}`)
  for (const a of anims.slice(0, SUMMARY_LIMIT))
    lines.push(
      `    ${a.name || a.kind} ${a.duration}ms ${a.easing} ×${a.iterations} → ${a.target}`,
    )
  const rm = r.reducedMotionStillAnimating ?? []
  if (rm.length) lines.push(`  ⚠ reduced-motion 下仍有 ${rm.length} 个动画`)
  for (const [key, list] of Object.entries(r.probe ?? {}))
    if (list?.length) lines.push(`  ⚠ ${key}: ${list.length}`)
  if (r.consoleErrors.length)
    lines.push(
      `  ⚠ console error ${r.consoleErrors.length}：${r.consoleErrors[0]}`,
    )
  if (r.failedRequests.length)
    lines.push(
      `  ⚠ 失败请求 ${r.failedRequests.length}：${r.failedRequests.slice(0, SUMMARY_LIMIT).join(' | ')}`,
    )
  return lines.join('\n')
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const anon = process.env.UI_CHECK_ANON === '1'
  await mkdir(args.out, { recursive: true })
  if (!anon) {
    if (!process.env.E2E_CLERK_USER_EMAIL)
      throw new Error('Missing E2E_CLERK_USER_EMAIL')
    await clerkSetup()
  }
  const probeSource = await readFile(
    path.join(REPO, 'scripts/ui-probe.js'),
    'utf8',
  )
  const browser = await chromium.launch({
    ...(existsSync(CLOUD_CHROMIUM) ? { executablePath: CLOUD_CHROMIUM } : {}),
    // 云端出网只有 HTTPS 代理；testing token 的 route.fetch 走 Node 侧，
    // 不显式给 proxy 就直连 DNS 失败（ENOTFOUND）。
    ...(process.env.HTTPS_PROXY
      ? {
          proxy: {
            server: process.env.HTTPS_PROXY,
            bypass: 'localhost,127.0.0.1',
          },
        }
      : {}),
  })
  const results = []
  for (const p of args.paths)
    for (const vk of Object.keys(VIEWPORTS))
      results.push(await checkPage(browser, args, p, vk, probeSource, anon))
  await browser.close()

  await writeFile(
    path.join(args.out, 'report.json'),
    JSON.stringify(
      { base: args.base, at: new Date().toISOString(), results },
      null,
      2,
    ),
  )
  console.log(results.map(summarize).join('\n'))
  console.log(`\n产出：${args.out}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
