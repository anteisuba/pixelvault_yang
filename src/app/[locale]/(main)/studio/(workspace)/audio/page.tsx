import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { StudioModeSync } from '@/components/business/StudioModeSync'
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
    title: t('studio.audio.title'),
    description: t('studio.audio.description'),
    robots: 'noindex, nofollow',
  }
}

/** See StudioImagePage — same pattern; UI lives in the shared layout. */
export default function StudioAudioPage() {
  return <StudioModeSync mode="audio" />
}
