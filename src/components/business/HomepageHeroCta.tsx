'use client'

import { useAuth } from '@clerk/nextjs'
import { ArrowRight } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { HOMEPAGE_ROUTES } from '@/constants/homepage'
import { Link } from '@/i18n/navigation'

/**
 * Primary hero CTA for the marketing homepage.
 *
 * Client island so the static hero can resolve auth-aware routing:
 * signed-in users go straight to Studio, signed-out users start sign-up.
 */
export function HomepageHeroCta() {
  const { isLoaded, isSignedIn } = useAuth()
  const t = useTranslations('Homepage.actions')

  if (!isLoaded) {
    return (
      <span
        className="homepage-hero-cta-placeholder h-12 w-40 rounded-full"
        aria-hidden="true"
      />
    )
  }

  const href = isSignedIn ? HOMEPAGE_ROUTES.studio : HOMEPAGE_ROUTES.signUp

  return (
    <Button
      asChild
      size="lg"
      className="homepage-hero-cta h-12 rounded-full px-7 text-sm font-semibold sm:px-8"
    >
      <Link href={href} className="inline-flex items-center gap-2">
        {t('startCreating')}
        <ArrowRight className="size-4" />
      </Link>
    </Button>
  )
}
