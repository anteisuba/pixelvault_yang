import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { StudioWorkspace } from '@/components/business/StudioWorkspace'
import type { AppLocale } from '@/i18n/routing'

interface StudioAudioPageProps {
  params: Promise<{ locale: AppLocale }>
}

export async function generateMetadata({
  params,
}: StudioAudioPageProps): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'Metadata' })
  return {
    title: t('studio.title'),
    description: t('studio.description'),
    robots: 'noindex, nofollow',
  }
}

export default function StudioAudioPage() {
  return <StudioWorkspace defaultMediaGroup="audio" />
}
