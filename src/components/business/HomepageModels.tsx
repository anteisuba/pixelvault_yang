import { useLocale, useTranslations } from 'next-intl'

import { API_USAGE } from '@/constants/config'
import {
  getModelMessageKey,
  groupModelsByProvider,
  MODEL_OPTIONS,
} from '@/constants/models'
import { getProviderLabel } from '@/constants/providers'
import { isCjkLocale } from '@/i18n/routing'
import { cn } from '@/lib/utils'

import { BlurFade } from '@/components/ui/blur-fade'

export function HomepageModels() {
  const locale = useLocale()
  const isDenseLocale = isCjkLocale(locale)
  const t = useTranslations('Homepage')
  const tCommon = useTranslations('Common')
  const tModels = useTranslations('Models')

  const groups = groupModelsByProvider(MODEL_OPTIONS)

  return (
    <section
      id="models"
      className="homepage-border-top grid gap-5 pt-[clamp(2rem,3.5vw,3rem)] scroll-mt-24"
    >
      <BlurFade inView>
        <div className="grid gap-[0.65rem] max-w-[42rem]">
          <p
            className={cn(
              'text-[0.72rem] font-semibold tracking-[0.18em] uppercase text-primary opacity-75',
              isDenseLocale && 'tracking-normal normal-case',
            )}
          >
            {t('models.eyebrow')}
          </p>
          <h2 className="font-display text-[clamp(1.8rem,4vw,3rem)] font-semibold leading-none tracking-[-0.04em] text-balance">
            {t('models.title')}
          </h2>
        </div>
      </BlurFade>

      <div className="homepage-model-rail grid gap-0">
        {groups.map(({ group, models }) => (
          <div key={group}>
            <h3 className="homepage-model-group font-display text-[0.78rem] font-semibold tracking-[0.12em] uppercase text-primary pt-[1.4rem] pb-[0.4rem] opacity-85">
              {tCommon(`providerGroups.${group}`)}
            </h3>

            <div className="grid gap-0">
              {models.map((model, modelIndex) => (
                <BlurFade key={model.id} delay={modelIndex * 0.06} inView direction="left">
                  <article className="homepage-model-compact homepage-model-border flex items-center justify-between gap-3 py-[0.85rem] md:px-2 transition-colors duration-200">
                    <span className="font-display text-[clamp(1rem,1.4vw,1.15rem)] font-medium leading-[1.2] tracking-[-0.02em]">
                      {tModels(`${getModelMessageKey(model.id)}.label`)}
                    </span>
                    <div className="flex flex-wrap items-center gap-[0.4rem]">
                      <span
                        className={cn(
                          'homepage-provider-tag inline-flex items-center w-fit px-[0.55rem] py-1 rounded-full text-[0.62rem] font-semibold tracking-[0.14em] uppercase text-foreground',
                          isDenseLocale && 'tracking-normal normal-case',
                        )}
                      >
                        {getProviderLabel(model.providerConfig)}
                      </span>
                      <span
                        className={cn(
                          'homepage-cost-tag inline-flex items-center w-fit px-[0.55rem] py-1 rounded-full text-[0.62rem] font-semibold tracking-[0.14em] uppercase',
                          isDenseLocale && 'tracking-normal normal-case',
                        )}
                      >
                        {tCommon('creditCount', {
                          count: API_USAGE.DEFAULT_REQUESTS_PER_GENERATION,
                        })}
                      </span>
                    </div>
                  </article>
                </BlurFade>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
