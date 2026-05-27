import { useTranslations } from 'next-intl'

import {
  HOMEPAGE_FEATURE_SECTIONS,
  HOMEPAGE_ROUTES,
} from '@/constants/homepage'
import { LocaleSwitcher } from '@/components/layout/LocaleSwitcher'
import { Link } from '@/i18n/navigation'

import '@/app/homepage.css'

import { HomepageAuthCta } from './HomepageAuthCta'
import { HomepageBottomCta } from './HomepageBottomCta'
import { HomepageCapabilityMatrix } from './HomepageCapabilityMatrix'
import { HomepageFeatureSection } from './HomepageFeatureSection'
import { HomepageFooter } from './HomepageFooter'
import { HomepageHero } from './HomepageHero'
import { HomepageModelLineup } from './HomepageModelLineup'
import { HomepageRevealMotion } from './HomepageRevealMotion'
import { HomepageShowcaseRail } from './HomepageShowcaseRail'

export function HomepageShell() {
  const t = useTranslations('Homepage')
  const tCommon = useTranslations('Common')

  return (
    <div className="homepage relative">
      <HomepageRevealMotion />
      <a href="#homepage-main" className="homepage-skip-link">
        {t('skipToContent')}
      </a>
      <header className="homepage-header sticky top-0 z-20">
        <div className="homepage-header-inner mx-auto flex min-h-14 max-w-content items-center justify-between gap-3 px-3 py-2 sm:h-16 sm:px-6 sm:py-0 lg:px-8">
          <Link
            href={HOMEPAGE_ROUTES.home}
            className="homepage-brand-link flex min-h-10 min-w-10 items-center justify-center gap-2 sm:min-h-11 sm:min-w-0"
            aria-label={tCommon('brand')}
          >
            <span className="homepage-brand-mark" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
            </span>
            <span className="homepage-brand-wordmark hidden font-display text-base font-semibold sm:inline">
              {tCommon('brand')}
            </span>
          </Link>

          <div className="homepage-header-actions flex min-w-0 shrink items-center justify-end gap-1.5 sm:shrink-0 sm:gap-2">
            <LocaleSwitcher className="homepage-locale-switcher" />

            <HomepageAuthCta />
          </div>
        </div>
      </header>

      <div className="homepage-content-shell mx-auto max-w-content px-4 sm:px-6 lg:px-8">
        <main id="homepage-main" className="homepage-main">
          <HomepageHero />

          <div className="homepage-features-band">
            <div className="homepage-feature-stack">
              {HOMEPAGE_FEATURE_SECTIONS.map((section) => (
                <HomepageFeatureSection
                  key={section.id}
                  id={section.id}
                  ctaHref={section.ctaHref}
                  tone={section.tone}
                  reverse={section.reverse}
                  rhythm={section.rhythm}
                  showEyebrow={section.showEyebrow}
                  showCta={section.showCta}
                  comingSoon={Boolean(
                    'comingSoon' in section && section.comingSoon,
                  )}
                  media={section.media}
                />
              ))}
              <HomepageShowcaseRail />
              <HomepageCapabilityMatrix />
            </div>
          </div>

          <HomepageModelLineup />

          <HomepageBottomCta />

          <HomepageFooter />
        </main>
      </div>
    </div>
  )
}
