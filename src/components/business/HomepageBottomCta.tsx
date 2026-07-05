import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import {
  HOMEPAGE_MODEL_COUNT_VALUES,
  HOMEPAGE_ROUTES,
} from '@/constants/homepage'
import { Link } from '@/i18n/navigation'

export function HomepageBottomCta() {
  const t = useTranslations('Homepage.bottomCta')

  return (
    <div className="homepage-bottom-cta-bleed">
      <section
        data-homepage-reveal
        className="homepage-bottom-cta relative overflow-hidden rounded-2xl px-8 py-14 sm:px-14 sm:py-20"
        aria-labelledby="homepage-bottom-cta-title"
      >
        <div className="homepage-bottom-cta-content flex max-w-3xl flex-col items-start text-left">
          <h2
            id="homepage-bottom-cta-title"
            className="homepage-feature-title font-display font-bold text-foreground text-balance"
          >
            {t('title')}
          </h2>
          <p className="homepage-feature-copy mt-6 max-w-2xl font-display font-medium text-[var(--home-muted)] text-balance">
            {t('description', HOMEPAGE_MODEL_COUNT_VALUES)}
          </p>
          <Button
            asChild
            size="lg"
            className="homepage-primary-btn mt-9 h-14 rounded-full px-8 text-base font-semibold"
          >
            <Link href={HOMEPAGE_ROUTES.signUp}>{t('primary')}</Link>
          </Button>
        </div>
      </section>
    </div>
  )
}
