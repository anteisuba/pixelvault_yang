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

import middleware from './proxy'

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
