'use client'

import { ArrowRight, AudioLines, Image as ImageIcon, Video } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'

import {
  HOMEPAGE_MODEL_PROVIDER_LABELS,
  HOMEPAGE_ROUTES,
} from '@/constants/homepage'
import {
  getAvailableModels,
  getModelMessageKey,
  groupModelsByProvider,
} from '@/constants/models'
import { isCjkLocale } from '@/i18n/routing'
import { cn } from '@/lib/utils'
import { Link } from '@/i18n/navigation'

import { BlurFade } from '@/components/ui/blur-fade'
import { TextAnimate } from '@/components/ui/text-animate'

export function HomepageModels() {
  const locale = useLocale()
  const isDenseLocale = isCjkLocale(locale)
  const t = useTranslations('Homepage')
  const tModels = useTranslations('Models')

  const availableModels = getAvailableModels()
  const availableGroups = groupModelsByProvider(availableModels)
  const mediaStats = [
    {
      icon: ImageIcon,
      id: 'image',
      value: availableModels.filter((model) => model.outputType === 'IMAGE')
        .length,
    },
    {
      icon: Video,
      id: 'video',
      value: availableModels.filter((model) => model.outputType === 'VIDEO')
        .length,
    },
    {
      icon: AudioLines,
      id: 'audio',
      value: availableModels.filter((model) => model.outputType === 'AUDIO')
        .length,
    },
  ] as const

  return (
    <section id="models" className="homepage-models grid gap-8 scroll-mt-24">
      <BlurFade inView>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.66fr)_minmax(18rem,0.34fr)] lg:items-end">
          <div className="grid max-w-[50rem] gap-3">
            <p
              className={cn(
                'text-xs font-semibold uppercase tracking-widest text-foreground/48',
                isDenseLocale && 'tracking-normal normal-case',
              )}
            >
              {t('models.eyebrow')}
            </p>
            <TextAnimate
              as="h2"
              by={isDenseLocale ? 'character' : 'word'}
              animation="blurInUp"
              duration={0.6}
              once
              startOnView
              className={cn(
                'font-display text-[clamp(2.5rem,5.4vw,5.8rem)] font-semibold leading-[0.94] tracking-[-0.06em] text-balance',
                isDenseLocale && 'tracking-normal',
              )}
            >
              {t('models.title')}
            </TextAnimate>
          </div>
          <p className="max-w-[28rem] font-serif text-base leading-7 text-[var(--home-muted)] lg:justify-self-end">
            {t('models.description')}
          </p>
        </div>
      </BlurFade>

      <div className="homepage-model-board grid gap-0 overflow-hidden rounded-[2rem] lg:grid-cols-[minmax(18rem,0.42fr)_minmax(0,1fr)]">
        <div className="homepage-model-summary grid content-between gap-10 p-6 sm:p-8">
          <div className="grid gap-3">
            <p className="font-display text-xs font-semibold uppercase tracking-widest text-foreground/44">
              {t('models.coverageEyebrow')}
            </p>
            <h3 className="font-display text-[clamp(2rem,4vw,4.2rem)] font-semibold leading-[0.95] tracking-[-0.06em]">
              {t('models.coverageTitle')}
            </h3>
            <p className="font-serif text-sm leading-7 text-[var(--home-muted)]">
              {t('models.coverageDescription')}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {mediaStats.map((stat) => {
              const Icon = stat.icon
              return (
                <div
                  key={stat.id}
                  className="homepage-model-media rounded-2xl p-4"
                >
                  <Icon className="size-4 text-foreground/54" />
                  <span className="mt-4 block font-display text-3xl font-semibold tabular-nums">
                    {stat.value}
                  </span>
                  <p className="mt-1 font-serif text-xs text-[var(--home-muted)]">
                    {t(`models.media.${stat.id}`)}
                  </p>
                </div>
              )
            })}
          </div>
        </div>

        <div className="homepage-provider-list grid gap-0">
          {availableGroups.map(({ group, models }, index) => {
            const featuredModels = models.slice(0, 3)
            return (
              <BlurFade key={group} delay={index * 0.04} inView>
                <article className="homepage-provider-row grid gap-4 p-5 sm:grid-cols-[3rem_minmax(9rem,0.4fr)_minmax(0,1fr)_5rem] sm:items-center">
                  <span className="homepage-provider-index font-display text-xs font-semibold tabular-nums">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div className="min-w-0">
                    <h4 className="truncate font-display text-lg font-semibold">
                      {HOMEPAGE_MODEL_PROVIDER_LABELS[group]}
                    </h4>
                    <p className="mt-1 font-serif text-xs text-[var(--home-muted)]">
                      {t('models.providerCount', { count: models.length })}
                    </p>
                  </div>
                  <div className="flex min-w-0 flex-wrap gap-x-4 gap-y-1">
                    {featuredModels.map((model) => (
                      <span
                        key={model.id}
                        className="max-w-44 truncate font-serif text-sm text-foreground/76"
                      >
                        {tModels(`${getModelMessageKey(model.id)}.label`)}
                      </span>
                    ))}
                  </div>
                  <span className="font-display text-sm font-semibold tabular-nums text-foreground/54 sm:text-right">
                    {models.length}
                  </span>
                </article>
              </BlurFade>
            )
          })}
        </div>
      </div>

      <div className="flex justify-end">
        <Link
          href={HOMEPAGE_ROUTES.workflow}
          className="inline-flex items-center gap-2 font-display text-sm font-semibold text-foreground hover:text-primary"
        >
          {t('models.nextLink')}
          <ArrowRight className="size-4" />
        </Link>
      </div>
    </section>
  )
}
