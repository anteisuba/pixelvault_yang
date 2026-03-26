import type { LucideIcon } from 'lucide-react'
import { Archive, KeyRound, Swords } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'

import {
  HOMEPAGE_COMPARISON,
  type HomepageComparisonIcon,
} from '@/constants/homepage'
import { isCjkLocale } from '@/i18n/routing'
import { cn } from '@/lib/utils'

import styles from './HomepageShell.module.css'

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
    <section className={styles.section}>
      <div className={styles.sectionIntro}>
        <p
          className={cn(styles.sectionLabel, isDenseLocale && styles.denseCopy)}
        >
          {t('comparison.eyebrow')}
        </p>
        <h2 className={styles.sectionTitle}>{t('comparison.title')}</h2>
        <p className={styles.sectionDescription}>
          {t('comparison.description')}
        </p>
      </div>

      <div className={styles.featureGrid}>
        {HOMEPAGE_COMPARISON.map((item) => {
          const Icon = comparisonIcons[item.icon]
          return (
            <article key={item.id} className={styles.featureItem}>
              <div className={styles.featureHeader}>
                <span className={styles.featureIcon}>
                  <Icon className="size-5" />
                </span>
                <h3 className={styles.featureTitle}>
                  {t(`comparison.items.${item.id}.title`)}
                </h3>
              </div>
              <p className={styles.featureDescription}>
                {t(`comparison.items.${item.id}.description`)}
              </p>
            </article>
          )
        })}
      </div>
    </section>
  )
}
