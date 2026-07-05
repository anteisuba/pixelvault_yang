import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { LegalPage } from '@/components/business/LegalPage'
import { ROUTES } from '@/constants/routes'
import type { AppLocale } from '@/i18n/routing'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: AppLocale }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'Legal' })
  const title = t('terms.title')

  return {
    title,
    alternates: { canonical: `${APP_URL}/${locale}${ROUTES.TERMS}` },
  }
}

interface TermsPageProps {
  params: Promise<{ locale: AppLocale }>
}

export default async function TermsPage({ params }: TermsPageProps) {
  await params
  return <LegalPage doc="terms" />
}
