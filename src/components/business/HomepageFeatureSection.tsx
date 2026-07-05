import Image from 'next/image'
import { useTranslations } from 'next-intl'

import {
  HOMEPAGE_FEATURE_TRANSLATION_VALUES,
  type HomepageFeatureMedia,
  type HomepageFeatureRhythm,
} from '@/constants/homepage'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

import { HomepageFeatureMediaFallback } from './HomepageFeatureMediaFallback'

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
  if (rhythm === 'panorama') {
    return (
      <HomepagePanoramaFeatureSection
        id={id}
        ctaHref={ctaHref}
        tone={tone}
        showEyebrow={showEyebrow}
        showCta={showCta}
        comingSoon={comingSoon}
        media={media}
      />
    )
  }

  if (rhythm === 'band') {
    return (
      <HomepageBandFeatureSection
        id={id}
        ctaHref={ctaHref}
        tone={tone}
        showCta={showCta}
        media={media}
      />
    )
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

/**
 * Full-bleed dark band variant — breaks the alternating split rhythm mid-page
 * and gives the canvas story a wide "darkroom window" of its own, echoing the
 * hero window / capability panel / footer slabs.
 */
function HomepagePanoramaFeatureSection({
  id,
  ctaHref,
  tone,
  showCta = true,
  media,
}: HomepageFeatureSectionProps) {
  const t = useTranslations(`Homepage.featureSections.${id}`)
  const translationValues = HOMEPAGE_FEATURE_TRANSLATION_VALUES[id] ?? {}

  return (
    <section
      id={id}
      data-homepage-reveal
      className="homepage-feature-panorama scroll-mt-24"
      aria-labelledby={`homepage-feature-${id}-title`}
    >
      <div className="homepage-feature-panorama-head flex flex-col items-start text-left">
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
            className="homepage-primary-btn mt-8 h-14 rounded-full px-8 text-base font-semibold"
          >
            <Link href={ctaHref}>{t('cta', translationValues)}</Link>
          </Button>
        )}
      </div>

      <div
        className={cn(
          'homepage-feature-media-container homepage-feature-panorama-media',
          `homepage-feature-tone-${tone}`,
        )}
        aria-hidden={media ? undefined : 'true'}
      >
        {media?.type === 'image' && (
          <Image
            src={media.src}
            alt={media.alt}
            fill
            sizes="100vw"
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
    </section>
  )
}

/**
 * Full-bleed light "audio strip" band — a short, wide horizontal panel that
 * breaks the tall left/right split run. Text sits on the light strip; the
 * waveform lives in a wide, short dark window (audio needs the dark mat for
 * the white waveform to read). Distinct from both the tall splits and the
 * full-bleed dark panorama, so the page reads in three rhythms.
 */
function HomepageBandFeatureSection({
  id,
  ctaHref,
  tone,
  showCta = true,
  media,
}: HomepageFeatureSectionProps) {
  const t = useTranslations(`Homepage.featureSections.${id}`)
  const translationValues = HOMEPAGE_FEATURE_TRANSLATION_VALUES[id] ?? {}

  return (
    <section
      id={id}
      data-homepage-reveal
      className="homepage-feature-band scroll-mt-24"
      aria-labelledby={`homepage-feature-${id}-title`}
    >
      <div className="homepage-feature-band-inner">
        <div className="flex flex-col items-start text-left">
          <h2
            id={`homepage-feature-${id}-title`}
            className="homepage-feature-title font-display font-bold text-foreground text-balance"
          >
            {t('title', translationValues)}
          </h2>
          <p className="homepage-feature-copy mt-5 max-w-xl font-display font-medium text-[var(--home-muted)]">
            {t('description', translationValues)}
          </p>
          {showCta && (
            <Button
              asChild
              size="lg"
              className="homepage-primary-btn mt-7 h-14 rounded-full px-8 text-base font-semibold"
            >
              <Link href={ctaHref}>{t('cta', translationValues)}</Link>
            </Button>
          )}
        </div>

        <div
          className={cn(
            'homepage-feature-media-container homepage-feature-band-media',
            `homepage-feature-tone-${tone}`,
          )}
          aria-hidden={media ? undefined : 'true'}
        >
          {media?.type === 'image' && (
            <Image
              src={media.src}
              alt={media.alt}
              fill
              sizes="(min-width: 1024px) 55vw, 100vw"
              className="homepage-feature-media object-cover"
              priority={false}
            />
          )}
          {!media && <HomepageFeatureMediaFallback id={id} />}
        </div>
      </div>
    </section>
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
      data-reverse={reverse ? 'true' : undefined}
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
              <span className="homepage-feature-pill">
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

// "用 ANTEI 创作" community gallery removed 2026-06-19 (redundant with the hero
// work-wall + it was static, not real community data). Bring back as a real
// gallery/multi-model showcase when there's data.
