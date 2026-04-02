import { useLocale, useTranslations } from 'next-intl'

import type { AI_MODELS } from '@/constants/models'
import { getModelMessageKey } from '@/constants/models'
import type { HomepageSceneTone } from '@/constants/homepage'
import { isCjkLocale } from '@/i18n/routing'
import { cn } from '@/lib/utils'

const sceneToneClasses: Record<HomepageSceneTone, string> = {
  dawn: 'homepage-scene-dawn',
  forest: 'homepage-scene-forest',
  ink: 'homepage-scene-ink',
}

interface HomepageSceneCardProps {
  sceneId: string
  modelId: AI_MODELS
  tone: HomepageSceneTone
  className?: string
}

export function HomepageSceneCard({
  sceneId,
  modelId,
  tone,
  className,
}: HomepageSceneCardProps) {
  const locale = useLocale()
  const isDenseLocale = isCjkLocale(locale)
  const t = useTranslations('Homepage')
  const tModels = useTranslations('Models')

  return (
    <article
      className={cn(
        'homepage-scene-card relative grid gap-[0.9rem] content-end min-h-[10.5rem] p-[1.15rem] rounded-2xl transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] hover:-translate-y-0.5 max-sm:min-h-36',
        sceneToneClasses[tone],
        className,
      )}
    >
      <span
        className={cn(
          'homepage-scene-tag inline-flex w-fit px-[0.64rem] py-[0.32rem] rounded-full text-[0.68rem] font-semibold tracking-[0.12em] uppercase text-[var(--home-muted)]',
          isDenseLocale && 'tracking-normal normal-case',
        )}
      >
        {tModels(`${getModelMessageKey(modelId)}.label`)}
      </span>
      <p className="font-serif text-[clamp(1.18rem,2vw,1.48rem)] font-medium leading-[1.18] text-balance max-w-[18ch]">
        {t(`scenes.items.${sceneId}.prompt`)}
      </p>
      <div className="flex flex-wrap justify-between gap-x-3 gap-y-[0.45rem] text-[0.68rem] font-semibold tracking-[0.12em] uppercase text-[var(--home-muted)]">
        <span>{t(`scenes.items.${sceneId}.note`)}</span>
        <span>{t('stage.savedLabel')}</span>
      </div>
    </article>
  )
}
