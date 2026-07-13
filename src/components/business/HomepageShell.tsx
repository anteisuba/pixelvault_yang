import { useTranslations } from 'next-intl'

import {
  HOMEPAGE_FEATURE_SECTIONS,
  HOMEPAGE_ROUTES,
} from '@/constants/homepage'
import { Link } from '@/i18n/navigation'

import '@/app/homepage.css'

import { HomepageBottomCta } from './HomepageBottomCta'
import { HomepageCapabilityMatrix } from './HomepageCapabilityMatrix'
import { HomepageFeatureSection } from './HomepageFeatureSection'
import { HomepageFooter } from './HomepageFooter'
import { HomepageHeaderCta } from './HomepageHeaderCta'
import { HomepageHeaderMotion } from './HomepageHeaderMotion'
import { HomepageHero } from './HomepageHero'
import { HomepageMenu } from './HomepageMenu'
import { HomepageModelLineup } from './HomepageModelLineup'
import { HomepageRevealMotion } from './HomepageRevealMotion'

export function HomepageShell() {
  const t = useTranslations('Homepage')
  const tCommon = useTranslations('Common')
  const tNavbar = useTranslations('Navbar')

  return (
    <div className="homepage relative">
      <HomepageRevealMotion />
      <HomepageHeaderMotion />
      <a href="#homepage-main" className="homepage-skip-link">
        {t('skipToContent')}
      </a>
      <header className="homepage-header sticky top-0 z-20">
        <div className="homepage-header-inner flex min-h-14 items-center justify-between gap-3 py-2 sm:h-16 sm:py-0">
          <Link
            href={HOMEPAGE_ROUTES.home}
            className="homepage-brand-link flex min-h-10 min-w-10 items-center justify-center sm:min-h-11 sm:min-w-0"
            aria-label={tCommon('brand')}
          >
            <span className="homepage-brand-wordmark font-display text-base font-semibold">
              {tCommon('brand')}
            </span>
          </Link>

          <div className="homepage-header-actions flex min-w-0 shrink items-center justify-end gap-2 sm:shrink-0 sm:gap-3">
            <Link
              href={HOMEPAGE_ROUTES.signIn}
              className="homepage-header-action homepage-nav-link inline-flex text-sm font-medium"
            >
              {tNavbar('signIn')}
            </Link>
            <HomepageHeaderCta />
            <HomepageMenu />
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
              <HomepageCapabilityMatrix />
            </div>

            <HomepageModelLineup />
          </div>

          <HomepageBottomCta />

          <HomepageFooter />
        </main>
      </div>
    </div>
  )
}
