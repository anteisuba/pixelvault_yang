'use client'

import { useTranslations } from 'next-intl'

import { InteractiveHoverButton } from '@/components/ui/interactive-hover-button'
import { ShimmerButton } from '@/components/ui/shimmer-button'
import { BRAND_ACCENT } from '@/lib/design-tokens'
import { Link } from '@/i18n/navigation'

interface HomepageHeroProps {
  primaryActionHref: string
  primaryActionLabel: string
  galleryActionHref: string
  galleryActionLabel: string
}

export function HomepageHero({
  primaryActionHref,
  primaryActionLabel,
  galleryActionHref,
  galleryActionLabel,
}: HomepageHeroProps) {
  const t = useTranslations('Homepage.hero')

  return (
    <section
      className="flex flex-col items-center text-center"
      style={{
        paddingBlock: 'clamp(1.5rem, 3vw, 2.5rem) clamp(1.5rem, 3vw, 2rem)',
      }}
    >
      <h1
        className="font-display text-hero-title font-bold leading-hero tracking-hero text-foreground animate-fade-in-up"
        style={{ animationDuration: '500ms', animationFillMode: 'both' }}
      >
        {t('title')}
      </h1>
      <p
        className="mt-3 font-serif text-hero-subtitle leading-relaxed text-muted-foreground animate-fade-in-up"
        style={{
          animationDuration: '500ms',
          animationDelay: '150ms',
          animationFillMode: 'both',
        }}
      >
        {t('subtitle')}
      </p>

      <div
        className="flex flex-wrap justify-center gap-4 pt-8 max-sm:flex-col max-sm:items-center animate-fade-in-up"
        style={{
          animationDuration: '500ms',
          animationDelay: '300ms',
          animationFillMode: 'both',
        }}
      >
        <Link href={primaryActionHref}>
          <ShimmerButton
            shimmerColor={BRAND_ACCENT}
            borderRadius="9999px"
            background="transparent"
            className="h-hero-btn min-w-48 px-6 text-sm font-semibold text-foreground border-border/80"
          >
            {primaryActionLabel}
          </ShimmerButton>
        </Link>

        <Link href={galleryActionHref}>
          <InteractiveHoverButton className="h-hero-btn min-w-48 px-6 text-sm">
            {galleryActionLabel}
          </InteractiveHoverButton>
        </Link>
      </div>
    </section>
  )
}
