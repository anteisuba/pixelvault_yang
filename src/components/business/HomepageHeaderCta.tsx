'use client'

import { useAuth } from '@clerk/nextjs'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { HOMEPAGE_ROUTES } from '@/constants/homepage'
import { AuthModalTrigger } from '@/components/business/AuthModalTrigger'
import { Link } from '@/i18n/navigation'

/**
 * Persistent header CTA for the marketing homepage.
 * Signed-in → Studio. Signed-out → Clerk sign-up modal.
 */
export function HomepageHeaderCta() {
  const { isLoaded, isSignedIn } = useAuth()
  const t = useTranslations('Homepage.actions')

  if (!isLoaded) {
    return (
      <span
        className="homepage-header-cta-placeholder h-9 w-28 rounded-full"
        aria-hidden="true"
      />
    )
  }

  if (isSignedIn) {
    return (
      <Button
        asChild
        size="sm"
        className="homepage-header-cta h-9 whitespace-nowrap rounded-full px-4 text-sm font-semibold"
      >
        <Link href={HOMEPAGE_ROUTES.studio}>{t('startCreating')}</Link>
      </Button>
    )
  }

  return (
    <AuthModalTrigger intent="sign-up" asChild>
      <Button
        size="sm"
        className="homepage-header-cta h-9 whitespace-nowrap rounded-full px-4 text-sm font-semibold"
      >
        {t('startCreating')}
      </Button>
    </AuthModalTrigger>
  )
}
