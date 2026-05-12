import Image from 'next/image'
import { useTranslations } from 'next-intl'

import { HOMEPAGE_SHOWCASE } from '@/constants/homepage'

import { HomepageAuthCta } from './HomepageAuthCta'

export function HomepageHero() {
  const t = useTranslations('Homepage.hero')

  return (
    <section
      className="homepage-hero-grid grid items-center gap-10 lg:gap-16"
      aria-labelledby="homepage-hero-title"
    >
      <div className="homepage-hero-mosaic overflow-hidden rounded-3xl">
        {HOMEPAGE_SHOWCASE.map((item) => (
          <div key={item.id} className="homepage-hero-tile">
            <Image
              src={item.src}
              alt={`${item.model} showcase`}
              width={320}
              height={320}
              className="h-full w-full object-cover"
              priority
            />
          </div>
        ))}
      </div>

      <div className="flex flex-col items-start text-left">
        <span className="homepage-hero-pill mb-5 rounded-full px-4 py-2 text-sm font-semibold">
          {t('eyebrow')}
        </span>
        <h1
          id="homepage-hero-title"
          className="homepage-hero-title font-display font-bold text-foreground text-balance"
        >
          {t('title')}
        </h1>
        <p className="homepage-hero-copy mt-6 max-w-2xl font-display font-medium text-[var(--home-muted)]">
          {t('subtitle')}
        </p>

        <HomepageAuthCta variant="hero" />
      </div>
    </section>
  )
}
