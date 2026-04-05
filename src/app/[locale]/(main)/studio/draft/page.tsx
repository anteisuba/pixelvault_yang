import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { StudioWorkbenchDraft } from '@/components/business/studio/StudioWorkbenchDraft'
import type { AppLocale } from '@/i18n/routing'

interface StudioDraftPageProps {
  params: Promise<{ locale: AppLocale }>
}

export async function generateMetadata({
  params,
}: StudioDraftPageProps): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'Metadata' })

  return {
    title: t('studioDraft.title'),
    description: t('studioDraft.description'),
  }
}

export default function StudioDraftPage() {
  return <StudioWorkbenchDraft />
}
