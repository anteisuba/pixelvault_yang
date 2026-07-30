import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import SignInPage, {
  generateMetadata as generateSignInMetadata,
} from '../(auth)/sign-in/[[...sign-in]]/page'
import SignUpPage, {
  generateMetadata as generateSignUpMetadata,
} from '../(auth)/sign-up/[[...sign-up]]/page'
import type { AppLocale } from '@/i18n/routing'

interface LocaleCatchAllProps {
  params: Promise<{
    locale: AppLocale
    rest: string[]
  }>
}

function authPageParams(locale: AppLocale) {
  return Promise.resolve({ locale })
}

export async function generateMetadata({
  params,
}: LocaleCatchAllProps): Promise<Metadata> {
  const { locale, rest } = await params

  if (rest[0] === 'sign-in') {
    return generateSignInMetadata({ params: authPageParams(locale) })
  }

  if (rest[0] === 'sign-up') {
    return generateSignUpMetadata({ params: authPageParams(locale) })
  }

  return {}
}

/**
 * Catch-all that renders the localized not-found boundary
 * (`[locale]/not-found.tsx`) for any unmatched path under a locale. Without
 * this, Next.js falls back to its framework-default 404 instead of the branded
 * white-hall page.
 *
 * Next 16 currently lets this required catch-all shadow sibling optional
 * catch-all auth routes. Delegate the two reserved auth prefixes explicitly so
 * Clerk can own both the entry pages and their nested path-routing flows.
 */
export default async function LocaleCatchAll({ params }: LocaleCatchAllProps) {
  const { locale, rest } = await params
  const authParams = authPageParams(locale)

  if (rest[0] === 'sign-in') {
    return SignInPage({ params: authParams })
  }

  if (rest[0] === 'sign-up') {
    return SignUpPage({ params: authParams })
  }

  notFound()
}
