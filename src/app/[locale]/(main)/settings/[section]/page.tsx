import { auth } from '@clerk/nextjs/server'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { ROUTES } from '@/constants/routes'
import { isSettingsSection } from '@/constants/settings'
import { SettingsSectionView } from '@/components/business/settings/SettingsSectionView'
import { redirect } from '@/i18n/navigation'
import type { AppLocale } from '@/i18n/routing'

interface SettingsSectionPageProps {
  params: Promise<{ locale: AppLocale; section: string }>
}

export async function generateMetadata({
  params,
}: SettingsSectionPageProps): Promise<Metadata> {
  const { locale, section } = await params
  const t = await getTranslations({ locale, namespace: 'Settings' })
  return {
    title: isSettingsSection(section)
      ? `${t(`sections.${section}`)} · ${t('title')}`
      : t('title'),
    description: t('description'),
    robots: 'noindex, nofollow',
  }
}

export default async function SettingsSectionPage({
  params,
}: SettingsSectionPageProps) {
  const { locale, section } = await params
  if (!isSettingsSection(section)) notFound()

  const { userId } = await auth()
  if (!userId) {
    redirect({ href: ROUTES.SIGN_IN, locale })
  }

  return <SettingsSectionView section={section} />
}
