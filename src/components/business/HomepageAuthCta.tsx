'use client'

import { useUser } from '@clerk/nextjs'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { HOMEPAGE_ROUTES } from '@/constants/homepage'
import { Link } from '@/i18n/navigation'

type Variant = 'nav-utility' | 'nav-register'

const BUTTON_CLASSES: Record<Variant, string> = {
  'nav-utility':
    'homepage-nav-login h-10 rounded-full px-3 text-xs font-medium sm:px-4 sm:text-sm md:h-11 md:px-5',
  'nav-register':
    'homepage-nav-register h-10 rounded-full px-3 text-xs font-semibold sm:px-4 sm:text-sm md:h-11 md:px-5',
}

const VARIANT_CONFIG: Record<
  Variant,
  {
    signedInHref: string
    signedOutHref: string
    signedInLabelKey: string
    signedOutLabelKey: string
  }
> = {
  'nav-utility': {
    signedInHref: HOMEPAGE_ROUTES.studio,
    signedOutHref: HOMEPAGE_ROUTES.signIn,
    signedInLabelKey: 'actions.signedInUtility',
    signedOutLabelKey: 'actions.signedOutUtility',
  },
  'nav-register': {
    signedInHref: HOMEPAGE_ROUTES.studio,
    signedOutHref: HOMEPAGE_ROUTES.signUp,
    signedInLabelKey: 'actions.signedInUtility',
    signedOutLabelKey: 'actions.signedOutPrimary',
  },
}

interface HomepageAuthCtaProps {
  variant: Variant
}

/**
 * Client-side auth-aware CTA for the marketing homepage.
 *
 * The homepage is statically generated (no `auth()` call on the server) so it
 * can be cached at the edge for non-US visitors. The auth-dependent CTA label
 * + href flip on the client after Clerk hydrates. Pre-hydration we render the
 * signed-out variant; if a logged-in user clicks during that brief window,
 * Clerk redirects them back into the app.
 */
export function HomepageAuthCta({ variant }: HomepageAuthCtaProps) {
  const t = useTranslations('Homepage')
  const { isLoaded, isSignedIn } = useUser()
  const signedIn = isLoaded ? !!isSignedIn : false

  if (variant === 'nav-register' && signedIn) {
    return null
  }

  const config = VARIANT_CONFIG[variant]
  const href = signedIn ? config.signedInHref : config.signedOutHref
  const label = t(signedIn ? config.signedInLabelKey : config.signedOutLabelKey)

  return (
    <Button asChild className={BUTTON_CLASSES[variant]}>
      <Link href={href}>{label}</Link>
    </Button>
  )
}
