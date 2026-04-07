import { auth } from '@clerk/nextjs/server'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { PAGINATION } from '@/constants/config'
import { ROUTES } from '@/constants/routes'
import { cn } from '@/lib/utils'

import { ProfileFeed } from '@/components/business/ProfileFeed'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import { isCjkLocale, type AppLocale } from '@/i18n/routing'
import { GallerySearchSchema } from '@/types'
import {
  countUserGenerations,
  countUserPublicGenerations,
  countPublicGenerations,
  getPublicGenerations,
} from '@/services/generation.service'
import { ensureUser } from '@/services/user.service'
import { getUserUsageSummary } from '@/services/usage.service'

interface ProfilePageProps {
  params: Promise<{ locale: AppLocale }>
  searchParams: Promise<{
    search?: string
    model?: string
    sort?: string
    type?: string
  }>
}

export async function generateMetadata({
  params,
}: ProfilePageProps): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'Metadata' })
  return {
    title: t('profile.title'),
    description: t('profile.description'),
  }
}

export default async function ProfilePage({
  params,
  searchParams,
}: ProfilePageProps) {
  const { locale } = await params
  const filterResult = GallerySearchSchema.safeParse(await searchParams)
  const initialFilters = filterResult.success
    ? {
        search: filterResult.data.search ?? '',
        model: filterResult.data.model ?? '',
        sort: filterResult.data.sort,
        type: filterResult.data.type,
        timeRange: filterResult.data.timeRange,
        liked: false,
      }
    : {
        search: '',
        model: '',
        sort: 'newest' as const,
        type: 'all' as const,
        timeRange: 'all' as const,
        liked: false,
      }
  const isDenseLocale = isCjkLocale(locale)
  const t = await getTranslations({
    locale,
    namespace: 'LibraryPage',
  })
  const { userId: clerkId } = await auth()

  if (!clerkId) {
    return (
      <div className="editorial-page">
        <div className="editorial-container">
          <div className="editorial-panel text-center">
            <div className="mx-auto max-w-xl space-y-4">
              <h1 className="font-display text-3xl font-medium tracking-tight">
                {t('syncPendingTitle')}
              </h1>
              <p className="font-serif text-sm leading-7 text-muted-foreground">
                {t('syncPendingDescription')}
              </p>
              <Button asChild className="rounded-full px-5">
                <Link href={ROUTES.STUDIO}>{t('syncPendingAction')}</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const user = await ensureUser(clerkId)

  const [usageSummary, generations, total, publicTotal, filteredTotal] =
    await Promise.all([
      getUserUsageSummary(user.id),
      getPublicGenerations({
        page: PAGINATION.DEFAULT_PAGE,
        limit: PAGINATION.DEFAULT_LIMIT,
        search: initialFilters.search || undefined,
        model: initialFilters.model || undefined,
        sort: initialFilters.sort,
        type: initialFilters.type,
        userId: user.id,
      }),
      countUserGenerations(user.id),
      countUserPublicGenerations(user.id),
      countPublicGenerations({
        search: initialFilters.search || undefined,
        model: initialFilters.model || undefined,
        type: initialFilters.type,
        userId: user.id,
      }),
    ])
  const privateTotal = Math.max(total - publicTotal, 0)

  return (
    <div className="editorial-page">
      <div className="editorial-container">
        <section className="editorial-panel">
          <div className="editorial-panel-head">
            <div className="editorial-section-head">
              <span
                className={cn(
                  'editorial-eyebrow',
                  isDenseLocale && 'tracking-normal normal-case',
                )}
              >
                {t('heroEyebrow')}
              </span>
              <h1 className="editorial-section-title">{t('heroTitle')}</h1>
              <p className="editorial-section-copy max-w-3xl">
                {t('heroDescription')}
              </p>

              <div className="editorial-actions pt-2">
                <Button asChild size="lg" className="rounded-full px-6">
                  <Link href={ROUTES.STUDIO}>{t('actions.primary')}</Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="rounded-full border-border/80 bg-card/72 px-6"
                >
                  <Link href={ROUTES.GALLERY}>{t('actions.secondary')}</Link>
                </Button>
              </div>
            </div>

            <div className="editorial-panel-meta">
              <p className="font-serif text-sm text-muted-foreground">
                {t('metrics.inlineSummary', {
                  total,
                  publicCount: publicTotal,
                  privateCount: privateTotal,
                  requestCount: usageSummary.totalRequests,
                })}
              </p>
            </div>
          </div>

          <div className="editorial-panel-divider">
            <div className="editorial-section-head">
              <p
                className={cn(
                  'editorial-eyebrow',
                  isDenseLocale && 'tracking-normal normal-case',
                )}
              >
                {t('collectionEyebrow')}
              </p>
              <h2 className="editorial-section-title">
                {t('collectionTitle')}
              </h2>
            </div>

            <div className="pt-6">
              <ProfileFeed
                initialGenerations={generations}
                initialPage={PAGINATION.DEFAULT_PAGE}
                initialHasMore={
                  PAGINATION.DEFAULT_PAGE * PAGINATION.DEFAULT_LIMIT <
                  filteredTotal
                }
                total={filteredTotal}
                initialFilters={initialFilters}
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
