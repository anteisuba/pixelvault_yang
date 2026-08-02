import '@/app/auth.css'

import type { Metadata } from 'next'
import { SignIn } from '@clerk/nextjs'
import { getTranslations } from 'next-intl/server'

import { ROUTES } from '@/constants/routes'
import { AuthCard } from '@/components/business/auth/AuthCard'
import { getPathname, Link } from '@/i18n/navigation'
import type { AppLocale } from '@/i18n/routing'
import { clerkAuthAppearance } from '@/lib/clerk-appearance'

interface SignInPageProps {
  params: Promise<{ locale: AppLocale }>
}

export async function generateMetadata({
  params,
}: SignInPageProps): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'Metadata' })
  return {
    title: t('signIn.title'),
    description: t('signIn.description'),
    robots: 'noindex, nofollow',
  }
}

/**
 * The path carrier for the same window the marketing header opens in place.
 *
 * Nobody should arrive here by clicking anything: every visible auth action
 * opens the dialog. This route exists for the paths that cannot be a dialog —
 * OAuth returns, middleware redirects, and links in email — so it renders the
 * identical card rather than the two-column marketing page it used to be
 * (docs/references/pages/home.md §A8).
 *
 * `withSignUp` matches the dialog: one door, and Clerk works out whether the
 * address it is given is new.
 */
export default async function SignInPage({ params }: SignInPageProps) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'Auth' })
  const tCommon = await getTranslations({ locale, namespace: 'Common' })
  const signInPath = getPathname({ locale, href: ROUTES.SIGN_IN })
  const signUpPath = getPathname({ locale, href: ROUTES.SIGN_UP })
  const studioPath = getPathname({ locale, href: ROUTES.STUDIO_IMAGE })

  return (
    <main className="auth-surface auth-page">
      <AuthCard
        title={
          <h1 className="auth-title">
            {t('title', { brand: tCommon('brand') })}
          </h1>
        }
        description={<p className="auth-subtitle">{t('subtitle')}</p>}
      >
        <SignIn
          path={signInPath}
          routing="path"
          withSignUp
          signUpUrl={signUpPath}
          fallbackRedirectUrl={studioPath}
          signUpFallbackRedirectUrl={studioPath}
          appearance={clerkAuthAppearance}
        />
      </AuthCard>

      <Link href={ROUTES.HOME} className="auth-page-back">
        {t('backHome')}
      </Link>
    </main>
  )
}
