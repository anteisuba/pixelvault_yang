import { useLocale, useTranslations } from 'next-intl'

import type { AI_MODELS } from '@/constants/models'
import { getModelMessageKey } from '@/constants/models'
import type { HomepageSceneTone } from '@/constants/homepage'
import { isCjkLocale } from '@/i18n/routing'
import { cn } from '@/lib/utils'

import styles from './HomepageShell.module.css'

const sceneToneClasses: Record<HomepageSceneTone, string> = {
  dawn: styles.sceneDawn,
  forest: styles.sceneForest,
  ink: styles.sceneInk,
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
      className={cn(styles.sceneCard, sceneToneClasses[tone], className)}
    >
      <span className={cn(styles.sceneTag, isDenseLocale && styles.denseCopy)}>
        {tModels(`${getModelMessageKey(modelId)}.label`)}
      </span>
      <p className={styles.scenePrompt}>
        {t(`scenes.items.${sceneId}.prompt`)}
      </p>
      <div className={styles.sceneMeta}>
        <span>{t(`scenes.items.${sceneId}.note`)}</span>
        <span>{t('stage.savedLabel')}</span>
      </div>
    </article>
  )
}
