import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import type { AppLocale } from '@/i18n/routing'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: AppLocale }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'Metadata' })
  return { title: t('chat.title'), robots: 'noindex, nofollow' }
}

/**
 * `/studio/c/<编号>` = 只开着这一段对话（第 9f 步）。载回哪一段由外壳按地址给
 * （`StudioShell` → `StudioOperatorHistoryRestore`），页面本身没有内容。
 */
export default function StudioConversationPage() {
  return null
}
