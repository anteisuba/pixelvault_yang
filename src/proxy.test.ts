import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const protect = vi.fn()
/** API 路由读会话（`await auth()`）；页面路由走 `auth.protect()`。 */
const readAuth = vi.fn(
  async (): Promise<{ userId: string | null }> => ({
    userId: 'user_test',
  }),
)
const authChecks = () => protect.mock.calls.length + readAuth.mock.calls.length

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
        auth: typeof readAuth & { protect: typeof protect },
        request: { nextUrl: { pathname: string; origin: string } },
      ) => unknown,
    ) =>
    (request: { nextUrl: { pathname: string; origin: string } }) =>
      handler(Object.assign(readAuth, { protect }), request),
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
          origin: 'https://antei.example.com',
        },
      } as never,
      {} as never,
    )

    expect(authChecks()).toBe(0)
  })

  it.each([
    '/api/internal/execution/sweep',
    // 出门接力（角色大项目第 ⑤ 步）：自己调自己，同样验 CRON_SECRET。
    '/api/internal/characters/outing',
  ])(
    'lets the %s cron reach its CRON_SECRET authentication',
    async (pathname) => {
      // 每加一条 vercel.json 的 cron，这里必须同步放行。漏了不是"偶尔失败"
      // 是 100% 被 Clerk 拦在路由外——连路由里的 CRON_SECRET 校验都够不到，
      // 失败也不会进 logger，表现为这条 cron 静悄悄地永远没跑过。
      // ⚠ 症状是门口的 401（2026-10-29 前是 auth.protect() 回的空 404）。
      // （2026-08-20 civitai-mirror/sync 就是这么漏的。）
      await middleware(
        {
          nextUrl: { pathname, origin: 'https://antei.example.com' },
        } as never,
        {} as never,
      )

      expect(authChecks()).toBe(0)
    },
  )

  /**
   * 凡是用 `createApiInternalRoute` 的路由都是**机器调机器**、自己验签，调用方没有
   * Clerk 会话。漏进公开表的症状与上面 cron 那条一样：100% 被门口拦下、够不到验签、
   * 不进 logger（2026-09-28 剪辑台导出线上实跑：render-video worker 的每一帧回调都
   * 404，任务永远停在「拉取素材 · 0%」）。⚠ 扫源码而不是手抄列表 —— 手抄列表正是
   * 漏掉它的那张表。
   */
  const SIGNED_ROUTES = readdirSync(join(process.cwd(), 'src/app'), {
    recursive: true,
    encoding: 'utf8',
  })
    .filter((file) => file.endsWith('route.ts'))
    .filter((file) =>
      readFileSync(join(process.cwd(), 'src/app', file), 'utf8').includes(
        'createApiInternalRoute',
      ),
    )
    .map((file) => `/${dirname(file)}`)

  it('finds the signed internal routes to check', () => {
    expect(SIGNED_ROUTES).toContain('/api/studio/render/callback')
  })

  it.each(SIGNED_ROUTES)(
    'lets the signed route %s reach its own signature check',
    async (pathname) => {
      await middleware(
        {
          nextUrl: { pathname, origin: 'https://antei.example.com' },
        } as never,
        {} as never,
      )

      expect(authChecks()).toBe(0)
    },
  )

  it('lets an external Claude reach the MCP endpoint with only its bearer token', async () => {
    await middleware(
      {
        nextUrl: {
          pathname: '/api/mcp',
          origin: 'https://antei.example.com',
        },
      } as never,
      {} as never,
    )

    expect(authChecks()).toBe(0)
  })

  it('lets an OAuth client read the MCP resource metadata before signing in', async () => {
    await middleware(
      {
        nextUrl: {
          pathname: '/api/mcp/oauth-protected-resource',
          origin: 'https://antei.example.com',
        },
      } as never,
      {} as never,
    )

    expect(authChecks()).toBe(0)
  })

  it('keeps generation confirmations behind a Clerk session', async () => {
    await middleware(
      {
        nextUrl: {
          pathname: '/api/mcp/generation-requests',
          origin: 'https://antei.example.com',
        },
      } as never,
      {} as never,
    )

    expect(authChecks()).toBe(1)
  })

  it('keeps MCP token management behind a Clerk session', async () => {
    await middleware(
      {
        nextUrl: {
          pathname: '/api/mcp/tokens',
          origin: 'https://antei.example.com',
        },
      } as never,
      {} as never,
    )

    expect(authChecks()).toBe(1)
  })

  it('lets the cron heartbeat monitor reach its HEALTH_CHECK_TOKEN gate', async () => {
    // cron-monitor.yml 每天读这条来判断三条 cron 昨天跑没跑。漏放行的话它
    // 恒 401 → workflow 每天开一条假 issue，而真的漏跑反而照旧看不见。
    await middleware(
      {
        nextUrl: {
          pathname: '/api/health/crons',
          origin: 'https://antei.example.com',
        },
      } as never,
      {} as never,
    )

    expect(authChecks()).toBe(0)
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
          nextUrl: { pathname, origin: 'https://antei.example.com' },
        } as never,
        {} as never,
      )
    }

    expect(authChecks()).toBe(0)
  })

  it('lets a signed-out social crawler fetch /api/og', async () => {
    // gallery/[id] and u/[username] both point their og:image metadata at
    // this route. Google/Twitter/Discord fetch that URL with no Clerk
    // session — the route itself checks `isPublic` before rendering.
    await middleware(
      {
        nextUrl: {
          pathname: '/api/og',
          origin: 'https://antei.example.com',
        },
      } as never,
      {} as never,
    )

    expect(authChecks()).toBe(0)
  })

  it('protects nested /api/users routes that are not public profiles', async () => {
    await middleware(
      {
        nextUrl: {
          pathname: '/api/users/admin/export',
          origin: 'https://antei.example.com',
        },
      } as never,
      {} as never,
    )

    expect(authChecks()).toBe(1)
  })

  it('answers a signed-out API call with a 401 the client can recover from', async () => {
    // auth.protect() 对 API 回空的 404：会话一过期，助手出图就报「Failed with
    // status 404」（2026-10-29）。门口要回 401 + 能翻译的 JSON，apiFetch 才会续会话重发。
    readAuth.mockResolvedValueOnce({ userId: null })

    const response = (await middleware(
      {
        nextUrl: {
          pathname: '/api/studio/generate',
          origin: 'https://antei.example.com',
        },
      } as never,
      {} as never,
    )) as Response

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({
      errorCode: 'UNAUTHORIZED',
      i18nKey: 'errors.auth.unauthorized',
    })
    expect(protect).not.toHaveBeenCalled()
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

    expect(authChecks()).toBe(0)
  })
})
