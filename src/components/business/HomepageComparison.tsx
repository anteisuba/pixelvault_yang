import type { LucideIcon } from 'lucide-react'
import { Archive, KeyRound, Swords } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'

import {
  HOMEPAGE_COMPARISON,
  type HomepageComparisonIcon,
} from '@/constants/homepage'
import { isCjkLocale } from '@/i18n/routing'
import { cn } from '@/lib/utils'

const comparisonIcons: Record<HomepageComparisonIcon, LucideIcon> = {
  key: KeyRound,
  archive: Archive,
  swords: Swords,
}

export function HomepageComparison() {
  const locale = useLocale()
  const isDenseLocale = isCjkLocale(locale)
  const t = useTranslations('Homepage')

  return (
    <section className="homepage-border-top grid gap-5 pt-[clamp(2rem,3.5vw,3rem)] scroll-mt-24">
      <div className="grid gap-[0.65rem] max-w-[42rem]">
        <p
          className={cn(
            'text-[0.72rem] font-semibold tracking-[0.18em] uppercase text-primary opacity-75',
            isDenseLocale && 'tracking-normal normal-case',
          )}
        >
          {t('comparison.eyebrow')}
        </p>
        <h2 className="font-display text-[clamp(1.8rem,4vw,3rem)] font-semibold leading-none tracking-[-0.04em] text-balance">
          {t('comparison.title')}
        </h2>
        <p className="max-w-[40rem] font-serif text-[1rem] leading-[1.78] text-[var(--home-muted)] text-pretty">
          {t('comparison.description')}
        </p>
      </div>

      <div className="grid gap-0 md:grid-cols-3 md:gap-[1.35rem]">
        {HOMEPAGE_COMPARISON.map((item) => {
          const Icon = comparisonIcons[item.icon]
          return (
            <article
              key={item.id}
              className="homepage-item-border grid gap-[0.95rem] pt-5"
            >
              <div className="grid gap-[0.8rem]">
                <span className="homepage-feature-icon inline-flex items-center justify-center w-[2.3rem] h-[2.3rem] rounded-full text-primary">
                  <Icon className="size-5" />
                </span>
                <h3 className="font-display text-[clamp(1.4rem,2vw,1.75rem)] font-medium leading-[1.02] tracking-[-0.03em]">
                  {t(`comparison.items.${item.id}.title`)}
                </h3>
              </div>
              <p className="font-serif text-[var(--home-muted)] leading-[1.78] text-pretty">
                {t(`comparison.items.${item.id}.description`)}
              </p>
            </article>
          )
        })}
      </div>
    </section>
  )
}
