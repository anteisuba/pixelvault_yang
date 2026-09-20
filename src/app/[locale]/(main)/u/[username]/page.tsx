import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { getTranslations } from 'next-intl/server'

import { getAppOrigin } from '@/constants/config'
import { creatorProfilePath } from '@/constants/routes'
import { getCreatorProfile, getUserByClerkId } from '@/services/user.service'
import { CreatorProfileView } from '@/components/business/CreatorProfileView'
import { PrivateProfileView } from '@/components/business/PrivateProfileView'
import type { AppLocale } from '@/i18n/routing'
import { pageAddress } from '@/lib/page-address'

interface CreatorProfilePageProps {
  params: Promise<{ locale: AppLocale; username: string }>
}

export async function generateMetadata({
  params,
}: CreatorProfilePageProps): Promise<Metadata> {
  const { locale, username } = await params
  const t = await getTranslations({ locale, namespace: 'CreatorProfile' })

  const profile = await getCreatorProfile(username, null, 1, 1)

  if (!profile) {
    return { title: t('notFound') }
  }

  if ('private' in profile) {
    const displayName = profile.displayName ?? profile.username
    return { title: `${displayName} — ${t('metaTitle')}` }
  }

  const displayName = profile.displayName ?? profile.username
  const title = `${displayName} — ${t('metaTitle')}`
  const description = profile.bio ?? t('metaDescription', { name: displayName })

  const ogImageUrl = `${getAppOrigin()}/api/og?type=profile&username=${encodeURIComponent(username)}`
  // ⚠ canonical 用规范化后的 `creatorProfilePath(username)`，不是地址栏里那个
  // 原样的 `username` —— 大小写或转义不同的两条链接因此归到同一个正本。
  const address = pageAddress({
    locale,
    path: creatorProfilePath(profile.username),
  })

  return {
    title,
    description,
    alternates: address.alternates,
    openGraph: {
      ...address.openGraph,
      title,
      description,
      type: 'profile',
      images: [{ url: ogImageUrl, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImageUrl],
    },
  }
}

export default async function CreatorProfilePage({
  params,
}: CreatorProfilePageProps) {
  const { username } = await params

  // Get viewer's DB user ID if authenticated
  let viewerUserId: string | null = null
  const { userId: clerkId } = await auth()
  if (clerkId) {
    const viewer = await getUserByClerkId(clerkId)
    viewerUserId = viewer?.id ?? null
  }

  const profile = await getCreatorProfile(username, viewerUserId)

  if (!profile) {
    notFound()
  }

  if ('private' in profile) {
    return (
      <PrivateProfileView
        username={profile.username}
        displayName={profile.displayName}
        avatarUrl={profile.avatarUrl}
      />
    )
  }

  return <CreatorProfileView username={username} initialData={profile} />
}
