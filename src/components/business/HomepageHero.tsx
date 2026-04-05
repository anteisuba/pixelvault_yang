import { ArrowRight } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'

import { API_USAGE } from '@/constants/config'
import { MODEL_OPTIONS } from '@/constants/models'
import { BlurFade } from '@/components/ui/blur-fade'
import { Button } from '@/components/ui/button'
import { TextAnimate } from '@/components/ui/text-animate'
import { Link } from '@/i18n/navigation'
import { isCjkLocale } from '@/i18n/routing'
import { cn } from '@/lib/utils'

import { HomepageHeroVisual } from './HomepageHeroVisual'

const providerCount = new Set(MODEL_OPTIONS.map((model) => model.adapterType))
  .size

interface HomepageHeroProps {
  eyebrow: string
  title: string
  description: string
  primaryActionHref: string
  primaryActionLabel: string
  secondaryActionHref: string
  secondaryActionLabel: string
}

export function HomepageHero({
  eyebrow,
  title,
  description,
  primaryActionHref,
  primaryActionLabel,
  secondaryActionHref,
  secondaryActionLabel,
}: HomepageHeroProps) {
  const locale = useLocale()
  const isDenseLocale = isCjkLocale(locale)
  const t = useTranslations('Homepage')
  const tCommon = useTranslations('Common')

  return (
    <section
      className="homepage-border-top flex flex-col gap-[clamp(1.5rem,3vw,2.25rem)]"
      style={{
        paddingBlock: 'clamp(2rem, 5vw, 3.5rem) clamp(1.5rem, 3vw, 2.5rem)',
      }}
    >
      <div className="grid gap-[clamp(1.5rem,3vw,2rem)] items-center md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="grid gap-[0.85rem] min-w-0">
          <p
            className={cn(
              'inline-flex w-fit text-[0.72rem] font-semibold tracking-[0.18em] uppercase text-primary opacity-85',
              isDenseLocale && 'tracking-normal normal-case',
            )}
          >
            {eyebrow}
          </p>

          <div className="max-w-[18ch]">
            <TextAnimate
              as="h1"
              by="word"
              animation="blurInUp"
              duration={0.8}
              once
              className="font-display text-[clamp(3rem,7vw,5.5rem)] font-bold leading-[0.9] tracking-[-0.04em] text-balance"
            >
              {title}
            </TextAnimate>
            <span
              className="block w-14 h-[3px] mt-3 rounded-sm bg-primary"
              aria-hidden="true"
            />
          </div>

          <p className="max-w-[36rem] font-serif text-[clamp(1.04rem,1.7vw,1.18rem)] leading-[1.8] text-[var(--home-muted)] text-pretty">
            {description}
          </p>

          <div className="flex flex-wrap gap-[0.85rem] pt-[0.15rem] [&>*]:flex-none">
            <Button
              asChild
              size="lg"
              className="homepage-primary-btn h-[2.85rem] min-w-48 px-[1.45rem] rounded-full max-sm:w-full max-sm:min-w-0"
            >
              <Link href={primaryActionHref}>
                {primaryActionLabel}
                <ArrowRight className="size-4" />
              </Link>
            </Button>

            <Button
              asChild
              variant="outline"
              size="lg"
              className="homepage-secondary-btn h-[2.85rem] min-w-48 px-[1.45rem] rounded-full max-sm:w-full max-sm:min-w-0"
            >
              <Link href={secondaryActionHref}>{secondaryActionLabel}</Link>
            </Button>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <span className="homepage-pill inline-flex items-center px-3 py-[0.3rem] rounded-full text-[0.72rem] font-medium tracking-[0.02em] text-[var(--home-muted)]">
              {t('signals.modelCoverageValue', {
                modelCount: MODEL_OPTIONS.length,
                providerCount,
              })}
            </span>
            <span className="homepage-pill inline-flex items-center px-3 py-[0.3rem] rounded-full text-[0.72rem] font-medium tracking-[0.02em] text-[var(--home-muted)]">
              {t('signals.creditValue', {
                creditCount: tCommon('creditCount', {
                  count: API_USAGE.DEFAULT_REQUESTS_PER_GENERATION,
                }),
              })}
            </span>
          </div>
        </div>

        <BlurFade delay={0.2} inView inViewMargin="0px">
          <HomepageHeroVisual />
        </BlurFade>
      </div>
    </section>
  )
}
