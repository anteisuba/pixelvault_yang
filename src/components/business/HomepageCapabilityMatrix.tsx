import { useTranslations } from 'next-intl'

import {
  HOMEPAGE_CAPABILITY_ITEMS,
  HOMEPAGE_FEATURE_TRANSLATION_VALUES,
} from '@/constants/homepage'

export function HomepageCapabilityMatrix() {
  const t = useTranslations('Homepage.capabilityMatrix')
  const tFeature = useTranslations('Homepage.featureSections')
  const tHomepage = useTranslations('Homepage')

  return (
    <section
      data-homepage-reveal
      className="homepage-capability-panel"
      aria-labelledby="homepage-capability-title"
    >
      <div className="homepage-capability-intro">
        <span className="homepage-capability-kicker">{t('eyebrow')}</span>
        <h2
          id="homepage-capability-title"
          className="homepage-capability-title font-display font-bold text-foreground text-balance"
        >
          {t('title')}
        </h2>
        <p className="homepage-capability-copy font-display font-medium text-[var(--home-muted)]">
          {t('description')}
        </p>
      </div>

      <div className="homepage-capability-grid">
        {HOMEPAGE_CAPABILITY_ITEMS.map((item) => {
          const translationValues =
            HOMEPAGE_FEATURE_TRANSLATION_VALUES[item.id] ?? {}

          return (
            <article
              key={item.id}
              data-homepage-reveal-item
              className="homepage-capability-item"
            >
              <div className="min-w-0">
                {item.comingSoon && (
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="homepage-capability-status">
                      {tHomepage('badges.soon')}
                    </span>
                  </div>
                )}
                <h3 className="homepage-capability-item-title font-display font-semibold text-foreground">
                  {tFeature(`${item.id}.title`, translationValues)}
                </h3>
                <p className="homepage-capability-item-copy mt-3 text-[var(--home-muted)]">
                  {tFeature(`${item.id}.description`, translationValues)}
                </p>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
