import Image from 'next/image'
import { useTranslations } from 'next-intl'

import { HOMEPAGE_SHOWCASE } from '@/constants/homepage'

const RAIL_ITEMS = [...HOMEPAGE_SHOWCASE, ...HOMEPAGE_SHOWCASE]

export function HomepageShowcaseRail() {
  const t = useTranslations('Homepage.showcaseRail')

  return (
    <section
      data-homepage-reveal
      className="homepage-showcase-rail"
      aria-labelledby="homepage-showcase-rail-title"
    >
      <div className="mb-6 flex items-end justify-between gap-4 px-1">
        <h2
          id="homepage-showcase-rail-title"
          className="homepage-rail-title font-display font-bold text-foreground"
        >
          {t('title')}
        </h2>
        <p className="hidden max-w-md text-sm text-[var(--home-muted)] sm:block">
          {t('description')}
        </p>
      </div>

      <div className="homepage-rail-viewport relative">
        <div className="homepage-rail-track">
          {RAIL_ITEMS.map((item, idx) => (
            <figure
              key={`${item.id}-${idx}`}
              className="homepage-rail-card relative shrink-0 overflow-hidden rounded-2xl"
            >
              <Image
                src={item.src}
                alt={`${item.model} showcase`}
                width={320}
                height={400}
                className="h-full w-full object-cover"
                sizes="(min-width: 1024px) 22vw, 60vw"
              />
              <figcaption className="absolute bottom-3 left-3 rounded-full bg-black/55 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-white backdrop-blur-sm">
                {item.model}
              </figcaption>
            </figure>
          ))}
        </div>
        <div className="homepage-rail-fade-l" aria-hidden="true" />
        <div className="homepage-rail-fade-r" aria-hidden="true" />
      </div>
    </section>
  )
}
