import type { MetadataRoute } from 'next'

import { ROUTES } from '@/constants/routes'
import { LOCALES } from '@/i18n/routing'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const API_ROUTE_PREFIX = '/api'
const SITEMAP_ROUTE = '/sitemap.xml'

const privateRoutes = [
  ROUTES.STUDIO,
  ROUTES.PROFILE,
  ROUTES.PROMPTS,
  ROUTES.ASSETS,
  ROUTES.STORYBOARD,
]

function getLocalizedPrivateRoutePatterns(route: string): string[] {
  return LOCALES.map((locale) => `/${locale}${route}`)
}

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          `${API_ROUTE_PREFIX}/`,
          ...privateRoutes.flatMap(getLocalizedPrivateRoutePatterns),
        ],
      },
    ],
    sitemap: `${APP_URL}${SITEMAP_ROUTE}`,
  }
}
