import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { EditTaskGrid } from '@/components/business/studio/edit/EditTaskGrid'
import type { AppLocale } from '@/i18n/routing'

interface StudioEditPageProps {
  params: Promise<{ locale: AppLocale }>
}

export async function generateMetadata({
  params,
}: StudioEditPageProps): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'Metadata' })
  return {
    title: t('studio.edit.title'),
    description: t('studio.edit.description'),
    robots: 'noindex, nofollow',
  }
}

/** Overview = source card (from layout) + 8-task grid below. */
export default function StudioEditPage() {
  return <EditTaskGrid />
}
