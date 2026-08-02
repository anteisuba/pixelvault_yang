import '@/app/auth.css'

import type { Metadata } from 'next'
import { SignUp } from '@clerk/nextjs'
import { getTranslations } from 'next-intl/server'

import { ROUTES } from '@/constants/routes'
import { AuthCard } from '@/components/business/auth/AuthCard'
import { getPathname, Link } from '@/i18n/navigation'
import type { AppLocale } from '@/i18n/routing'
import { clerkAuthAppearance } from '@/lib/clerk-appearance'

interface SignUpPageProps {
  params: Promise<{ locale: AppLocale }>
}

export async function generateMetadata({
  params,
}: SignUpPageProps): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'Metadata' })
  return {
    title: t('signUp.title'),
    description: t('signUp.description'),
    robots: 'noindex, nofollow',
  }
}

/**
 * Kept because Clerk needs a `signUpUrl` to hand off to and because email links
 * point here, not because anything on the site links to it — the one door in
 * the header opens the dialog. Same card as `/sign-in`, so a visitor who lands
 * on either sees one window, not two different pages.
 */
export default async function SignUpPage({ params }: SignUpPageProps) {
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
        <SignUp
          path={signUpPath}
          routing="path"
          signInUrl={signInPath}
          fallbackRedirectUrl={studioPath}
          signInFallbackRedirectUrl={studioPath}
          appearance={clerkAuthAppearance}
        />
      </AuthCard>

      <Link href={ROUTES.HOME} className="auth-page-back">
        {t('backHome')}
      </Link>
    </main>
  )
}
