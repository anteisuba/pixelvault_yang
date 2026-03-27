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
import {
  countUserGenerations,
  countUserGenerationsByType,
  countUserPublicGenerations,
  getUserGenerations,
} from '@/services/generation.service'
import { ensureUser } from '@/services/user.service'
import { getUserUsageSummary } from '@/services/usage.service'

interface ProfilePageProps {
  params: Promise<{ locale: AppLocale }>
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

export default async function ProfilePage({ params }: ProfilePageProps) {
  const { locale } = await params
  const isDenseLocale = isCjkLocale(locale)
  const t = await getTranslations({
    locale,
    namespace: 'LibraryPage',
  })
  const tCommon = await getTranslations({
    locale,
    namespace: 'Common',
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

  const [usageSummary, generations, total, publicTotal, typeCounts] =
    await Promise.all([
      getUserUsageSummary(user.id),
      getUserGenerations(user.id, {
        page: PAGINATION.DEFAULT_PAGE,
        limit: PAGINATION.DEFAULT_LIMIT,
      }),
      countUserGenerations(user.id),
      countUserPublicGenerations(user.id),
      countUserGenerationsByType(user.id),
    ])
  const privateTotal = Math.max(total - publicTotal, 0)

  return (
    <div className="editorial-page">
      <div className="editorial-container">
        <section className="editorial-hero">
          <div className="editorial-hero-copy">
            <span
              className={cn(
                'editorial-eyebrow',
                isDenseLocale && 'tracking-normal normal-case',
              )}
            >
              {t('heroEyebrow')}
            </span>

            <h1 className="editorial-title">{t('heroTitle')}</h1>
            <p className="editorial-copy max-w-2xl">{t('heroDescription')}</p>

            <div className="editorial-actions">
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

          <div className="editorial-metrics">
            <article className="editorial-metric">
              <p
                className={cn(
                  'editorial-metric-label',
                  isDenseLocale && 'tracking-normal normal-case',
                )}
              >
                {t('metrics.totalWorksLabel')}
              </p>
              <p className="editorial-metric-value">
                {t('metrics.totalWorksValue', { count: total })}
              </p>
            </article>

            <article className="editorial-metric">
              <p
                className={cn(
                  'editorial-metric-label',
                  isDenseLocale && 'tracking-normal normal-case',
                )}
              >
                {t('metrics.imagesLabel')}
              </p>
              <p className="editorial-metric-value">
                {t('metrics.imagesValue', { count: typeCounts.images })}
              </p>
            </article>

            <article className="editorial-metric">
              <p
                className={cn(
                  'editorial-metric-label',
                  isDenseLocale && 'tracking-normal normal-case',
                )}
              >
                {t('metrics.videosLabel')}
              </p>
              <p className="editorial-metric-value">
                {t('metrics.videosValue', { count: typeCounts.videos })}
              </p>
            </article>

            <article className="editorial-metric">
              <p
                className={cn(
                  'editorial-metric-label',
                  isDenseLocale && 'tracking-normal normal-case',
                )}
              >
                {t('metrics.publicWorksLabel')}
              </p>
              <p className="editorial-metric-value">
                {t('metrics.publicWorksValue', { count: publicTotal })}
              </p>
            </article>

            <article className="editorial-metric">
              <p
                className={cn(
                  'editorial-metric-label',
                  isDenseLocale && 'tracking-normal normal-case',
                )}
              >
                {t('metrics.privateWorksLabel')}
              </p>
              <p className="editorial-metric-value">
                {t('metrics.privateWorksValue', { count: privateTotal })}
              </p>
            </article>

            <article className="editorial-metric">
              <p
                className={cn(
                  'editorial-metric-label',
                  isDenseLocale && 'tracking-normal normal-case',
                )}
              >
                {t('metrics.creditsLabel')}
              </p>
              <p className="editorial-metric-value">
                {tCommon('creditCount', {
                  count: usageSummary.totalRequests,
                })}
              </p>
            </article>
          </div>
        </section>

        <section className="editorial-panel">
          <div className="border-b border-border/70 pb-6">
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
          </div>

          <div className="pt-6">
            <ProfileFeed
              initialGenerations={generations}
              initialPage={PAGINATION.DEFAULT_PAGE}
              initialHasMore={
                PAGINATION.DEFAULT_PAGE * PAGINATION.DEFAULT_LIMIT < total
              }
              total={total}
            />
          </div>
        </section>
      </div>
    </div>
  )
}
