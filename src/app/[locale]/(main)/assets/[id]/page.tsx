import { cache } from 'react'
import { auth } from '@clerk/nextjs/server'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { notFound } from 'next/navigation'

import type { AppLocale } from '@/i18n/routing'
import { getGenerationPreviewUrl } from '@/lib/generation-media'
import { getGenerationByIdForUser } from '@/services/generation.service'
import { listProjects } from '@/services/project.service'
import { ensureUser } from '@/services/user.service'

import { AssetDetailContent } from '@/components/business/AssetDetailContent'

/**
 * `/assets/[id]` — standalone detail page for one owned asset. Same body as
 * the `/assets` drawer (`AssetDetailContent`), different shell, so the link
 * is refreshable, shareable and back-navigable.
 *
 * ⚠ 私密素材一律 `notFound()`：403 会泄露「这个 id 存在」。未登录同理。
 */
const loadOwnedGeneration = cache(async (id: string) => {
  const { userId: clerkId } = await auth()
  if (!clerkId) return null
  const user = await ensureUser(clerkId)
  return getGenerationByIdForUser(id, user.id)
})

interface AssetDetailPageProps {
  params: Promise<{ locale: AppLocale; id: string }>
}

export async function generateMetadata({
  params,
}: AssetDetailPageProps): Promise<Metadata> {
  const { id, locale } = await params
  const generation = await loadOwnedGeneration(id)

  if (!generation) {
    return { title: 'Not Found', robots: 'noindex, nofollow' }
  }

  const t = await getTranslations({ locale, namespace: 'AssetsPage' })
  const title = `${generation.model} — ${t('detailTitle')}`

  return {
    title,
    description: generation.prompt || undefined,
    // 私密归档：永远不进索引，OG 封面只给持链接的自己看。
    robots: 'noindex, nofollow',
    openGraph: {
      title,
      images: [{ url: getGenerationPreviewUrl(generation) }],
    },
  }
}

export default async function AssetDetailPage({
  params,
}: AssetDetailPageProps) {
  const { id } = await params
  const generation = await loadOwnedGeneration(id)

  if (!generation) {
    notFound()
  }

  const { userId: clerkId } = await auth()
  const projects = clerkId ? await listProjects(clerkId) : []

  return (
    <AssetDetailContent
      layout="page"
      generation={generation}
      projects={projects}
    />
  )
}
