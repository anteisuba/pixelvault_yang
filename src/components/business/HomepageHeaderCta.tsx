'use client'

import { useAuth } from '@clerk/nextjs'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { HOMEPAGE_ROUTES } from '@/constants/homepage'
import { Link } from '@/i18n/navigation'

/**
 * Persistent header CTA for the marketing homepage. Auth-aware like the hero
 * CTA (signed-in → Studio, signed-out → sign-up). Its colors auto-reverse with
 * the header state via the header's local --foreground/--background, so it
 * reads as a light pill over the dark hero and a dark pill over the ivory page.
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

  const href = isSignedIn ? HOMEPAGE_ROUTES.studio : HOMEPAGE_ROUTES.signUp

  return (
    <Button
      asChild
      size="sm"
      className="homepage-header-cta h-9 whitespace-nowrap rounded-full px-4 text-sm font-semibold"
    >
      <Link href={href}>{t('startCreating')}</Link>
    </Button>
  )
}
