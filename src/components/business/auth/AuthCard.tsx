import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'

import { ROUTES } from '@/constants/routes'
import { Link } from '@/i18n/navigation'
import { BrandMark } from '@/components/ui/brand-mark'

interface AuthCardProps {
  /**
   * The heading and its subtitle, already wrapped by the carrier: the modal has
   * to pass Radix's `DialogTitle`/`DialogDescription` for the dialog to be
   * announced correctly, while the path page passes a real `h1`. Everything
   * else about the card is identical, which is the point.
   */
  title: ReactNode
  description: ReactNode
  children: ReactNode
}

/**
 * The auth window. One card, rendered the same whether it was opened in place
 * over a marketing page or reached at `/sign-in` (docs/references/pages/home.md
 * §A8).
 *
 * Everything above and below the Clerk widget is ours: Clerk's own header and
 * footer are hidden by `clerkAuthAppearance`, so the brand lockup, the single
 * heading and the terms line all come from `src/messages/*.json`.
 */
export function AuthCard({ title, description, children }: AuthCardProps) {
  const t = useTranslations('Auth')
  const tCommon = useTranslations('Common')

  return (
    <div className="auth-card">
      <p className="auth-brand">
        <BrandMark className="auth-brand-mark" />
        {tCommon('brand')}
      </p>

      {title}
      {description}

      <div className="auth-body">{children}</div>

      <p className="auth-terms">
        {/* New tab, not in place. Read in the same tab, these links tear down
            the window mid-flow: a half-typed address, or worse a pending
            verification code, is gone by the time the reader comes back. */}
        {t.rich('terms', {
          terms: (chunks) => (
            <Link href={ROUTES.TERMS} target="_blank" rel="noreferrer">
              {chunks}
            </Link>
          ),
          privacy: (chunks) => (
            <Link href={ROUTES.PRIVACY} target="_blank" rel="noreferrer">
              {chunks}
            </Link>
          ),
        })}
      </p>
    </div>
  )
}
