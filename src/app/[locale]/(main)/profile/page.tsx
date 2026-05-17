import { auth } from '@clerk/nextjs/server'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { ROUTES, creatorProfilePath } from '@/constants/routes'
import type { AppLocale } from '@/i18n/routing'
import { ensureUser } from '@/services/user.service'

interface ProfileRedirectPageProps {
  params: Promise<{ locale: AppLocale }>
}

export const metadata: Metadata = {
  robots: 'noindex, nofollow',
}

export default async function ProfileRedirectPage({
  params,
}: ProfileRedirectPageProps) {
  const { locale } = await params
  const { userId: clerkId } = await auth()

  if (!clerkId) {
    redirect(`/${locale}${ROUTES.SIGN_IN}`)
  }

  const user = await ensureUser(clerkId)

  if (!user.username) {
    redirect(`/${locale}${ROUTES.ASSETS}`)
  }

  redirect(`/${locale}${creatorProfilePath(user.username)}`)
}
