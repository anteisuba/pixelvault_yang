import Image from 'next/image'
import { ArrowRight, ArrowUpRight, Heart, Play, Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  HOMEPAGE_MADE_WITH_ANTEI_ITEMS,
  HOMEPAGE_MADE_WITH_ANTEI_SECTION_ID,
  HOMEPAGE_FEATURE_TRANSLATION_VALUES,
  HOMEPAGE_ROUTES,
  type HomepageFeatureMedia,
  type HomepageFeatureRhythm,
} from '@/constants/homepage'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

import { HomepageFeatureMediaFallback } from './HomepageFeatureMediaFallback'

const MADE_WITH_ANTEI_COLUMNS = ['left', 'middle', 'right'] as const

type HomepageMadeWithAnteiItem = (typeof HOMEPAGE_MADE_WITH_ANTEI_ITEMS)[number]

interface HomepageFeatureSectionProps {
  id: string
  ctaHref: string
  tone: string
  rhythm?: HomepageFeatureRhythm
  reverse?: boolean
  showEyebrow?: boolean
  showCta?: boolean
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
  rhythm,
  reverse,
  showEyebrow,
  showCta,
  comingSoon,
  media,
}: HomepageFeatureSectionProps) {
  if (id === HOMEPAGE_MADE_WITH_ANTEI_SECTION_ID) {
    return <HomepageMadeWithAnteiSection />
  }

  return (
    <HomepageStandardFeatureSection
      id={id}
      ctaHref={ctaHref}
      tone={tone}
      rhythm={rhythm}
      reverse={reverse}
      showEyebrow={showEyebrow}
      showCta={showCta}
      comingSoon={comingSoon}
      media={media}
    />
  )
}

function HomepageStandardFeatureSection({
  id,
  ctaHref,
  tone,
  rhythm = 'feature',
  reverse = false,
  showEyebrow = true,
  showCta = true,
  comingSoon = false,
  media,
}: HomepageFeatureSectionProps) {
  const t = useTranslations(`Homepage.featureSections.${id}`)
  const tCommon = useTranslations('Homepage')
  const translationValues = HOMEPAGE_FEATURE_TRANSLATION_VALUES[id] ?? {}
  const showMeta = showEyebrow || comingSoon

  return (
    <section
      id={id}
      data-homepage-reveal
      className={cn(
        'homepage-feature-section scroll-mt-24 grid items-center gap-10 lg:gap-16',
        rhythm === 'compact' && 'homepage-feature-section-compact',
      )}
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
        {showMeta && (
          <div className="mb-5 flex flex-wrap items-center gap-2">
            {showEyebrow && (
              <span className="homepage-feature-pill rounded-full px-4 py-2 text-sm font-semibold">
                {t('eyebrow', translationValues)}
              </span>
            )}
            {comingSoon && (
              <span className="homepage-feature-badge rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em]">
                {tCommon('badges.soon')}
              </span>
            )}
          </div>
        )}
        <h2
          id={`homepage-feature-${id}-title`}
          className="homepage-feature-title font-display font-bold text-foreground text-balance"
        >
          {t('title', translationValues)}
        </h2>
        <p className="homepage-feature-copy mt-6 max-w-2xl font-display font-medium text-[var(--home-muted)]">
          {t('description', translationValues)}
        </p>

        {showCta && (
          <Button
            asChild
            size="lg"
            className="homepage-primary-btn mt-9 h-14 rounded-full px-8 text-base font-semibold"
          >
            <Link href={ctaHref}>{t('cta')}</Link>
          </Button>
        )}
      </div>
    </section>
  )
}

function HomepageMadeWithAnteiSection() {
  const t = useTranslations('Homepage.madeWithAntei')

  return (
    <section
      id={HOMEPAGE_MADE_WITH_ANTEI_SECTION_ID}
      data-homepage-reveal
      className="homepage-made-section scroll-mt-24"
      aria-labelledby="homepage-made-with-antei-title"
    >
      <div className="homepage-made-grid">
        {MADE_WITH_ANTEI_COLUMNS.map((column) => (
          <div key={column} className="homepage-made-column">
            {column === 'left' && (
              <div className="homepage-made-intro">
                <h2
                  id="homepage-made-with-antei-title"
                  className="homepage-made-title font-display font-bold"
                >
                  {t('titlePrefix')}{' '}
                  <span className="homepage-made-title-brand">
                    {t('titleBrand')}
                  </span>
                </h2>
                <p className="homepage-made-copy">{t('description')}</p>
                <Link
                  href={HOMEPAGE_ROUTES.studio}
                  className="homepage-made-submit inline-flex items-center gap-1.5 text-sm font-medium"
                >
                  {t('submit')}
                  <ArrowUpRight className="size-4" aria-hidden="true" />
                </Link>
              </div>
            )}

            {HOMEPAGE_MADE_WITH_ANTEI_ITEMS.filter(
              (item) => item.column === column,
            ).map((item, index) => (
              <HomepageMadeWithAnteiCard
                key={item.id}
                item={item}
                priority={column === 'left' && index < 2}
              />
            ))}
          </div>
        ))}
      </div>

      <div className="homepage-made-footer">
        <Button
          asChild
          variant="outline"
          size="lg"
          className="homepage-made-explore h-12 rounded-full px-7 text-sm font-semibold"
        >
          <Link
            href={HOMEPAGE_ROUTES.gallery}
            className="inline-flex items-center gap-2"
          >
            {t('explore')}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </section>
  )
}

function HomepageMadeWithAnteiCard({
  item,
  priority = false,
}: {
  item: HomepageMadeWithAnteiItem
  priority?: boolean
}) {
  const t = useTranslations('Homepage.madeWithAntei')
  const caption = t(`items.${item.id}.caption`)

  return (
    <article
      className={cn('homepage-made-card', `homepage-made-card-${item.variant}`)}
    >
      <div className="homepage-made-media">
        <Image
          src={item.src}
          alt={caption}
          fill
          sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 100vw"
          className="object-cover"
          priority={priority}
        />

        {item.variant === 'featured' && (
          <>
            <span className="homepage-made-heart" aria-hidden="true">
              <Heart className="size-4" />
            </span>
            <Link
              href={HOMEPAGE_ROUTES.studio}
              className="homepage-made-remix inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold"
            >
              <Sparkles className="size-4" aria-hidden="true" />
              {t('remix')}
            </Link>
          </>
        )}

        {item.variant === 'video' && 'duration' in item && item.duration && (
          <span className="homepage-made-duration">
            <Play className="size-3" aria-hidden="true" />
            {item.duration}
          </span>
        )}
      </div>

      <div className="homepage-made-card-meta">
        <p>{caption}</p>
        <span>{item.model}</span>
      </div>
    </article>
  )
}
