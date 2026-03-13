import { SignUp } from '@clerk/nextjs'

import { HomepageShell } from '@/components/business/HomepageShell'
import { HOMEPAGE_COPY, HOMEPAGE_ROUTES } from '@/constants/homepage'

export default function SignUpPage() {
  return (
    <HomepageShell
      eyebrow={HOMEPAGE_COPY.signUpEyebrow}
      title={HOMEPAGE_COPY.signUpTitle}
      description={HOMEPAGE_COPY.signUpDescription}
      primaryActionHref={HOMEPAGE_ROUTES.signIn}
      primaryActionLabel={HOMEPAGE_COPY.signUpPrimaryAction}
      secondaryActionHref={HOMEPAGE_ROUTES.home}
      secondaryActionLabel={HOMEPAGE_COPY.authSecondaryAction}
      utilityActionHref={HOMEPAGE_ROUTES.signIn}
      utilityActionLabel={HOMEPAGE_COPY.signUpPrimaryAction}
      authPanel={<SignUp />}
    />
  )
}
