import type { MetadataRoute } from 'next'

import { SITEMAP_PAGE_SIZE } from '@/constants/config'
import {
  ROUTES,
  creatorProfilePath,
  galleryGenerationPath,
} from '@/constants/routes'
import { LOCALES } from '@/i18n/routing'
import { logger } from '@/lib/logger'
import {
  countPublicGenerations,
  getPublicGenerations,
} from '@/services/generation.service'
import {
  countPublicCreators,
  listPublicCreatorUsernames,
} from '@/services/user.service'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const sitemapLogger = logger.child({ route: '/sitemap.xml' })

export const dynamic = 'force-dynamic'

// Sitemap is split into segments via `generateSitemaps` (see
// /sitemap.xml/route.ts for the index that lists them):
// - `static`          — static routes, one URL per locale
// - `generations-<n>` — one page (SITEMAP_PAGE_SIZE) of public generations
// - `creators-<n>`    — one page (SITEMAP_PAGE_SIZE) of public creator profiles
const STATIC_SEGMENT_ID = 'static'
const GENERATIONS_SEGMENT_PATTERN = /^generations-(\d+)$/
const CREATORS_SEGMENT_PATTERN = /^creators-(\d+)$/

function generationsSegmentId(page: number): string {
  return `generations-${page}`
}

function creatorsSegmentId(page: number): string {
  return `creators-${page}`
}

function getLocalizedUrl(locale: string, route: string): string {
  return route === ROUTES.HOME
    ? `${APP_URL}/${locale}`
    : `${APP_URL}/${locale}${route}`
}

export async function generateSitemaps(): Promise<{ id: string }[]> {
  const [generationTotal, creatorTotal] = await Promise.all([
    countPublicGenerations().catch(() => 0),
    countPublicCreators().catch(() => 0),
  ])

  const generationPageCount = Math.max(
    1,
    Math.ceil(generationTotal / SITEMAP_PAGE_SIZE),
  )
  const creatorPageCount = Math.ceil(creatorTotal / SITEMAP_PAGE_SIZE)

  return [
    { id: STATIC_SEGMENT_ID },
    ...Array.from({ length: generationPageCount }, (_, i) => ({
      id: generationsSegmentId(i + 1),
    })),
    ...Array.from({ length: creatorPageCount }, (_, i) => ({
      id: creatorsSegmentId(i + 1),
    })),
  ]
}

function getStaticEntries(): MetadataRoute.Sitemap {
  const staticRoutes = [
    ROUTES.HOME,
    ROUTES.GALLERY,
    ROUTES.ARENA,
    ROUTES.ARENA_LEADERBOARD,
  ] as const

  return LOCALES.flatMap((locale) =>
    staticRoutes.map((route) => ({
      url: getLocalizedUrl(locale, route),
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: route === ROUTES.HOME ? 1.0 : 0.8,
    })),
  )
}

async function getGenerationEntries(
  page: number,
): Promise<MetadataRoute.Sitemap> {
  let generations: Awaited<ReturnType<typeof getPublicGenerations>> = []

  try {
    generations = await getPublicGenerations({
      page,
      limit: SITEMAP_PAGE_SIZE,
    })
  } catch (error) {
    sitemapLogger.warn('Falling back to an empty generations segment', {
      page,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return []
  }

  return LOCALES.flatMap((locale) =>
    generations.map((gen) => ({
      url: getLocalizedUrl(locale, galleryGenerationPath(gen.id)),
      lastModified: new Date(gen.createdAt),
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
  )
}

async function getCreatorEntries(page: number): Promise<MetadataRoute.Sitemap> {
  let usernames: string[] = []

  try {
    usernames = await listPublicCreatorUsernames({
      page,
      limit: SITEMAP_PAGE_SIZE,
    })
  } catch (error) {
    sitemapLogger.warn('Falling back to an empty creators segment', {
      page,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return []
  }

  return LOCALES.flatMap((locale) =>
    usernames.map((username) => ({
      url: getLocalizedUrl(locale, creatorProfilePath(username)),
      changeFrequency: 'weekly' as const,
      priority: 0.5,
    })),
  )
}

export default async function sitemap({
  id,
}: {
  id: Promise<string>
}): Promise<MetadataRoute.Sitemap> {
  const segmentId = await id

  if (segmentId === STATIC_SEGMENT_ID) {
    return getStaticEntries()
  }

  const generationsMatch = segmentId.match(GENERATIONS_SEGMENT_PATTERN)
  if (generationsMatch) {
    return getGenerationEntries(Number(generationsMatch[1]))
  }

  const creatorsMatch = segmentId.match(CREATORS_SEGMENT_PATTERN)
  if (creatorsMatch) {
    return getCreatorEntries(Number(creatorsMatch[1]))
  }

  return []
}
