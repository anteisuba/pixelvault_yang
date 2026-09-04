'use client'

import { useEffect } from 'react'
import { useTranslations } from 'next-intl'

import { PRIVACY_CONSENT_UNKNOWN } from '@/constants/privacy-consent'
import { ROUTES } from '@/constants/routes'
import { usePrivacyConsent } from '@/hooks/use-privacy-consent'
import { Link } from '@/i18n/navigation'
import { enableSessionReplay } from '@/lib/sentry-session-replay'
import { Button } from '@/components/ui/button'

/**
 * Bottom-anchored privacy notice. Mounted once in `[locale]/layout.tsx` so it
 * covers every route, marketing and app alike.
 *
 * It renders only while the decision is missing, and it is also the place that
 * turns Sentry Session Replay on: the effect below fires both for a fresh
 * "accept" click and for a returning visitor who accepted earlier, so consent
 * takes effect on the same page load in both cases.
 *
 * No animation on purpose — nothing to gate behind `prefers-reduced-motion`,
 * and a consent prompt should be readable the instant it appears.
 */
export function PrivacyConsentBanner() {
  const t = useTranslations('PrivacyConsent')
  const { status, accept, reject } = usePrivacyConsent()

  useEffect(() => {
    if (status === 'accepted') {
      void enableSessionReplay()
    }
  }, [status])

  if (status !== PRIVACY_CONSENT_UNKNOWN) {
    return null
  }

  return (
    <div
      role="region"
      aria-label={t('label')}
      aria-live="polite"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/95 backdrop-blur"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-6">
        <p className="text-sm text-muted-foreground text-pretty">
          {t('body')}{' '}
          <Link
            href={ROUTES.PRIVACY}
            className="font-medium text-foreground underline underline-offset-4"
          >
            {t('policyLink')}
          </Link>
        </p>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={reject}>
            {t('rejectAction')}
          </Button>
          <Button size="sm" onClick={accept}>
            {t('acceptAction')}
          </Button>
        </div>
      </div>
    </div>
  )
}
