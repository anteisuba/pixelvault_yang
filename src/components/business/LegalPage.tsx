import { ArrowLeft } from 'lucide-react'
import { useTranslations } from 'next-intl'

import '@/app/legal.css'

import type { LegalDoc, LegalSection } from '@/constants/legal'
import { ROUTES } from '@/constants/routes'
import { Link } from '@/i18n/navigation'

interface LegalPageProps {
  doc: LegalDoc
}

/**
 * Renders a legal document (privacy / terms) in the ivory "white hall" surface.
 * Title, intro and the `sections` array come from the `Legal` i18n namespace so
 * all copy stays in `src/messages/*`. Server component — no client state.
 */
export function LegalPage({ doc }: LegalPageProps) {
  const t = useTranslations('Legal')
  const tCommon = useTranslations('Common')
  const sections = t.raw(`${doc}.sections`) as LegalSection[]

  return (
    <div className="legal-page">
      <header className="legal-header sticky top-0 z-20">
        <div className="mx-auto flex min-h-14 max-w-3xl items-center justify-between gap-3 px-4 sm:h-16 sm:px-6">
          <Link
            href={ROUTES.HOME}
            className="font-display text-base font-semibold tracking-[0.08em]"
            aria-label={tCommon('brand')}
          >
            {tCommon('brand')}
          </Link>
          <Link
            href={ROUTES.HOME}
            className="legal-back-link inline-flex min-h-11 items-center gap-1.5 text-sm font-medium"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            {t('backHome')}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-24 pt-12 sm:px-6 sm:pt-16">
        <h1 className="legal-title text-foreground text-balance">
          {t(`${doc}.title`)}
        </h1>
        <p className="legal-updated mt-4">
          {t('updatedLabel')} · {t(`${doc}.updated`)}
        </p>
        <p className="legal-intro mt-8 text-pretty">{t(`${doc}.intro`)}</p>

        <div className="mt-12 flex flex-col gap-10">
          {sections.map((section, index) => (
            <section key={index} className="legal-section pt-10">
              <h2 className="legal-section-heading text-foreground">
                {section.heading}
              </h2>
              <p className="legal-section-body mt-4 text-pretty">
                {section.body}
              </p>
            </section>
          ))}
        </div>
      </main>
    </div>
  )
}
