'use client'

import { useAuth } from '@clerk/nextjs'
import { ArrowRight } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { HOMEPAGE_ROUTES } from '@/constants/homepage'
import { AuthModalTrigger } from '@/components/business/AuthModalTrigger'
import { Link } from '@/i18n/navigation'

/**
 * Primary hero CTA for the marketing homepage.
 *
 * Signed-in → Studio. Signed-out → Clerk sign-up modal (stay on homepage).
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

  if (isSignedIn) {
    return (
      <Button
        asChild
        size="lg"
        className="homepage-hero-cta h-12 rounded-full px-7 text-sm font-semibold sm:px-8"
      >
        <Link
          href={HOMEPAGE_ROUTES.studio}
          className="inline-flex items-center gap-2"
        >
          {t('startCreating')}
          <ArrowRight className="size-4" />
        </Link>
      </Button>
    )
  }

  return (
    <AuthModalTrigger intent="sign-up" asChild>
      <Button
        size="lg"
        className="homepage-hero-cta h-12 rounded-full px-7 text-sm font-semibold sm:px-8"
      >
        <span className="inline-flex items-center gap-2">
          {t('startCreating')}
          <ArrowRight className="size-4" />
        </span>
      </Button>
    </AuthModalTrigger>
  )
}
