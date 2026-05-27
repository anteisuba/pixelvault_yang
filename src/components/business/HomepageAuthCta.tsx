'use client'

import { useAuth } from '@clerk/nextjs'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { HOMEPAGE_ROUTES } from '@/constants/homepage'
import { Link } from '@/i18n/navigation'

/**
 * Client-side CTA for the marketing homepage.
 *
 * The homepage is statically generated, but auth actions should not invite
 * signed-in users back into Clerk's sign-up redirect flow.
 */
export function HomepageAuthCta() {
  const { isLoaded, isSignedIn } = useAuth()
  const t = useTranslations('Homepage')
  const tNavLinks = useTranslations('Navbar.links')

  if (!isLoaded) {
    return (
      <div
        className="homepage-auth-actions flex min-h-10 items-center gap-1 sm:min-h-11 sm:gap-2"
        aria-hidden="true"
      >
        <span className="homepage-auth-placeholder h-10 w-11 rounded-full sm:h-11 sm:w-16" />
        <span className="homepage-auth-placeholder h-10 w-20 rounded-full sm:h-11" />
      </div>
    )
  }

  if (isSignedIn) {
    return (
      <div className="homepage-auth-actions flex min-h-10 items-center sm:min-h-11">
        <Button
          asChild
          className="homepage-nav-workspace h-10 rounded-full px-3 text-xs font-semibold sm:h-11 sm:px-5 sm:text-sm"
        >
          <Link href={HOMEPAGE_ROUTES.studio}>{tNavLinks('studio')}</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="homepage-auth-actions flex min-h-10 items-center gap-1 sm:min-h-11 sm:gap-2">
      <Button
        asChild
        className="homepage-nav-login h-10 rounded-full px-2 text-xs font-medium sm:h-11 sm:px-4 sm:text-sm md:px-5"
      >
        <Link href={HOMEPAGE_ROUTES.signIn}>
          {t('actions.signedOutUtility')}
        </Link>
      </Button>
      <Button
        asChild
        className="homepage-nav-register h-10 rounded-full px-3 text-xs font-semibold sm:h-11 sm:px-4 sm:text-sm md:px-5"
      >
        <Link href={HOMEPAGE_ROUTES.signUp}>
          {t('actions.signedOutPrimary')}
        </Link>
      </Button>
    </div>
  )
}
