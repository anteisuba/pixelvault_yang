import type { Metadata } from 'next'
import { SignIn } from '@clerk/nextjs'
import { getTranslations } from 'next-intl/server'

import { ROUTES } from '@/constants/routes'
import { getPathname, Link } from '@/i18n/navigation'
import type { AppLocale } from '@/i18n/routing'

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

export default async function SignInPage({ params }: SignInPageProps) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'Homepage' })
  const tCommon = await getTranslations({ locale, namespace: 'Common' })
  const signInPath = getPathname({
    locale,
    href: ROUTES.SIGN_IN,
  })
  const signUpPath = getPathname({
    locale,
    href: ROUTES.SIGN_UP,
  })
  const studioPath = getPathname({
    locale,
    href: ROUTES.STUDIO,
  })

  return (
    <div className="flex min-h-svh flex-col items-center bg-background">
      <header className="w-full border-b border-border/60 px-4 py-4">
        <div className="mx-auto max-w-content">
          <Link
            href={ROUTES.HOME}
            className="font-display text-brand font-medium tracking-brand transition-opacity hover:opacity-75"
          >
            {tCommon('brand')}
          </Link>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-12">
        <div className="text-center">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {t('auth.signIn.eyebrow')}
          </p>
          <h1 className="font-display text-2xl font-medium tracking-tight sm:text-3xl">
            {t('auth.signIn.title')}
          </h1>
          <p className="mx-auto mt-2 max-w-md font-serif text-sm leading-relaxed text-muted-foreground">
            {t('auth.signIn.description')}
          </p>
        </div>

        <SignIn
          path={signInPath}
          routing="path"
          signUpUrl={signUpPath}
          fallbackRedirectUrl={studioPath}
          signUpFallbackRedirectUrl={studioPath}
        />

        <p className="max-w-sm text-center font-serif text-xs leading-relaxed text-muted-foreground">
          {t('auth.note')}
        </p>
      </main>
    </div>
  )
}
