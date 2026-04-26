'use client'

import { useTranslations } from 'next-intl'

import { InteractiveHoverButton } from '@/components/ui/interactive-hover-button'
import { ShimmerButton } from '@/components/ui/shimmer-button'
import { TextRepel } from '@/components/ui/text-repel'
import { useIsMobile } from '@/hooks/use-mobile'
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
  const t = useTranslations('Homepage')
  const isMobile = useIsMobile()

  return (
    <section
      className="flex flex-col items-center text-center"
      style={{
        paddingBlock: 'clamp(1.5rem, 3vw, 2.5rem) clamp(1.5rem, 3vw, 2rem)',
      }}
    >
      <TextRepel
        text={t('heroRepelText')}
        fontSize={isMobile ? 22 : 40}
        fontFamily="var(--font-hero)"
        fontWeight="700"
        color="var(--foreground)"
        repelRadius={isMobile ? 50 : 100}
        repelForce={0.5}
        lineHeight={1.45}
        letterSpacing={isMobile ? 1 : 2}
        className="w-full min-h-[220px] sm:min-h-[320px]"
      />

      <div className="flex flex-wrap justify-center gap-4 pt-8 max-sm:flex-col max-sm:items-center">
        <Link href={primaryActionHref}>
          <ShimmerButton
            shimmerColor={BRAND_ACCENT}
            borderRadius="9999px"
            background="transparent"
            className="h-[2.85rem] min-w-48 px-6 text-sm font-semibold text-foreground border-border/80"
          >
            {primaryActionLabel}
          </ShimmerButton>
        </Link>

        <Link href={galleryActionHref}>
          <InteractiveHoverButton className="h-[2.85rem] min-w-48 px-6 text-sm">
            {galleryActionLabel}
          </InteractiveHoverButton>
        </Link>
      </div>
    </section>
  )
}
