'use client'

import type { LucideIcon } from 'lucide-react'
import {
  Archive,
  Database,
  KeyRound,
  ShieldCheck,
  Sparkles,
  Swords,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'

import {
  HOMEPAGE_VALUE_PROPS,
  type HomepageValuePropIcon,
} from '@/constants/homepage'
import { isCjkLocale } from '@/i18n/routing'
import { BRAND_ACCENT, BRAND_ACCENT_DARK } from '@/lib/design-tokens'
import { cn } from '@/lib/utils'

import { BlurFade } from '@/components/ui/blur-fade'
import { MagicCard } from '@/components/ui/magic-card'
import { TextAnimate } from '@/components/ui/text-animate'

const valuePropIcons: Record<HomepageValuePropIcon, LucideIcon> = {
  sparkles: Sparkles,
  archive: Archive,
  shield: ShieldCheck,
  key: KeyRound,
  database: Database,
  swords: Swords,
}

// First 2 items span 2 cols, rest are 1 col each
const bentoSpans = [
  'md:col-span-2',
  'md:col-span-1',
  'md:col-span-1',
  'md:col-span-1',
  'md:col-span-1',
  'md:col-span-2',
]

export function HomepageValueProps() {
  const locale = useLocale()
  const isDenseLocale = isCjkLocale(locale)
  const t = useTranslations('Homepage')

  return (
    <section className="homepage-section grid gap-5 pt-[clamp(2rem,3.5vw,3rem)] scroll-mt-24">
      <div className="grid gap-[0.65rem] max-w-[42rem]">
        <p
          className={cn(
            'text-[0.72rem] font-semibold tracking-[0.18em] uppercase text-primary opacity-75',
            isDenseLocale && 'tracking-normal normal-case',
          )}
        >
          {t('valueProps.eyebrow')}
        </p>
        <TextAnimate
          as="h2"
          by="word"
          animation="blurInUp"
          duration={0.6}
          once
          startOnView
          className="font-display text-[clamp(1.8rem,4vw,3rem)] font-semibold leading-none tracking-[-0.04em] text-balance"
        >
          {t('valueProps.title')}
        </TextAnimate>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {HOMEPAGE_VALUE_PROPS.map((prop, index) => {
          const Icon = valuePropIcons[prop.icon]
          return (
            <BlurFade
              key={prop.id}
              delay={index * 0.08}
              inView
              className={bentoSpans[index]}
            >
              <MagicCard
                gradientFrom={BRAND_ACCENT}
                gradientTo={BRAND_ACCENT_DARK}
                gradientColor="rgba(217, 119, 87, 0.06)"
                gradientOpacity={0.8}
                className="h-full rounded-2xl border-border/60 bg-transparent p-6"
              >
                <div className="flex flex-col gap-3">
                  <span className="homepage-value-icon inline-flex items-center justify-center shrink-0 w-[2.5rem] h-[2.5rem] rounded-full text-primary">
                    <Icon className="size-5" />
                  </span>
                  <div>
                    <h3 className="font-display text-[clamp(1.05rem,1.4vw,1.2rem)] font-semibold leading-[1.15] tracking-[-0.02em]">
                      {t(`valueProps.items.${prop.id}.title`)}
                    </h3>
                    <p className="font-serif text-[0.92rem] leading-[1.65] text-[var(--home-muted)] mt-[0.2rem]">
                      {t(`valueProps.items.${prop.id}.description`)}
                    </p>
                  </div>
                </div>
              </MagicCard>
            </BlurFade>
          )
        })}
      </div>
    </section>
  )
}
