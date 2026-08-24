import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { PAGINATION } from '@/constants/config'
import { GallerySearchSchema } from '@/types'
import { getPublicGenerationPage } from '@/services/generation.service'

import { GalleryFeed } from '@/components/business/GalleryFeed'
import type { AppLocale } from '@/i18n/routing'

export const revalidate = 60

interface GalleryPageProps {
  params: Promise<{ locale: AppLocale }>
  searchParams: Promise<{
    search?: string
    model?: string
    sort?: string
    type?: string
    timeRange?: string
    liked?: string
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

export default async function GalleryPage({ searchParams }: GalleryPageProps) {
  const filterResult = GallerySearchSchema.safeParse(await searchParams)
  const initialFilters = filterResult.success
    ? {
        search: filterResult.data.search ?? '',
        models: filterResult.data.model,
        sort: filterResult.data.sort,
        types: filterResult.data.type,
        timeRange: filterResult.data.timeRange,
        liked: filterResult.data.liked === '1',
        published: filterResult.data.published === '1',
        projectId: filterResult.data.projectId ?? '',
      }
    : {
        search: '',
        models: [],
        sort: 'newest' as const,
        types: [],
        timeRange: 'all' as const,
        liked: false,
        published: false,
        projectId: '',
      }
  const initialPage = await getPublicGenerationPage({
    page: PAGINATION.DEFAULT_PAGE,
    limit: PAGINATION.DEFAULT_LIMIT,
    search: initialFilters.search || undefined,
    model: initialFilters.models,
    sort: initialFilters.sort,
    type: initialFilters.types,
    timeRange: initialFilters.timeRange,
    published: initialFilters.published,
  })
  const total = initialPage.total ?? initialPage.generations.length

  return (
    <div className="relative min-h-svh">
      {/* ⚠ 这里以前是 `mx-auto max-w-gallery`（80rem = 1280px）。1900 宽的窗口
          减掉侧边栏还有 ~1740 可用，被卡在 1280 就等于两边各丢 230px 白边，而
          画廊是内容浏览页，白边换不来任何东西（owner 2026-08-24 实拍）。
          ⭐ 单去掉封顶不够：`GalleryGrid` 的列数封顶在 3 列，容器一宽只会把三张
          图拉大，不会多出内容。所以那边同时加了 `2xl:grid-cols-4` —— 1900 下每
          列约 401px，与原来的 389px 几乎一样，卡片尺寸不变、同屏多一列。
          与素材页同构：那边本来就没有 max-width（C+F 那轮的结论）。 */}
      <div className="px-4 pt-6 pb-12 sm:px-6 lg:px-8">
        <GalleryFeed
          initialGenerations={initialPage.generations}
          initialPage={PAGINATION.DEFAULT_PAGE}
          initialHasMore={initialPage.hasMore}
          initialNextCursor={initialPage.nextCursor}
          total={total}
          initialFilters={initialFilters}
        />
      </div>
    </div>
  )
}
