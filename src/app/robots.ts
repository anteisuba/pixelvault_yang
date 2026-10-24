import type { MetadataRoute } from 'next'

import { getAppOrigin } from '@/constants/config'
import { ROUTES } from '@/constants/routes'
import { LOCALES } from '@/i18n/routing'

const API_ROUTE_PREFIX = '/api'
const SITEMAP_ROUTE = '/sitemap.xml'

// 素材 / 提示词等列表页都在 `/library` 下（9f-2e）；`/assets/<id>` 是单张素材详情。
const privateRoutes = [ROUTES.STUDIO, ROUTES.LIBRARY, ROUTES.ASSET_DETAIL]

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
    sitemap: `${getAppOrigin()}${SITEMAP_ROUTE}`,
  }
}
