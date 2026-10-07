import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import createIntlMiddleware from 'next-intl/middleware'

import { getClerkAllowedOrigins } from '@/constants/config'
import { ROUTES } from '@/constants/routes'
import { DEFAULT_LOCALE, LOCALES, routing } from '@/i18n/routing'

const handleI18nRouting = createIntlMiddleware(routing)

const publicLocaleRoutes = LOCALES.flatMap((locale) => [
  `/${locale}`,
  `/${locale}${ROUTES.GALLERY}`,
  `/${locale}${ROUTES.GALLERY}/(.*)`,
  `/${locale}${ROUTES.SIGN_IN}(.*)`,
  `/${locale}${ROUTES.SIGN_UP}(.*)`,
  // The terms and the privacy policy have to be readable by exactly the people
  // who are not signed in — they are linked from the auth card itself, and from
  // the marketing footer. Without these two they redirected to sign-in, so the
  // "by continuing you agree to our terms" link sent you to the very screen
  // that was asking you to agree.
  `/${locale}${ROUTES.TERMS}`,
  `/${locale}${ROUTES.PRIVACY}`,
  `/${locale}${ROUTES.CREATOR_PROFILE}/(.*)`,
  `/${locale}/assistant/share/(.*)`,
])

const isPublicRoute = createRouteMatcher([
  '/',
  ...publicLocaleRoutes,
  '/api/images',
  // Social crawlers (Google, Twitter/X, Discord, ...) fetch og:image URLs
  // with no Clerk session. The route itself checks `isPublic` per
  // generation/profile before rendering, so exposing it here is safe.
  '/api/og',
  '/api/assistant/share',
  '/api/voices',
  '/api/voices/(.*)',
  '/api/webhooks/clerk',
  '/api/health',
  '/api/health/providers',
  // cron-monitor.yml 用 HEALTH_CHECK_TOKEN 读 cron 心跳，同样没有
  // Clerk 会话。
  '/api/health/crons',
  // Worker-to-Next.js internal calls — these endpoints verify their own
  // HMAC/Ed25519 signature and must bypass Clerk auth (the Worker has no
  // Clerk session).
  '/api/internal/execution/callback',
  '/api/internal/execution/resolve-key',
  '/api/internal/execution/long-video/advance',
  // render-video worker（剪辑台导出）的进度 / 成片回调，同样自己验签。
  '/api/studio/render/callback',
  // 外部 Claude 的 MCP 端点：自己验 Bearer 令牌（docs/references/mcp.md）。
  // ⚠ 只放行这一条精确路径 —— `/api/mcp/tokens`（管令牌）仍要 Clerk 会话。
  '/api/mcp',
  // Vercel Cron authenticates with Authorization: Bearer CRON_SECRET inside
  // the route; it has no Clerk session and must reach that verifier first.
  '/api/internal/execution/sweep',
  '/api/internal/fal/webhook',
])

function isDevelopmentEnvironment() {
  return process.env.NODE_ENV === 'development'
}

function isAuthBypassEnabled() {
  return (
    isDevelopmentEnvironment() && process.env.AUTH_BYPASS_FOR_E2E === 'true'
  )
}

function isPublicUserProfileApi(pathname: string) {
  const match = pathname.match(/^\/api\/users\/([^/]+)\/?$/)
  return Boolean(match && match[1] !== 'me')
}

function resolveLocale(pathname: string) {
  return (
    LOCALES.find(
      (locale) =>
        pathname === `/${locale}` || pathname.startsWith(`/${locale}/`),
    ) ?? DEFAULT_LOCALE
  )
}

export default clerkMiddleware(
  async (auth, request) => {
    const pathname = request.nextUrl.pathname

    // Skip i18n handling for API routes
    if (pathname.startsWith('/api')) {
      // Only the exact /api/users/:username profile route is public. Nested
      // routes stay protected so future admin/export endpoints cannot inherit
      // public access from a broad path prefix.
      const isPublicUserApi = isPublicUserProfileApi(pathname)
      if (
        !isAuthBypassEnabled() &&
        !isPublicRoute(request) &&
        !isPublicUserApi
      ) {
        await auth.protect()
      }
      // Explicit NextResponse.next() ensures public API routes (e.g. /api/health)
      // are not inadvertently blocked by Clerk when returning void.
      return NextResponse.next()
    }

    const response = handleI18nRouting(request)
    const hasLocalePrefix = LOCALES.some(
      (locale) =>
        pathname === `/${locale}` || pathname.startsWith(`/${locale}/`),
    )

    if (!hasLocalePrefix) {
      return response
    }

    if (!isAuthBypassEnabled() && !isPublicRoute(request)) {
      await auth.protect()
    }

    return response
  },
  (request) => {
    const locale = resolveLocale(request.nextUrl.pathname)

    return {
      authorizedParties: getClerkAllowedOrigins(
        isDevelopmentEnvironment() ? [request.nextUrl.origin] : [],
      ),
      signInUrl: `/${locale}${ROUTES.SIGN_IN}`,
      signUpUrl: `/${locale}${ROUTES.SIGN_UP}`,
    }
  },
)

export const config = {
  matcher: [
    '/((?!_next|robots\\.txt|sitemap\\.xml|(?:[^?]*/)?(?:opengraph-image|twitter-image)(?:/|$)|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|glb|mp4|webm|mov|mp3|wav|ogg|m4a|opus|aac|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
