import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { StudioModeSync } from '@/components/business/StudioModeSync'
import type { AppLocale } from '@/i18n/routing'

interface StudioImageTagsPageProps {
  params: Promise<{ locale: AppLocale }>
}

export async function generateMetadata({
  params,
}: StudioImageTagsPageProps): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'Metadata' })
  return {
    title: t('studio.imageTags.title'),
    description: t('studio.imageTags.description'),
    robots: 'noindex, nofollow',
  }
}

/**
 * 标签台 —— 与 `/studio/image` **同一个壳**（`(workspace)/layout.tsx`），所以
 * 两台之间来回切不会重挂 provider、不会丢提示词、不会闪一下。这一页与图片那一页
 * 一样只是一个路由段标记，真正的差别由 `dialect` 那一格说：工作台据此把中间两列
 * 换成标签编辑器 + 右列控件。
 */
export default function StudioImageTagsPage() {
  return <StudioModeSync mode="image" dialect="tags" />
}
