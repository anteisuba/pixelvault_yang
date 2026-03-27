import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { getTranslations } from 'next-intl/server'

import { getCreatorProfile, getUserByClerkId } from '@/services/user.service'
import { CreatorProfileView } from '@/components/business/CreatorProfileView'
import { PrivateProfileView } from '@/components/business/PrivateProfileView'
import type { AppLocale } from '@/i18n/routing'

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

  // OG image: use latest creation if available, else avatar
  const ogImage = profile.generations[0]?.url ?? profile.avatarUrl ?? undefined

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://pixelvault.app'

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${appUrl}/${locale}/u/${username}`,
      type: 'profile',
      images: ogImage ? [{ url: ogImage, width: 1200, height: 630 }] : [],
    },
    twitter: {
      card: ogImage ? 'summary_large_image' : 'summary',
      title,
      description,
      images: ogImage ? [ogImage] : [],
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
