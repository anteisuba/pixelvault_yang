import { Suspense } from 'react'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { LoraLibraryOverlayView } from '@/features/lora'
import { StudioLibraryOverlay } from '@/components/business/studio/shell/StudioLibraryOverlay'
import type { AppLocale } from '@/i18n/routing'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: AppLocale }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'Metadata' })
  return { title: t('loraLibrary.title'), robots: 'noindex, nofollow' }
}

/**
 * `/library/lora`（第 9f 步 9f-2b）：LoRA 台原来那两格「库 / 收藏」叠在外壳中间。
 * `<Suspense>`：来源 / 筛选 / 哪一格都记在网址里（`useSearchParams`）。
 */
export default function LibraryLoraPage() {
  return (
    <StudioLibraryOverlay category="lora">
      <Suspense fallback={null}>
        <LoraLibraryOverlayView />
      </Suspense>
    </StudioLibraryOverlay>
  )
}
