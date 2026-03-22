import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { isAppLocale } from '@/i18n/routing'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  if (!isAppLocale(locale)) return {}
  const t = await getTranslations({ locale, namespace: 'Metadata' })
  return {
    title: t('arenaLeaderboard.title'),
    description: t('arenaLeaderboard.description'),
  }
}

export default function LeaderboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
