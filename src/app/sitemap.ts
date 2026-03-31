import type { MetadataRoute } from 'next'

import { ROUTES, galleryGenerationPath } from '@/constants/routes'
import { LOCALES } from '@/i18n/routing'
import { logger } from '@/lib/logger'
import { getPublicGenerations } from '@/services/generation.service'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const sitemapLogger = logger.child({ route: '/sitemap.xml' })

export const dynamic = 'force-dynamic'

function getLocalizedUrl(locale: string, route: string): string {
  return route === ROUTES.HOME
    ? `${APP_URL}/${locale}`
    : `${APP_URL}/${locale}${route}`
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes = [
    ROUTES.HOME,
    ROUTES.GALLERY,
    ROUTES.ARENA,
    ROUTES.ARENA_LEADERBOARD,
  ] as const

  const staticEntries = LOCALES.flatMap((locale) =>
    staticRoutes.map((route) => ({
      url: getLocalizedUrl(locale, route),
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: route === ROUTES.HOME ? 1.0 : 0.8,
    })),
  )

  let generations: Awaited<ReturnType<typeof getPublicGenerations>> = []

  try {
    generations = await getPublicGenerations({ page: 1, limit: 50 })
  } catch (error) {
    sitemapLogger.warn('Falling back to static sitemap entries', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }

  const galleryEntries = LOCALES.flatMap((locale) =>
    generations.map((gen) => ({
      url: getLocalizedUrl(locale, galleryGenerationPath(gen.id)),
      lastModified: new Date(gen.createdAt),
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
  )

  return [...staticEntries, ...galleryEntries]
}
