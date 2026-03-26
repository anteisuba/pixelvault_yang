import { useLocale, useTranslations } from 'next-intl'

import { HOMEPAGE_WORKFLOW } from '@/constants/homepage'
import { isCjkLocale } from '@/i18n/routing'
import { cn } from '@/lib/utils'

import styles from './HomepageShell.module.css'

export function HomepageWorkflow() {
  const locale = useLocale()
  const isDenseLocale = isCjkLocale(locale)
  const t = useTranslations('Homepage')

  return (
    <section id="workflow" className={styles.section}>
      <div className={styles.sectionIntro}>
        <p
          className={cn(styles.sectionLabel, isDenseLocale && styles.denseCopy)}
        >
          {t('workflow.eyebrow')}
        </p>
        <h2 className={styles.sectionTitle}>{t('workflow.title')}</h2>
        <p className={styles.sectionDescription}>{t('workflow.description')}</p>
      </div>

      <div className={styles.workflowGrid}>
        {HOMEPAGE_WORKFLOW.map((item) => (
          <article key={item.step} className={styles.workflowItem}>
            <span
              className={cn(
                styles.workflowStep,
                isDenseLocale && styles.denseCopy,
              )}
            >
              {item.step}
            </span>
            <h3 className={styles.workflowTitle}>
              {t(`workflow.items.${item.id}.title`)}
            </h3>
            <p className={styles.workflowDescription}>
              {t(`workflow.items.${item.id}.description`)}
            </p>
          </article>
        ))}
      </div>
    </section>
  )
}
