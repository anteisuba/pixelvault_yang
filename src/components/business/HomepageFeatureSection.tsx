import Image from 'next/image'
import { useTranslations } from 'next-intl'

import type { HomepageFeatureMedia } from '@/constants/homepage'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

import { HomepageFeatureMediaFallback } from './HomepageFeatureMediaFallback'

interface HomepageFeatureSectionProps {
  id: string
  ctaHref: string
  tone: string
  reverse?: boolean
  comingSoon?: boolean
  /**
   * Optional media to fill the section tile. When omitted the tile keeps
   * the gradient fallback so sections can ship art incrementally.
   */
  media?: HomepageFeatureMedia
}

export function HomepageFeatureSection({
  id,
  ctaHref,
  tone,
  reverse = false,
  comingSoon = false,
  media,
}: HomepageFeatureSectionProps) {
  const t = useTranslations(`Homepage.featureSections.${id}`)
  const tCommon = useTranslations('Homepage')

  return (
    <section
      id={id}
      className="homepage-feature-section scroll-mt-24 grid items-center gap-10 lg:gap-16"
      aria-labelledby={`homepage-feature-${id}-title`}
    >
      <div
        className={cn(
          'homepage-feature-media-container',
          `homepage-feature-tone-${tone}`,
          reverse && 'lg:order-2',
        )}
        aria-hidden={media ? undefined : 'true'}
      >
        {media?.type === 'image' && (
          <Image
            src={media.src}
            alt={media.alt}
            fill
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="homepage-feature-media object-cover"
            priority={false}
          />
        )}
        {media?.type === 'video' && (
          <video
            className="homepage-feature-media h-full w-full object-cover"
            src={media.src}
            poster={media.poster}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            aria-label={media.alt}
          />
        )}
        {!media && <HomepageFeatureMediaFallback id={id} />}
      </div>

      <div
        className={cn(
          'flex flex-col items-start text-left',
          reverse && 'lg:order-1',
        )}
      >
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <span className="homepage-feature-pill rounded-full px-4 py-2 text-sm font-semibold">
            {t('eyebrow')}
          </span>
          {comingSoon && (
            <span className="homepage-feature-badge rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em]">
              {tCommon('badges.soon')}
            </span>
          )}
        </div>
        <h2
          id={`homepage-feature-${id}-title`}
          className="homepage-feature-title font-display font-bold text-foreground text-balance"
        >
          {t('title')}
        </h2>
        <p className="homepage-feature-copy mt-6 max-w-2xl font-display font-medium text-[var(--home-muted)]">
          {t('description')}
        </p>

        <Button
          asChild
          size="lg"
          className="homepage-primary-btn mt-9 h-14 rounded-full px-8 text-base font-semibold"
        >
          <Link href={ctaHref}>{t('cta')}</Link>
        </Button>
      </div>
    </section>
  )
}
