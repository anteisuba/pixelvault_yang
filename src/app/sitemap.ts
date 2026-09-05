import type { MetadataRoute } from 'next'

import { SITEMAP_MAX_URLS, SITEMAP_QUERY_BATCH_SIZE } from '@/constants/config'
import {
  ROUTES,
  creatorProfilePath,
  galleryGenerationPath,
} from '@/constants/routes'
import { LOCALES } from '@/i18n/routing'
import { logger } from '@/lib/logger'
import { getPublicGenerations } from '@/services/generation.service'
import { listPublicCreatorUsernames } from '@/services/user.service'

/**
 * `/sitemap.xml` — one file, every public URL.
 *
 * ⚠ Deliberately **not** `generateSitemaps`. That convention moves the real
 * documents to `/sitemap/<id>.xml` while still claiming `/sitemap.xml` as a
 * metadata route, so a hand-written index at that path is a build-time route
 * collision (`Conflicting route and metadata at /sitemap.xml`) — and the path
 * Search Console already has on file would stop being the sitemap. A single
 * file also stays correct up to `SITEMAP_MAX_URLS`, which the catalogue is
 * nowhere near.
 *
 * The catalogue is walked in `SITEMAP_QUERY_BATCH_SIZE` batches so no single
 * query loads the whole table; a short batch ends the walk.
 */
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const sitemapLogger = logger.child({ route: '/sitemap.xml' })

export const dynamic = 'force-dynamic'

function getLocalizedUrl(locale: string, route: string): string {
  return route === ROUTES.HOME
    ? `${APP_URL}/${locale}`
    : `${APP_URL}/${locale}${route}`
}

/**
 * Walk an offset-paginated reader until it returns a short batch. A failing
 * batch ends the walk and keeps whatever was already collected: a sitemap
 * missing its tail still beats Search Console fetching a 500.
 */
async function collectAllPages<T>(
  read: (page: number) => Promise<T[]>,
  label: string,
): Promise<T[]> {
  const collected: T[] = []

  for (let page = 1; ; page += 1) {
    let batch: T[]
    try {
      batch = await read(page)
    } catch (error) {
      sitemapLogger.warn('Sitemap walk stopped early', {
        label,
        page,
        collected: collected.length,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      return collected
    }

    collected.push(...batch)

    if (batch.length < SITEMAP_QUERY_BATCH_SIZE) return collected
    if (collected.length >= SITEMAP_MAX_URLS) return collected
  }
}

function getStaticEntries(): MetadataRoute.Sitemap {
  const staticRoutes = [ROUTES.HOME, ROUTES.GALLERY] as const

  return LOCALES.flatMap((locale) =>
    staticRoutes.map((route) => ({
      url: getLocalizedUrl(locale, route),
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: route === ROUTES.HOME ? 1.0 : 0.8,
    })),
  )
}

async function getGenerationEntries(): Promise<MetadataRoute.Sitemap> {
  const generations = await collectAllPages(
    (page) => getPublicGenerations({ page, limit: SITEMAP_QUERY_BATCH_SIZE }),
    'generations',
  )

  return LOCALES.flatMap((locale) =>
    generations.map((generation) => ({
      url: getLocalizedUrl(locale, galleryGenerationPath(generation.id)),
      lastModified: new Date(generation.createdAt),
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
  )
}

async function getCreatorEntries(): Promise<MetadataRoute.Sitemap> {
  const usernames = await collectAllPages(
    (page) =>
      listPublicCreatorUsernames({ page, limit: SITEMAP_QUERY_BATCH_SIZE }),
    'creators',
  )

  return LOCALES.flatMap((locale) =>
    usernames.map((username) => ({
      url: getLocalizedUrl(locale, creatorProfilePath(username)),
      changeFrequency: 'weekly' as const,
      priority: 0.5,
    })),
  )
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [generationEntries, creatorEntries] = await Promise.all([
    getGenerationEntries(),
    getCreatorEntries(),
  ])

  const entries = [
    ...getStaticEntries(),
    ...generationEntries,
    ...creatorEntries,
  ]

  if (entries.length > SITEMAP_MAX_URLS) {
    sitemapLogger.warn('Sitemap truncated at the single-file URL ceiling', {
      total: entries.length,
      ceiling: SITEMAP_MAX_URLS,
    })
    return entries.slice(0, SITEMAP_MAX_URLS)
  }

  return entries
}
