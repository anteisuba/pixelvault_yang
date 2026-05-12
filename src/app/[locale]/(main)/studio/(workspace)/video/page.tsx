import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { StudioModeSync } from '@/components/business/StudioModeSync'
import type { AppLocale } from '@/i18n/routing'

interface StudioVideoPageProps {
  params: Promise<{ locale: AppLocale }>
}

export async function generateMetadata({
  params,
}: StudioVideoPageProps): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'Metadata' })
  return {
    title: t('studio.video.title'),
    description: t('studio.video.description'),
    robots: 'noindex, nofollow',
  }
}

/** See StudioImagePage — same pattern; UI lives in the shared layout. */
export default function StudioVideoPage() {
  return <StudioModeSync mode="video" />
}
