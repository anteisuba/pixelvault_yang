import { auth } from '@clerk/nextjs/server'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { PAGINATION } from '@/constants/config'
import { Studio3DWorkspace } from '@/features/studio'
import { getPublicGenerationPage } from '@/services/generation.service'
import { ensureUser } from '@/services/user.service'
import type { AppLocale } from '@/i18n/routing'

interface Studio3DPageProps {
  params: Promise<{ locale: AppLocale }>
}

export async function generateMetadata({
  params,
}: Studio3DPageProps): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'Model3DGenerate' })
  const tMeta = await getTranslations({ locale, namespace: 'Metadata' })
  return {
    // 和其他台同一种标题（「3D 台 — ANTEI」），⛔ 只写页内大标题那句。
    title: tMeta('studio.model3d.title'),
    description: t('description'),
    robots: 'noindex, nofollow',
  }
}

export default async function Studio3DPage() {
  const { userId: clerkId } = await auth()
  if (!clerkId) {
    return (
      <Studio3DWorkspace
        initialGenerations={[]}
        initialTotal={0}
        initialHasMore={false}
      />
    )
  }

  const user = await ensureUser(clerkId)

  // Pre-fetch the user's images so the inline asset picker is populated on first
  // paint. Lock to type='image' so 3D source can only ever be an image.
  const initialPage = await getPublicGenerationPage({
    page: PAGINATION.DEFAULT_PAGE,
    limit: PAGINATION.DEFAULT_LIMIT,
    type: ['image'],
    sort: 'newest',
    userId: user.id,
  })
  const total = initialPage.total ?? initialPage.generations.length

  return (
    <Studio3DWorkspace
      initialGenerations={initialPage.generations}
      initialTotal={total}
      initialHasMore={initialPage.hasMore}
      initialNextCursor={initialPage.nextCursor}
    />
  )
}
