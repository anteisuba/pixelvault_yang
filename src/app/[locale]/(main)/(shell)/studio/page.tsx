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
 * `/studio` = 创作首页（第 9f 步）：一段新对话 + 大输入框，铺在外壳中间那一栏
 * （`StudioShell`）。页面本身没有内容 —— 没有台开着。
 */
export default function StudioHomePage() {
  return null
}
