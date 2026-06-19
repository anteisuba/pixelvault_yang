import Image from 'next/image'
import { ArrowRight } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { HOMEPAGE_HERO_WALL, HOMEPAGE_ROUTES } from '@/constants/homepage'
import { Button } from '@/components/ui/button'
import { HomepageHeroCta } from '@/components/business/HomepageHeroCta'
import { cn } from '@/lib/utils'
import { Link } from '@/i18n/navigation'

// Tiles that periodically cross-fade into a different result, so the wall
// reads as a live "darkroom" where models keep generating. Kept to a small
// subset on a long, staggered cycle — motion serves the "every model
// generates" story, not decoration.
const HERO_REGEN_TILE_INDICES = new Set([1, 4, 6])

export function HomepageHero() {
  const t = useTranslations('Homepage.hero')
  const tActions = useTranslations('Homepage.actions')

  return (
    <section
      className="homepage-hero-window"
      aria-labelledby="homepage-hero-title"
    >
      <div className="homepage-hero-wall" aria-hidden="true">
        {HOMEPAGE_HERO_WALL.map((shot, index) => {
          const regenerates = HERO_REGEN_TILE_INDICES.has(index)
          const nextShot =
            HOMEPAGE_HERO_WALL[(index + 3) % HOMEPAGE_HERO_WALL.length]

          return (
            <div
              key={shot.id}
              className={cn(
                'homepage-hero-tile',
                regenerates && 'homepage-hero-tile-regen',
              )}
            >
              <Image
                src={shot.src}
                alt=""
                fill
                sizes="(min-width: 640px) 22vw, 45vw"
                className="homepage-hero-tile-image object-cover"
                priority={index < 4}
              />
              {regenerates && (
                <Image
                  src={nextShot.src}
                  alt=""
                  fill
                  sizes="(min-width: 640px) 22vw, 45vw"
                  className="homepage-hero-tile-image homepage-hero-tile-image-next object-cover"
                />
              )}
            </div>
          )
        })}
      </div>

      <div className="homepage-hero-scrim" aria-hidden="true" />

      <div className="homepage-hero-content">
        <h1
          id="homepage-hero-title"
          className="homepage-hero-title text-foreground text-balance"
          aria-label={t('title')}
        >
          <span className="homepage-hero-title-main">{t('headline')}</span>
          <span className="homepage-hero-title-platform">{t('subline')}</span>
        </h1>

        <div className="homepage-hero-actions mt-8 flex flex-wrap items-center gap-3">
          <HomepageHeroCta />
          <Button
            asChild
            variant="outline"
            size="lg"
            className="homepage-secondary-btn h-12 rounded-full px-7 text-sm font-semibold sm:px-8"
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
    </section>
  )
}
