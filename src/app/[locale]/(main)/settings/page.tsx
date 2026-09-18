import { auth } from '@clerk/nextjs/server'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { ROUTES } from '@/constants/routes'
import { SettingsIndexView } from '@/components/business/settings/SettingsIndexView'
import { redirect } from '@/i18n/navigation'
import type { AppLocale } from '@/i18n/routing'

interface SettingsPageProps {
  params: Promise<{ locale: AppLocale }>
}

export async function generateMetadata({
  params,
}: SettingsPageProps): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'Settings' })
  return {
    title: t('title'),
    description: t('description'),
    robots: 'noindex, nofollow',
  }
}

/**
 * `/settings` 没有自己的内容（D3 ④）：桌面在客户端重定向到 `/settings/keys`，
 * 手机停在一级列表。⛔ 别在服务端无条件 redirect —— 那样手机就永远看不到列表。
 */
export default async function SettingsPage({ params }: SettingsPageProps) {
  const { locale } = await params
  const { userId } = await auth()

  if (!userId) {
    redirect({ href: ROUTES.SIGN_IN, locale })
  }

  return <SettingsIndexView />
}
