'use client'

import { useState } from 'react'

import { ChevronDown } from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  HOMEPAGE_CAPABILITY_ITEMS,
  HOMEPAGE_FEATURE_TRANSLATION_VALUES,
} from '@/constants/homepage'

export function HomepageCapabilityMatrix() {
  const t = useTranslations('Homepage.capabilityMatrix')
  const tFeature = useTranslations('Homepage.featureSections')
  const tHomepage = useTranslations('Homepage')
  const [openId, setOpenId] = useState<string | null>(null)

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
          const isOpen = openId === item.id

          return (
            <article
              key={item.id}
              data-homepage-reveal-item
              data-open={isOpen ? 'true' : undefined}
              className="homepage-capability-item"
            >
              <button
                type="button"
                className="homepage-capability-trigger"
                aria-expanded={isOpen}
                onClick={() =>
                  setOpenId((current) => (current === item.id ? null : item.id))
                }
              >
                <span className="homepage-capability-item-head">
                  {item.comingSoon && (
                    <span className="homepage-capability-status">
                      {tHomepage('badges.soon')}
                    </span>
                  )}
                  <h3 className="homepage-capability-item-title font-display font-semibold text-foreground">
                    {tFeature(`${item.id}.title`, translationValues)}
                  </h3>
                </span>
                <ChevronDown
                  className="homepage-capability-chevron size-5"
                  aria-hidden="true"
                />
              </button>
              <p className="homepage-capability-item-copy text-[var(--home-muted)]">
                {tFeature(`${item.id}.description`, translationValues)}
              </p>
            </article>
          )
        })}
      </div>
    </section>
  )
}
