import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { StudioNodeWorkbench } from '@/components/business/studio/node/StudioNodeWorkbench'
import type { AppLocale } from '@/i18n/routing'

interface StudioNodePageProps {
  params: Promise<{ locale: AppLocale }>
}

export async function generateMetadata({
  params,
}: StudioNodePageProps): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'Metadata' })
  return {
    title: t('studio.node.title'),
    description: t('studio.node.description'),
    robots: 'noindex, nofollow',
  }
}

export default function StudioNodePage() {
  return <StudioNodeWorkbench />
}
