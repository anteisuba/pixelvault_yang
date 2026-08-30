import { beforeEach, describe, expect, it, vi } from 'vitest'

const protect = vi.fn()

vi.mock('@clerk/nextjs/server', () => ({
  createRouteMatcher:
    (patterns: string[]) => (request: { nextUrl: { pathname: string } }) =>
      patterns.some((pattern) => {
        const prefix = pattern.replace('(.*)', '')
        return pattern.includes('(.*)')
          ? request.nextUrl.pathname.startsWith(prefix)
          : request.nextUrl.pathname === pattern
      }),
  clerkMiddleware:
    (
      handler: (
        auth: { protect: typeof protect },
        request: { nextUrl: { pathname: string; origin: string } },
      ) => unknown,
    ) =>
    (request: { nextUrl: { pathname: string; origin: string } }) =>
      handler({ protect }, request),
}))

vi.mock('next-intl/middleware', () => ({
  default: () => vi.fn(),
}))

import middleware, { config } from './proxy'

describe('proxy static media matcher', () => {
  const pageMatcher = new RegExp(config.matcher[0])

  it('does not route local video files through locale middleware', () => {
    expect(
      pageMatcher.test(
        /* 一条真在架的片子——2026-08-30 前这里指着 `night-ferry-*`，那组素材早已随
           占位故事退役、文件也删了，断言等于指着一个幽灵路径。 */
        '/homepage/production/models/video/model-seedance.mp4',
      ),
    ).toBe(false)
    expect(pageMatcher.test('/homepage/demo.webm')).toBe(false)
  })

  it('still routes locale pages through middleware', () => {
    expect(pageMatcher.test('/zh')).toBe(true)
  })
})

describe('proxy internal execution routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('NODE_ENV', 'production')
  })

  it('lets the execution sweeper reach its CRON_SECRET authentication', async () => {
    await middleware(
      {
        nextUrl: {
          pathname: '/api/internal/execution/sweep',
          origin: 'https://pixelvault.example.com',
        },
      } as never,
      {} as never,
    )

    expect(protect).not.toHaveBeenCalled()
  })

  it.each([
    '/api/internal/civitai-lora/prewarm',
    '/api/internal/civitai-mirror/sync',
    '/api/internal/execution/sweep',
  ])(
    'lets the %s cron reach its CRON_SECRET authentication',
    async (pathname) => {
      // 每加一条 vercel.json 的 cron，这里必须同步放行。漏了不是"偶尔失败"
      // 是 100% 被 Clerk 拦在路由外——连路由里的 CRON_SECRET 校验都够不到，
      // 失败也不会进 logger，表现为这条 cron 静悄悄地永远没跑过。
      // ⚠ 症状是 **404 不是 401**：auth.protect() 只对页面请求 redirect，非页面
      // 请求走 notFound()。查日志要找 404。
      // （2026-08-20 civitai-mirror/sync 就是这么漏的。）
      await middleware(
        {
          nextUrl: { pathname, origin: 'https://pixelvault.example.com' },
        } as never,
        {} as never,
      )

      expect(protect).not.toHaveBeenCalled()
    },
  )

  it('lets the cron heartbeat monitor reach its HEALTH_CHECK_TOKEN gate', async () => {
    // cron-monitor.yml 每天读这条来判断三条 cron 昨天跑没跑。漏放行的话它
    // 恒 404 → workflow 每天开一条假 issue，而真的漏跑反而照旧看不见。
    await middleware(
      {
        nextUrl: {
          pathname: '/api/health/crons',
          origin: 'https://pixelvault.example.com',
        },
      } as never,
      {} as never,
    )

    expect(protect).not.toHaveBeenCalled()
  })

  it('lets a signed-out reader open the terms and the privacy policy', async () => {
    // The auth card's "by continuing you agree to our terms" links point here.
    // While these were protected, following one bounced the reader to sign-in —
    // the screen that had just asked them to agree.
    for (const pathname of [
      '/zh/terms',
      '/zh/privacy',
      '/en/terms',
      '/ja/privacy',
    ]) {
      await middleware(
        {
          nextUrl: { pathname, origin: 'https://pixelvault.example.com' },
        } as never,
        {} as never,
      )
    }

    expect(protect).not.toHaveBeenCalled()
  })

  it('protects nested /api/users routes that are not public profiles', async () => {
    await middleware(
      {
        nextUrl: {
          pathname: '/api/users/admin/export',
          origin: 'https://pixelvault.example.com',
        },
      } as never,
      {} as never,
    )

    expect(protect).toHaveBeenCalledOnce()
  })

  it('allows an explicit development-only E2E auth bypass', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('AUTH_BYPASS_FOR_E2E', 'true')

    await middleware(
      {
        nextUrl: {
          pathname: '/api/studio/generate/status',
          origin: 'http://localhost:3000',
        },
      } as never,
      {} as never,
    )

    expect(protect).not.toHaveBeenCalled()
  })
})
