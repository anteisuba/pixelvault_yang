import { auth } from '@clerk/nextjs/server'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { PAGINATION } from '@/constants/config'
import { ROUTES } from '@/constants/routes'

import { KreaAssetBrowser } from '@/components/business/KreaAssetBrowser'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import type { AppLocale } from '@/i18n/routing'
import { GallerySearchSchema } from '@/types'
import { getPublicGenerationPage } from '@/services/generation.service'
import { ensureUser } from '@/services/user.service'

interface AssetsPageProps {
  params: Promise<{ locale: AppLocale }>
  searchParams: Promise<{
    search?: string
    model?: string
    sort?: string
    type?: string
    projectId?: string
  }>
}

export async function generateMetadata({
  params,
}: AssetsPageProps): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'Metadata' })
  return {
    title: t('assets.title'),
    description: t('assets.description'),
    robots: 'noindex, nofollow',
  }
}

/**
 * /assets — Krea-style asset browser. Replaces /profile in the sidebar's
 * main nav (Phase 7) but keeps the same data sources (getPublicGenerations
 * scoped to the signed-in user). The Krea-aligned right sidebar with
 * All / Favorites / Tools / Folders lands in Phase 7.3 — for now this page
 * reuses ProfileFeed so the Project chip filter + create dialog work
 * unchanged.
 */
export default async function AssetsPage({
  params,
  searchParams,
}: AssetsPageProps) {
  const { locale: _locale } = await params
  void _locale
  const filterResult = GallerySearchSchema.safeParse(await searchParams)
  const initialFilters = filterResult.success
    ? {
        search: filterResult.data.search ?? '',
        model: filterResult.data.model ?? '',
        sort: filterResult.data.sort,
        type: filterResult.data.type,
        timeRange: filterResult.data.timeRange,
        liked: false,
        projectId: filterResult.data.projectId ?? '',
      }
    : {
        search: '',
        model: '',
        sort: 'newest' as const,
        type: 'all' as const,
        timeRange: 'all' as const,
        liked: false,
        projectId: '',
      }

  const t = await getTranslations({ locale: _locale, namespace: 'AssetsPage' })
  const { userId: clerkId } = await auth()

  if (!clerkId) {
    return (
      <div className="editorial-page">
        <div className="editorial-container">
          <div className="editorial-panel text-center">
            <div className="mx-auto max-w-xl space-y-4">
              <h1 className="font-display text-3xl font-medium tracking-tight">
                {t('signedOutTitle')}
              </h1>
              <p className="font-serif text-sm leading-7 text-muted-foreground">
                {t('signedOutDescription')}
              </p>
              <Button asChild className="rounded-full px-5">
                <Link href={ROUTES.STUDIO}>{t('signedOutAction')}</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const user = await ensureUser(clerkId)

  const initialPage = await getPublicGenerationPage({
    page: PAGINATION.DEFAULT_PAGE,
    limit: PAGINATION.DEFAULT_LIMIT,
    search: initialFilters.search || undefined,
    model: initialFilters.model || undefined,
    sort: initialFilters.sort,
    type: initialFilters.type,
    userId: user.id,
    projectId: initialFilters.projectId || undefined,
  })
  const filteredTotal = initialPage.total ?? initialPage.generations.length

  return (
    <KreaAssetBrowser
      initialGenerations={initialPage.generations}
      initialPage={PAGINATION.DEFAULT_PAGE}
      initialHasMore={initialPage.hasMore}
      initialNextCursor={initialPage.nextCursor}
      initialTotal={filteredTotal}
      initialFilters={initialFilters}
    />
  )
}
