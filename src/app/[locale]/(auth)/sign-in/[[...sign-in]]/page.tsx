import { SignIn } from '@clerk/nextjs'
import { getTranslations } from 'next-intl/server'

import { HomepageShell } from '@/components/business/HomepageShell'
import { HOMEPAGE_ROUTES } from '@/constants/homepage'
import type { AppLocale } from '@/i18n/routing'

interface SignInPageProps {
  params: Promise<{ locale: AppLocale }>
}

export default async function SignInPage({ params }: SignInPageProps) {
  const { locale } = await params
  const t = await getTranslations({
    locale,
    namespace: 'Homepage',
  })

  return (
    <HomepageShell
      eyebrow={t('auth.signIn.eyebrow')}
      title={t('auth.signIn.title')}
      description={t('auth.signIn.description')}
      primaryActionHref={HOMEPAGE_ROUTES.signUp}
      primaryActionLabel={t('actions.signInPrimary')}
      secondaryActionHref={HOMEPAGE_ROUTES.home}
      secondaryActionLabel={t('actions.authSecondary')}
      utilityActionHref={HOMEPAGE_ROUTES.signUp}
      utilityActionLabel={t('actions.signInPrimary')}
      authPanel={<SignIn />}
    />
  )
}
