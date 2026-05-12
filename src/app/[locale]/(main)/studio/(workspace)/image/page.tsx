import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { StudioModeSync } from '@/components/business/StudioModeSync'
import type { AppLocale } from '@/i18n/routing'

interface StudioImagePageProps {
  params: Promise<{ locale: AppLocale }>
}

export async function generateMetadata({
  params,
}: StudioImagePageProps): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'Metadata' })
  return {
    title: t('studio.image.title'),
    description: t('studio.image.description'),
    robots: 'noindex, nofollow',
  }
}

/**
 * The actual UI lives in (workspace)/layout.tsx — this page is just a
 * Next.js route-segment marker that emits the mode-sync effect. Keeping
 * the layout mounted across image/video/audio is what makes the switch
 * feel instant.
 */
export default function StudioImagePage() {
  return <StudioModeSync mode="image" />
}
