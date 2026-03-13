import { auth } from '@clerk/nextjs/server'
import { getTranslations } from 'next-intl/server'

import { HomepageShell } from '@/components/business/HomepageShell'
import { HOMEPAGE_ROUTES } from '@/constants/homepage'
import type { AppLocale } from '@/i18n/routing'

interface LocalizedRootPageProps {
  params: Promise<{ locale: AppLocale }>
}

export default async function LocalizedRootPage({
  params,
}: LocalizedRootPageProps) {
  const { userId } = await auth()
  const { locale } = await params
  const t = await getTranslations({
    locale,
    namespace: 'Homepage',
  })

  const primaryActionHref = userId
    ? HOMEPAGE_ROUTES.studio
    : HOMEPAGE_ROUTES.signUp
  const primaryActionLabel = userId
    ? t('actions.signedInPrimary')
    : t('actions.signedOutPrimary')
  const utilityActionHref = userId
    ? HOMEPAGE_ROUTES.studio
    : HOMEPAGE_ROUTES.signIn
  const utilityActionLabel = userId
    ? t('actions.signedInUtility')
    : t('actions.signedOutUtility')

  return (
    <HomepageShell
      eyebrow={t('heroEyebrow')}
      title={t('heroTitle')}
      description={t('heroDescription')}
      primaryActionHref={primaryActionHref}
      primaryActionLabel={primaryActionLabel}
      secondaryActionHref={HOMEPAGE_ROUTES.models}
      secondaryActionLabel={t('actions.sharedSecondary')}
      utilityActionHref={utilityActionHref}
      utilityActionLabel={utilityActionLabel}
    />
  )
}
