'use client'

import { useUser } from '@clerk/nextjs'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { HOMEPAGE_ROUTES } from '@/constants/homepage'
import { Link } from '@/i18n/navigation'

type Variant = 'hero' | 'nav-utility'

const BUTTON_CLASSES: Record<Variant, string> = {
  hero: 'homepage-primary-btn mt-9 h-14 rounded-full px-8 text-base font-semibold',
  'nav-utility':
    'homepage-nav-login h-10 rounded-full px-5 text-sm font-medium',
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
  hero: {
    signedInHref: HOMEPAGE_ROUTES.studio,
    signedOutHref: HOMEPAGE_ROUTES.signUp,
    signedInLabelKey: 'actions.signedInPrimary',
    signedOutLabelKey: 'actions.signedOutPrimary',
  },
  'nav-utility': {
    signedInHref: HOMEPAGE_ROUTES.studio,
    signedOutHref: HOMEPAGE_ROUTES.signIn,
    signedInLabelKey: 'actions.signedInUtility',
    signedOutLabelKey: 'actions.signedOutUtility',
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
 * signed-out variant — the worst-case flash is a logged-in visitor briefly
 * seeing "Get Started" before it swaps to "Open Studio" (~100ms). Clicking
 * during that window still works because /sign-up already handles signed-in
 * users via Clerk.
 */
export function HomepageAuthCta({ variant }: HomepageAuthCtaProps) {
  const t = useTranslations('Homepage')
  const { isLoaded, isSignedIn } = useUser()
  const signedIn = isLoaded ? !!isSignedIn : false

  const config = VARIANT_CONFIG[variant]
  const href = signedIn ? config.signedInHref : config.signedOutHref
  const label = t(signedIn ? config.signedInLabelKey : config.signedOutLabelKey)

  return (
    <Button
      asChild
      size={variant === 'hero' ? 'lg' : undefined}
      className={BUTTON_CLASSES[variant]}
    >
      <Link href={href}>{label}</Link>
    </Button>
  )
}
