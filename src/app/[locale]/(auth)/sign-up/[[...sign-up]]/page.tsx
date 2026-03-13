import { SignUp } from '@clerk/nextjs'
import { getTranslations } from 'next-intl/server'

import { HomepageShell } from '@/components/business/HomepageShell'
import { HOMEPAGE_ROUTES } from '@/constants/homepage'
import type { AppLocale } from '@/i18n/routing'

interface SignUpPageProps {
  params: Promise<{ locale: AppLocale }>
}

export default async function SignUpPage({ params }: SignUpPageProps) {
  const { locale } = await params
  const t = await getTranslations({
    locale,
    namespace: 'Homepage',
  })

  return (
    <HomepageShell
      eyebrow={t('auth.signUp.eyebrow')}
      title={t('auth.signUp.title')}
      description={t('auth.signUp.description')}
      primaryActionHref={HOMEPAGE_ROUTES.signIn}
      primaryActionLabel={t('actions.signUpPrimary')}
      secondaryActionHref={HOMEPAGE_ROUTES.home}
      secondaryActionLabel={t('actions.authSecondary')}
      utilityActionHref={HOMEPAGE_ROUTES.signIn}
      utilityActionLabel={t('actions.signUpPrimary')}
      authPanel={<SignUp />}
    />
  )
}
