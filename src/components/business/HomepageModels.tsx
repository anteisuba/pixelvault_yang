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

import {
  MotionReveal,
  MotionStagger,
  MotionStaggerItem,
} from '@/components/ui/motion-reveal'

import styles from './HomepageShell.module.css'

export function HomepageModels() {
  const locale = useLocale()
  const isDenseLocale = isCjkLocale(locale)
  const t = useTranslations('Homepage')
  const tCommon = useTranslations('Common')
  const tModels = useTranslations('Models')

  const groups = groupModelsByProvider(MODEL_OPTIONS)

  return (
    <section id="models" className={styles.section}>
      <MotionReveal>
        <div className={styles.sectionIntro}>
          <p
            className={cn(
              styles.sectionLabel,
              isDenseLocale && styles.denseCopy,
            )}
          >
            {t('models.eyebrow')}
          </p>
          <h2 className={styles.sectionTitle}>{t('models.title')}</h2>
        </div>
      </MotionReveal>

      <div className={styles.modelRail}>
        {groups.map(({ group, models }) => (
          <div key={group}>
            <h3 className={styles.modelGroupTitle}>
              {tCommon(`providerGroups.${group}`)}
            </h3>

            <MotionStagger
              staggerMs={60}
              direction="left"
              className={styles.modelCompactGrid}
            >
              {models.map((model) => (
                <MotionStaggerItem key={model.id} direction="left">
                  <article className={styles.modelCardCompact}>
                    <span className={styles.modelTitle}>
                      {tModels(`${getModelMessageKey(model.id)}.label`)}
                    </span>
                    <div className={styles.modelMeta}>
                      <span
                        className={cn(
                          styles.providerTag,
                          isDenseLocale && styles.denseCopy,
                        )}
                      >
                        {getProviderLabel(model.providerConfig)}
                      </span>
                      <span
                        className={cn(
                          styles.costTag,
                          isDenseLocale && styles.denseCopy,
                        )}
                      >
                        {tCommon('creditCount', {
                          count: API_USAGE.DEFAULT_REQUESTS_PER_GENERATION,
                        })}
                      </span>
                    </div>
                  </article>
                </MotionStaggerItem>
              ))}
            </MotionStagger>
          </div>
        ))}
      </div>
    </section>
  )
}
