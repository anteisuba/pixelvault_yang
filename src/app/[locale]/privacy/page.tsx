import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { LegalPage } from '@/components/business/LegalPage'
import { ROUTES } from '@/constants/routes'
import type { AppLocale } from '@/i18n/routing'
import { pageAddress } from '@/lib/page-address'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: AppLocale }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'Legal' })
  const title = t('privacy.title')

  const address = pageAddress({ locale, path: ROUTES.PRIVACY })

  return {
    title,
    alternates: address.alternates,
    openGraph: { ...address.openGraph, title },
  }
}

interface PrivacyPageProps {
  params: Promise<{ locale: AppLocale }>
}

export default async function PrivacyPage({ params }: PrivacyPageProps) {
  await params
  return <LegalPage doc="privacy" />
}
