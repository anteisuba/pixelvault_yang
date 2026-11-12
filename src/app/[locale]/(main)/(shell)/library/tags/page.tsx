import { Suspense } from 'react'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { StudioLibraryOverlay } from '@/components/business/studio/shell/StudioLibraryOverlay'
import { TagLibraryView } from '@/features/studio'
import type { AppLocale } from '@/i18n/routing'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: AppLocale }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'Metadata' })
  return { title: t('tagLibrary.title'), robots: 'noindex, nofollow' }
}

/**
 * `/library/tags`（第 9f 步 9f-2c）：Danbooru 标签像 LoRA 库那样摊开，叠在外壳中间。
 * `<Suspense>`：库 / 收藏、哪一类、搜索词、打开的详情都记在网址里（`useSearchParams`）。
 */
export default function LibraryTagsPage() {
  return (
    <StudioLibraryOverlay category="tags">
      <Suspense fallback={null}>
        <TagLibraryView />
      </Suspense>
    </StudioLibraryOverlay>
  )
}
