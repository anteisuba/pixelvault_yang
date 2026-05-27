import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { HOMEPAGE_ROUTES } from '@/constants/homepage'
import { Link } from '@/i18n/navigation'

type Variant = 'nav-utility' | 'nav-register'

const BUTTON_CLASSES: Record<Variant, string> = {
  'nav-utility':
    'homepage-nav-login h-11 rounded-full px-3 text-xs font-medium sm:px-4 sm:text-sm md:px-5',
  'nav-register':
    'homepage-nav-register h-11 rounded-full px-3 text-xs font-semibold sm:px-4 sm:text-sm md:px-5',
}

const VARIANT_CONFIG: Record<
  Variant,
  {
    signedOutHref: string
    signedOutLabelKey: string
  }
> = {
  'nav-utility': {
    signedOutHref: HOMEPAGE_ROUTES.signIn,
    signedOutLabelKey: 'actions.signedOutUtility',
  },
  'nav-register': {
    signedOutHref: HOMEPAGE_ROUTES.signUp,
    signedOutLabelKey: 'actions.signedOutPrimary',
  },
}

interface HomepageAuthCtaProps {
  variant: Variant
}

/**
 * Client-side CTA for the marketing homepage.
 *
 * The homepage is statically generated, so the nav keeps stable public
 * authentication entry points instead of swapping after Clerk hydration.
 */
export function HomepageAuthCta({ variant }: HomepageAuthCtaProps) {
  const t = useTranslations('Homepage')
  const config = VARIANT_CONFIG[variant]
  const label = t(config.signedOutLabelKey)

  return (
    <Button asChild className={BUTTON_CLASSES[variant]}>
      <Link href={config.signedOutHref}>{label}</Link>
    </Button>
  )
}
