import Image from 'next/image'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
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
          <span className="homepage-hero-brand">{t('brand')}</span>
          <span className="homepage-hero-title-main">{t('mediums')}</span>
          <span className="homepage-hero-title-platform">{t('platform')}</span>
        </h1>

        <div className="homepage-hero-actions mt-7 flex flex-wrap items-center justify-center gap-3 sm:mt-9">
          <Button
            asChild
            variant="outline"
            size="lg"
            className="homepage-secondary-btn h-12 rounded-full px-7 text-base font-semibold sm:h-14 sm:px-8"
          >
            <Link href={HOMEPAGE_ROUTES.gallery}>
              {tActions('gallerySecondary')}
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
              className="homepage-hero-tile-image homepage-hero-tile-image-a h-full w-full object-cover"
              priority={idx < 3}
            />
          </div>
        ))}
      </div>
    </section>
  )
}
