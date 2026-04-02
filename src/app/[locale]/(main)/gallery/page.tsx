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
import { GallerySearchSchema } from '@/types'
import {
  countPublicGenerations,
  getPublicGenerations,
} from '@/services/generation.service'

export const revalidate = 60

interface GalleryPageProps {
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
}: GalleryPageProps): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'Metadata' })
  return {
    title: t('gallery.title'),
    description: t('gallery.description'),
  }
}

export default async function GalleryPage({
  params,
  searchParams,
}: GalleryPageProps) {
  const { locale } = await params
  const filterResult = GallerySearchSchema.safeParse(await searchParams)
  const initialFilters = filterResult.success
    ? {
        search: filterResult.data.search ?? '',
        model: filterResult.data.model ?? '',
        sort: filterResult.data.sort,
        type: filterResult.data.type,
      }
    : {
        search: '',
        model: '',
        sort: 'newest' as const,
        type: 'all' as const,
      }
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
      search: initialFilters.search || undefined,
      model: initialFilters.model || undefined,
      sort: initialFilters.sort,
      type: initialFilters.type,
    }),
    countPublicGenerations({
      search: initialFilters.search || undefined,
      model: initialFilters.model || undefined,
      type: initialFilters.type,
    }),
  ])
  const availableModels = getAvailableModels()
  const primaryHref = userId ? ROUTES.STUDIO : ROUTES.SIGN_IN

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

            <div className="editorial-panel-meta">
              <p className="font-serif text-sm text-muted-foreground">
                {t('metrics.inlineSummary', {
                  imageCount: total,
                  modelCount: availableModels.length,
                })}
              </p>
            </div>
          </div>

          <div className="editorial-panel-divider">
            <div className="space-y-2">
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
                initialFilters={initialFilters}
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
