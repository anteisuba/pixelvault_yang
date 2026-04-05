import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { PAGINATION } from '@/constants/config'
import { GallerySearchSchema } from '@/types'
import {
  countPublicGenerations,
  getPublicGenerations,
} from '@/services/generation.service'

import { GalleryFeed } from '@/components/business/GalleryFeed'
import { Particles } from '@/components/ui/particles'
import type { AppLocale } from '@/i18n/routing'

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

  return (
    <div className="relative min-h-screen">
      <Particles
        className="fixed inset-0 z-0"
        quantity={120}
        staticity={30}
        ease={40}
        size={1.5}
        color="#c4653f"
      />
      <div className="relative z-[1] mx-auto max-w-content px-4 sm:px-6 lg:px-8 pt-6 pb-12">
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
  )
}
