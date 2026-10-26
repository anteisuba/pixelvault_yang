import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { VoiceBench } from '@/components/business/studio/voice-bench/VoiceBench'
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

/** 配音台（③，样件 v5）：台条上的「配音」，只配现在这一位。 */
export default function StudioAudioPage() {
  return <VoiceBench />
}
