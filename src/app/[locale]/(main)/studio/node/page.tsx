import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { NodeWorkbenchV4 } from '@/components/business/node/workbench-v4/NodeWorkbenchV4'
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
  return <NodeWorkbenchV4 />
}
