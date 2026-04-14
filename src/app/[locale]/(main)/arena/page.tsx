import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { ArenaPageClient } from '@/components/business/ArenaPageClient'
import type { AppLocale } from '@/i18n/routing'

interface ArenaPageProps {
  params: Promise<{ locale: AppLocale }>
}

export async function generateMetadata({
  params,
}: ArenaPageProps): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'Metadata' })
  return {
    title: t('arena.title'),
    description: t('arena.description'),
  }
}

export default function ArenaPage() {
  return <ArenaPageClient />
}
