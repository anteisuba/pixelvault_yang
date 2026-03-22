import type { MetadataRoute } from 'next'

import { LOCALES } from '@/i18n/routing'
import { getPublicGenerations } from '@/services/generation.service'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes = ['', '/gallery', '/arena', '/arena/leaderboard']

  const staticEntries = LOCALES.flatMap((locale) =>
    staticRoutes.map((route) => ({
      url: `${APP_URL}/${locale}${route}`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: route === '' ? 1.0 : 0.8,
    })),
  )

  const generations = await getPublicGenerations({ page: 1, limit: 50 })
  const galleryEntries = LOCALES.flatMap((locale) =>
    generations.map((gen) => ({
      url: `${APP_URL}/${locale}/gallery/${gen.id}`,
      lastModified: new Date(gen.createdAt),
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
  )

  return [...staticEntries, ...galleryEntries]
}
