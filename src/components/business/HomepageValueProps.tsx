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
import { cn } from '@/lib/utils'

import { MotionStagger, MotionStaggerItem } from '@/components/ui/motion-reveal'

const valuePropIcons: Record<HomepageValuePropIcon, LucideIcon> = {
  sparkles: Sparkles,
  archive: Archive,
  shield: ShieldCheck,
  key: KeyRound,
  database: Database,
  swords: Swords,
}

export function HomepageValueProps() {
  const locale = useLocale()
  const isDenseLocale = isCjkLocale(locale)
  const t = useTranslations('Homepage')

  return (
    <section className="homepage-section homepage-border-top grid gap-5 pt-[clamp(2rem,3.5vw,3rem)] scroll-mt-24">
      <div className="grid gap-[0.65rem] max-w-[42rem]">
        <p
          className={cn(
            'text-[0.72rem] font-semibold tracking-[0.18em] uppercase text-primary opacity-75',
            isDenseLocale && 'tracking-normal normal-case',
          )}
        >
          {t('valueProps.eyebrow')}
        </p>
        <h2 className="font-display text-[clamp(1.8rem,4vw,3rem)] font-semibold leading-none tracking-[-0.04em] text-balance">
          {t('valueProps.title')}
        </h2>
      </div>

      <MotionStagger
        staggerMs={80}
        className="homepage-value-prop-grid grid gap-0 md:grid-cols-2 md:gap-x-8 lg:grid-cols-3 lg:gap-x-8"
      >
        {HOMEPAGE_VALUE_PROPS.map((prop) => {
          const Icon = valuePropIcons[prop.icon]
          return (
            <MotionStaggerItem key={prop.id}>
              <article className="homepage-item-border flex items-start gap-[0.85rem] py-[1.15rem]">
                <span className="homepage-value-icon inline-flex items-center justify-center shrink-0 w-[2.3rem] h-[2.3rem] rounded-full text-primary">
                  <Icon className="size-5" />
                </span>
                <div>
                  <h3 className="homepage-value-title font-display text-[clamp(1.1rem,1.6vw,1.3rem)] font-medium leading-[1.15] tracking-[-0.02em]">
                    {t(`valueProps.items.${prop.id}.title`)}
                  </h3>
                  <p className="font-serif text-[0.92rem] leading-[1.65] text-[var(--home-muted)] mt-[0.2rem]">
                    {t(`valueProps.items.${prop.id}.description`)}
                  </p>
                </div>
              </article>
            </MotionStaggerItem>
          )
        })}
      </MotionStagger>
    </section>
  )
}
