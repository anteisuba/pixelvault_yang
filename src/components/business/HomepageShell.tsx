import { useTranslations } from 'next-intl'

import {
  HOMEPAGE_FEATURE_SECTIONS,
  HOMEPAGE_NAVIGATION,
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
        <div className="mx-auto flex h-16 max-w-content items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link
            href={HOMEPAGE_ROUTES.home}
            className="flex min-w-0 items-center gap-2"
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

          <nav
            aria-label={t('navigationLabel')}
            className="hidden items-center justify-center gap-9 text-sm font-medium text-foreground md:flex"
          >
            <Link href={HOMEPAGE_ROUTES.studio} className="homepage-top-link">
              {t('nav.app')}
            </Link>
            {HOMEPAGE_NAVIGATION.map((item) =>
              item.href.startsWith('#') ? (
                <a key={item.id} href={item.href} className="homepage-top-link">
                  {t(`navigation.${item.id}`)}
                </a>
              ) : (
                <Link
                  key={item.id}
                  href={item.href}
                  className="homepage-top-link"
                >
                  {t(`navigation.${item.id}`)}
                </Link>
              ),
            )}
          </nav>

          <div className="flex shrink-0 items-center justify-end gap-2">
            <LocaleSwitcher />

            <HomepageAuthCta variant="nav-utility" />
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
