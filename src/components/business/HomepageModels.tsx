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
      <div className={styles.sectionIntro}>
        <p
          className={cn(styles.sectionLabel, isDenseLocale && styles.denseCopy)}
        >
          {t('models.eyebrow')}
        </p>
        <h2 className={styles.sectionTitle}>{t('models.title')}</h2>
        <p className={styles.sectionDescription}>{t('models.description')}</p>
      </div>

      <div className={styles.modelRail}>
        {groups.map(({ group, models }) => (
          <div key={group}>
            <h3 className={styles.modelGroupTitle}>
              {tCommon(`providerGroups.${group}`)}
            </h3>

            {models.map((model) => (
              <article key={model.id} className={styles.modelCard}>
                <div>
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
                  <h3 className={styles.modelTitle}>
                    {tModels(`${getModelMessageKey(model.id)}.label`)}
                  </h3>
                </div>

                <p className={styles.modelDescription}>
                  {tModels(`${getModelMessageKey(model.id)}.description`)}
                </p>
              </article>
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}
