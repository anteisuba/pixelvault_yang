import Image from 'next/image'
import { useTranslations } from 'next-intl'

import {
  HOMEPAGE_MODEL_COUNT_VALUES,
  HOMEPAGE_SHOWCASE,
} from '@/constants/homepage'

import { HomepageAuthCta } from './HomepageAuthCta'

export function HomepageHero() {
  const t = useTranslations('Homepage.hero')
  const showcase = HOMEPAGE_SHOWCASE

  return (
    <section
      className="homepage-hero-grid grid items-center gap-12"
      aria-labelledby="homepage-hero-title"
    >
      <div className="flex flex-col items-center text-center">
        <span className="homepage-hero-pill mb-5 rounded-full px-4 py-2 text-sm font-semibold">
          {t('eyebrow', HOMEPAGE_MODEL_COUNT_VALUES)}
        </span>
        <h1
          id="homepage-hero-title"
          className="homepage-hero-title font-display font-bold text-foreground text-balance"
        >
          {t('title')}
        </h1>
        <p className="homepage-hero-copy mt-6 max-w-3xl font-display font-medium text-[var(--home-muted)]">
          {t('subtitle')}
        </p>

        <HomepageAuthCta variant="hero" />
      </div>

      <div className="homepage-hero-mosaic overflow-hidden">
        {showcase.map((item, idx) => (
          <div key={item.id} className="homepage-hero-tile">
            <Image
              src={item.src}
              alt={`${item.model} showcase`}
              width={480}
              height={480}
              className="homepage-hero-tile-image homepage-hero-tile-image-a h-full w-full object-cover"
              priority={idx < 3}
            />
          </div>
        ))}
      </div>
    </section>
  )
}
