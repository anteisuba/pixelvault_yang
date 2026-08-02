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
  '/api/assistant/share',
  '/api/voices',
  '/api/voices/(.*)',
  '/api/webhooks/clerk',
  '/api/health',
  '/api/health/providers',
  '/api/internal/civitai-lora/prewarm',
  // Worker-to-Next.js internal calls — these endpoints verify their own
  // HMAC/Ed25519 signature and must bypass Clerk auth (the Worker has no
  // Clerk session).
  '/api/internal/execution/callback',
  '/api/internal/execution/resolve-key',
  '/api/internal/execution/long-video/advance',
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
