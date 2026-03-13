import { auth } from '@clerk/nextjs/server'

import { HomepageShell } from '@/components/business/HomepageShell'
import { HOMEPAGE_COPY, HOMEPAGE_ROUTES } from '@/constants/homepage'

export default async function RootPage() {
  const { userId } = await auth()

  const primaryActionHref = userId
    ? HOMEPAGE_ROUTES.studio
    : HOMEPAGE_ROUTES.signUp
  const primaryActionLabel = userId
    ? HOMEPAGE_COPY.signedInPrimaryAction
    : HOMEPAGE_COPY.signedOutPrimaryAction
  const utilityActionHref = userId
    ? HOMEPAGE_ROUTES.studio
    : HOMEPAGE_ROUTES.signIn
  const utilityActionLabel = userId
    ? HOMEPAGE_COPY.signedInUtilityAction
    : HOMEPAGE_COPY.signedOutUtilityAction

  return (
    <HomepageShell
      eyebrow={HOMEPAGE_COPY.heroEyebrow}
      title={HOMEPAGE_COPY.heroTitle}
      description={HOMEPAGE_COPY.heroDescription}
      primaryActionHref={primaryActionHref}
      primaryActionLabel={primaryActionLabel}
      secondaryActionHref={HOMEPAGE_ROUTES.models}
      secondaryActionLabel={HOMEPAGE_COPY.sharedSecondaryAction}
      utilityActionHref={utilityActionHref}
      utilityActionLabel={utilityActionLabel}
    />
  )
}
