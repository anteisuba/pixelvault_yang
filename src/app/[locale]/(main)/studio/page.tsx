import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { StudioWorkspace } from '@/components/business/StudioWorkspace'
import type { AppLocale } from '@/i18n/routing'

interface StudioPageProps {
  params: Promise<{ locale: AppLocale }>
}

export async function generateMetadata({
  params,
}: StudioPageProps): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'Metadata' })
  return {
    title: t('studio.title'),
    description: t('studio.description'),
    robots: 'noindex, nofollow',
  }
}

export default async function StudioPage() {
  // ApiKeysProvider is hoisted to MainLayout so Navbar's card drawer can use it.
  return <StudioWorkspace />
}
