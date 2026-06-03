import Image from 'next/image'
import { ArrowRight } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { HomepageHeroCta } from '@/components/business/HomepageHeroCta'
import { HOMEPAGE_ROUTES, HOMEPAGE_SHOWCASE } from '@/constants/homepage'
import { Link } from '@/i18n/navigation'

export function HomepageHero() {
  const t = useTranslations('Homepage.hero')
  const tActions = useTranslations('Homepage.actions')
  const showcase = HOMEPAGE_SHOWCASE

  return (
    <section
      className="homepage-hero-grid grid items-center gap-12"
      aria-labelledby="homepage-hero-title"
    >
      <div className="flex flex-col items-center text-center">
        <h1
          id="homepage-hero-title"
          className="homepage-hero-title font-display font-bold text-foreground text-balance"
          aria-label={t('title')}
        >
          <span className="homepage-hero-title-main">{t('headline')}</span>
          <span className="homepage-hero-title-platform">{t('subline')}</span>
        </h1>

        <div className="homepage-hero-actions mt-7 flex flex-wrap items-center justify-center gap-3 sm:mt-9">
          <HomepageHeroCta />
          <Button
            asChild
            variant="outline"
            size="lg"
            className="homepage-secondary-btn h-11 rounded-full px-6 text-sm font-semibold sm:px-7"
          >
            <Link
              href={HOMEPAGE_ROUTES.gallery}
              className="inline-flex items-center gap-2"
            >
              {tActions('gallerySecondary')}
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </div>

      <div className="homepage-hero-mosaic overflow-hidden">
        {showcase.map((item, idx) => (
          <div key={item.id} className="homepage-hero-tile">
            <Image
              src={item.src}
              alt={`${item.model} showcase`}
              width={480}
              height={480}
              className="homepage-hero-tile-image h-full w-full object-cover"
              priority={idx < 4}
            />
          </div>
        ))}
      </div>
    </section>
  )
}
