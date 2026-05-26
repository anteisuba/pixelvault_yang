import type { Metadata } from 'next'
import { SignIn } from '@clerk/nextjs'
import { getTranslations } from 'next-intl/server'

import { ROUTES } from '@/constants/routes'
import { AuthPageShell } from '@/components/business/AuthPageShell'
import { getPathname } from '@/i18n/navigation'
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
    <AuthPageShell
      brandLabel={tCommon('brand')}
      homeHref={ROUTES.HOME}
      panelEyebrow={t('auth.panel.eyebrow')}
      panelTitle={t('auth.panel.title')}
      panelDescription={t('auth.panel.description')}
      panelItems={[
        t('auth.panel.items.generate'),
        t('auth.panel.items.save'),
        t('auth.panel.items.continue'),
      ]}
      eyebrow={t('auth.signIn.eyebrow')}
      title={t('auth.signIn.title')}
      description={t('auth.signIn.description')}
      note={t('auth.note')}
    >
      <SignIn
        path={signInPath}
        routing="path"
        signUpUrl={signUpPath}
        fallbackRedirectUrl={studioPath}
        signUpFallbackRedirectUrl={studioPath}
        appearance={clerkAppearance}
      />
    </AuthPageShell>
  )
}
