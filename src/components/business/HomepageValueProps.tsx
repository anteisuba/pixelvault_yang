'use client'

import type { LucideIcon } from 'lucide-react'
import { AudioLines, Boxes, Image as ImageIcon, Video } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'

import {
  HOMEPAGE_CAPABILITIES,
  type HomepageCapabilityIcon,
} from '@/constants/homepage'
import { getAvailableModels, getModelMessageKey } from '@/constants/models'
import { isCjkLocale } from '@/i18n/routing'
import { cn } from '@/lib/utils'

import { BlurFade } from '@/components/ui/blur-fade'
import { TextAnimate } from '@/components/ui/text-animate'

const capabilityIcons: Record<HomepageCapabilityIcon, LucideIcon> = {
  image: ImageIcon,
  video: Video,
  audio: AudioLines,
  lora: Boxes,
}

export function HomepageValueProps() {
  const locale = useLocale()
  const isDenseLocale = isCjkLocale(locale)
  const t = useTranslations('Homepage')
  const tModels = useTranslations('Models')
  const availableModels = getAvailableModels()
  const capabilityCounts = {
    textToImage: availableModels.filter((model) => model.outputType === 'IMAGE')
      .length,
    videoGeneration: availableModels.filter(
      (model) => model.outputType === 'VIDEO',
    ).length,
    voiceGeneration: availableModels.filter(
      (model) => model.outputType === 'AUDIO',
    ).length,
    loraTraining: availableModels.filter((model) => model.supportsLora).length,
  }

  return (
    <section
      id="capabilities"
      className="homepage-capabilities grid gap-8 scroll-mt-24"
    >
      <BlurFade inView>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.72fr)_minmax(18rem,0.28fr)] lg:items-end">
          <div className="grid max-w-[52rem] gap-3">
            <p
              className={cn(
                'text-xs font-semibold uppercase tracking-widest text-foreground/48',
                isDenseLocale && 'tracking-normal normal-case',
              )}
            >
              {t('capabilities.eyebrow')}
            </p>
            <TextAnimate
              as="h2"
              by={isDenseLocale ? 'character' : 'word'}
              animation="blurInUp"
              duration={0.6}
              once
              startOnView
              className={cn(
                'max-w-full break-words font-display text-[clamp(2.6rem,5.4vw,5.8rem)] font-semibold leading-[0.94] tracking-[-0.06em] text-balance',
                isDenseLocale && 'tracking-normal',
              )}
            >
              {t('capabilities.title')}
            </TextAnimate>
          </div>

          <p className="max-w-[24rem] font-serif text-base leading-7 text-[var(--home-muted)] lg:justify-self-end">
            {t('capabilities.description')}
          </p>
        </div>
      </BlurFade>

      <div className="homepage-capability-grid grid gap-0 overflow-hidden rounded-[2rem]">
        {HOMEPAGE_CAPABILITIES.map((capability, index) => {
          const Icon = capabilityIcons[capability.icon]
          const modelLabels = capability.modelIds
            .map((modelId) => tModels(`${getModelMessageKey(modelId)}.label`))
            .join(' / ')
          const count =
            capabilityCounts[capability.id as keyof typeof capabilityCounts]

          return (
            <BlurFade key={capability.id} delay={index * 0.08} inView>
              <article className="homepage-capability-row grid gap-5 p-5 sm:p-6 lg:grid-cols-[5rem_minmax(12rem,0.46fr)_minmax(0,1fr)_minmax(9rem,0.26fr)] lg:items-center">
                <span className="homepage-capability-icon inline-flex size-12 items-center justify-center rounded-2xl">
                  <Icon className="size-5" />
                </span>
                <div>
                  <p className="font-display text-xs font-semibold uppercase tracking-widest text-foreground/44">
                    {String(index + 1).padStart(2, '0')}
                  </p>
                  <h3 className="mt-2 font-display text-[clamp(1.6rem,3vw,3rem)] font-semibold leading-[0.98] tracking-[-0.05em]">
                    {t(`capabilities.items.${capability.id}.title`)}
                  </h3>
                </div>
                <div className="grid gap-3">
                  <p className="font-serif text-base leading-7 text-[var(--home-muted)]">
                    {t(`capabilities.items.${capability.id}.description`)}
                  </p>
                  <p className="truncate font-display text-sm font-semibold text-foreground/70">
                    {modelLabels}
                  </p>
                </div>
                <div className="homepage-capability-stat rounded-2xl p-4">
                  <span className="font-display text-3xl font-semibold tabular-nums">
                    {count}
                  </span>
                  <p className="mt-1 font-serif text-xs leading-5 text-[var(--home-muted)]">
                    {t(`capabilities.items.${capability.id}.stat`)}
                  </p>
                </div>
              </article>
            </BlurFade>
          )
        })}
      </div>
    </section>
  )
}
