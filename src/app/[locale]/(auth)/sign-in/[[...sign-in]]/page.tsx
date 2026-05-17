import type { Metadata } from 'next'
import { SignIn } from '@clerk/nextjs'
import { getTranslations } from 'next-intl/server'

import { ROUTES } from '@/constants/routes'
import { BrandMark } from '@/components/ui/brand-mark'
import { getPathname, Link } from '@/i18n/navigation'
import type { AppLocale } from '@/i18n/routing'
import { clerkAppearance } from '@/lib/clerk-appearance'

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
    href: ROUTES.STUDIO_IMAGE,
  })

  return (
    <div className="flex min-h-svh flex-col items-center bg-white">
      <header className="w-full border-b border-border/60 px-4 py-4">
        <div className="mx-auto flex max-w-content items-center">
          <Link
            href={ROUTES.HOME}
            className="flex items-center gap-2 transition-opacity hover:opacity-75"
            aria-label={tCommon('brand')}
          >
            <BrandMark />
            <span className="sr-only">{tCommon('brand')}</span>
          </Link>
        </div>
      </header>

      <main className="flex w-full flex-1 flex-col items-center justify-center gap-8 px-4 py-12">
        <div className="text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {t('auth.signIn.eyebrow')}
          </p>
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            {t('auth.signIn.title')}
          </h1>
          <p className="mx-auto mt-3 max-w-md font-display text-sm leading-relaxed text-muted-foreground">
            {t('auth.signIn.description')}
          </p>
        </div>

        <SignIn
          path={signInPath}
          routing="path"
          signUpUrl={signUpPath}
          fallbackRedirectUrl={studioPath}
          signUpFallbackRedirectUrl={studioPath}
          appearance={clerkAppearance}
        />

        <p className="max-w-sm text-center font-display text-xs leading-relaxed text-muted-foreground">
          {t('auth.note')}
        </p>
      </main>
    </div>
  )
}
