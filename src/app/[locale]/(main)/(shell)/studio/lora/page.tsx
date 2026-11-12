import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { LoraWorkbench } from '@/features/lora'
import type { AppLocale } from '@/i18n/routing'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: AppLocale }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'Metadata' })
  return { title: t('studio.lora.title'), robots: 'noindex, nofollow' }
}

export default function StudioLoraPage() {
  return <LoraWorkbench />
}
