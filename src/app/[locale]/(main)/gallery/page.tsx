import { auth } from '@clerk/nextjs/server'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { PAGINATION } from '@/constants/config'
import { getAvailableModels } from '@/constants/models'
import { ROUTES } from '@/constants/routes'
import { cn } from '@/lib/utils'

import { GalleryFeed } from '@/components/business/GalleryFeed'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import { isCjkLocale, type AppLocale } from '@/i18n/routing'
import {
  countPublicGenerations,
  getPublicGenerations,
} from '@/services/generation.service'

interface GalleryPageProps {
  params: Promise<{ locale: AppLocale }>
}

export async function generateMetadata({
  params,
}: GalleryPageProps): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'Metadata' })
  return {
    title: t('gallery.title'),
    description: t('gallery.description'),
  }
}

export default async function GalleryPage({ params }: GalleryPageProps) {
  const { locale } = await params
  const isDenseLocale = isCjkLocale(locale)
  const t = await getTranslations({
    locale,
    namespace: 'GalleryPage',
  })
  const { userId } = await auth()
  const [generations, total] = await Promise.all([
    getPublicGenerations({
      page: PAGINATION.DEFAULT_PAGE,
      limit: PAGINATION.DEFAULT_LIMIT,
    }),
    countPublicGenerations(),
  ])
  const availableModels = getAvailableModels()
  const primaryHref = userId ? ROUTES.STUDIO : ROUTES.SIGN_IN

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
                <Link href={primaryHref}>
                  {userId
                    ? t('actions.primarySignedIn')
                    : t('actions.primarySignedOut')}
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="rounded-full border-border/80 bg-card/72 px-6"
              >
                <Link href={userId ? ROUTES.PROFILE : ROUTES.HOME}>
                  {userId
                    ? t('actions.secondarySignedIn')
                    : t('actions.secondarySignedOut')}
                </Link>
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
                {t('metrics.archiveSizeLabel')}
              </p>
              <p className="editorial-metric-value">
                {t('metrics.archiveSizeValue', { count: total })}
              </p>
            </article>

            <article className="editorial-metric">
              <p
                className={cn(
                  'editorial-metric-label',
                  isDenseLocale && 'tracking-normal normal-case',
                )}
              >
                {t('metrics.modelCoverageLabel')}
              </p>
              <p className="editorial-metric-value">
                {t('metrics.modelCoverageValue', {
                  count: availableModels.length,
                })}
              </p>
            </article>

            <article className="editorial-metric">
              <p
                className={cn(
                  'editorial-metric-label',
                  isDenseLocale && 'tracking-normal normal-case',
                )}
              >
                {t('metrics.curationLabel')}
              </p>
              <p className="editorial-metric-value">
                {t('metrics.curationValue')}
              </p>
            </article>
          </div>
        </section>

        <section className="editorial-panel">
          <div className="space-y-2 border-b border-border/70 pb-6">
            <p
              className={cn(
                'editorial-eyebrow',
                isDenseLocale && 'tracking-normal normal-case',
              )}
            >
              {t('feedEyebrow')}
            </p>
            <h2 className="editorial-section-title">{t('feedTitle')}</h2>
          </div>

          <div className="pt-6">
            <GalleryFeed
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
