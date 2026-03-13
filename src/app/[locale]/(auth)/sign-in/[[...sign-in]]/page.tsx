import { SignIn } from '@clerk/nextjs'

import { HomepageShell } from '@/components/business/HomepageShell'
import { HOMEPAGE_COPY, HOMEPAGE_ROUTES } from '@/constants/homepage'

export default function SignInPage() {
  return (
    <HomepageShell
      eyebrow={HOMEPAGE_COPY.signInEyebrow}
      title={HOMEPAGE_COPY.signInTitle}
      description={HOMEPAGE_COPY.signInDescription}
      primaryActionHref={HOMEPAGE_ROUTES.signUp}
      primaryActionLabel={HOMEPAGE_COPY.signInPrimaryAction}
      secondaryActionHref={HOMEPAGE_ROUTES.home}
      secondaryActionLabel={HOMEPAGE_COPY.authSecondaryAction}
      utilityActionHref={HOMEPAGE_ROUTES.signUp}
      utilityActionLabel={HOMEPAGE_COPY.signInPrimaryAction}
      authPanel={<SignIn />}
    />
  )
}
