import { auth } from '@clerk/nextjs/server'
import { getTranslations } from 'next-intl/server'

import { PAGINATION } from '@/constants/config'
import { ROUTES } from '@/constants/routes'
import { cn } from '@/lib/utils'

import { GalleryGrid } from '@/components/business/GalleryGrid'
import { SignOutButton } from '@/components/business/SignOutButton'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import { isCjkLocale, type AppLocale } from '@/i18n/routing'
import {
  countUserGenerations,
  countUserPublicGenerations,
  getUserGenerations,
} from '@/services/generation.service'
import { getUserByClerkId } from '@/services/user.service'
import { getUserUsageSummary } from '@/services/usage.service'

interface ProfilePageProps {
  params: Promise<{ locale: AppLocale }>
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
  const user = clerkId ? await getUserByClerkId(clerkId) : null

  if (!clerkId || !user) {
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

  const [usageSummary, generations, total, publicTotal] = await Promise.all([
    getUserUsageSummary(user.id),
    getUserGenerations(user.id, {
      page: PAGINATION.DEFAULT_PAGE,
      limit: PAGINATION.DEFAULT_LIMIT,
    }),
    countUserGenerations(user.id),
    countUserPublicGenerations(user.id),
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
              <SignOutButton label={t('actions.signOut')} />
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
          <div className="flex flex-col gap-3 border-b border-border/70 pb-6 sm:flex-row sm:items-end sm:justify-between">
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
              <p className="editorial-section-copy max-w-3xl">
                {t('collectionDescription')}
              </p>
            </div>
            <span className="editorial-count-pill">
              {t('collectionCount', {
                shown: generations.length,
                total,
              })}
            </span>
          </div>

          <div className="pt-6">
            <GalleryGrid
              generations={generations}
              emptyTitle={t('emptyTitle')}
              emptyDescription={t('emptyDescription')}
              emptyActionHref={ROUTES.STUDIO}
              emptyActionLabel={t('emptyAction')}
              showVisibility
            />
          </div>
        </section>
      </div>
    </div>
  )
}
