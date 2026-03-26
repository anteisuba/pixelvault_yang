import type { LucideIcon } from 'lucide-react'
import { Archive, ShieldCheck, Sparkles } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'

import {
  HOMEPAGE_FEATURES,
  type HomepageFeatureIcon,
} from '@/constants/homepage'
import { isCjkLocale } from '@/i18n/routing'
import { cn } from '@/lib/utils'

import styles from './HomepageShell.module.css'

const featureIcons: Record<HomepageFeatureIcon, LucideIcon> = {
  sparkles: Sparkles,
  archive: Archive,
  shield: ShieldCheck,
}

export function HomepageFeatures() {
  const locale = useLocale()
  const isDenseLocale = isCjkLocale(locale)
  const t = useTranslations('Homepage')

  return (
    <section className={styles.section}>
      <div className={styles.sectionIntro}>
        <p
          className={cn(styles.sectionLabel, isDenseLocale && styles.denseCopy)}
        >
          {t('features.eyebrow')}
        </p>
        <h2 className={styles.sectionTitle}>{t('features.title')}</h2>
        <p className={styles.sectionDescription}>{t('features.description')}</p>
      </div>

      <div className={styles.featureGrid}>
        {HOMEPAGE_FEATURES.map((feature) => {
          const FeatureIcon = featureIcons[feature.icon]

          return (
            <article key={feature.id} className={styles.featureItem}>
              <div className={styles.featureHeader}>
                <span className={styles.featureIcon}>
                  <FeatureIcon className="size-5" />
                </span>
                <h3 className={styles.featureTitle}>
                  {t(`features.items.${feature.id}.title`)}
                </h3>
              </div>
              <p className={styles.featureDescription}>
                {t(`features.items.${feature.id}.description`)}
              </p>
            </article>
          )
        })}
      </div>
    </section>
  )
}
