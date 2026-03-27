import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import createIntlMiddleware from 'next-intl/middleware'

import { ROUTES } from '@/constants/routes'
import { LOCALES, routing } from '@/i18n/routing'

const handleI18nRouting = createIntlMiddleware(routing)

const publicLocaleRoutes = LOCALES.flatMap((locale) => [
  `/${locale}`,
  `/${locale}${ROUTES.GALLERY}`,
  `/${locale}${ROUTES.GALLERY}/(.*)`,
  `/${locale}${ROUTES.SIGN_IN}(.*)`,
  `/${locale}${ROUTES.SIGN_UP}(.*)`,
  `/${locale}${ROUTES.CREATOR_PROFILE}/(.*)`,
])

const isPublicRoute = createRouteMatcher([
  '/',
  ...publicLocaleRoutes,
  '/api/images',
  '/api/webhooks/clerk',
])

export default clerkMiddleware(async (auth, request) => {
  const pathname = request.nextUrl.pathname

  // Skip i18n handling for API routes
  if (pathname.startsWith('/api')) {
    // /api/users/:username is public, but /api/users/me/* requires auth
    const isPublicUserApi =
      pathname.startsWith('/api/users/') &&
      !pathname.startsWith('/api/users/me')
    if (!isPublicRoute(request) && !isPublicUserApi) {
      await auth.protect()
    }
    return
  }

  const response = handleI18nRouting(request)
  const hasLocalePrefix = LOCALES.some(
    (locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`),
  )

  if (!hasLocalePrefix) {
    return response
  }

  if (!isPublicRoute(request)) {
    await auth.protect()
  }

  return response
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
