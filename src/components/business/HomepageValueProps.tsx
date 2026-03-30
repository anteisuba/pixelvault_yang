import type { LucideIcon } from 'lucide-react'
import {
  Archive,
  Database,
  KeyRound,
  ShieldCheck,
  Sparkles,
  Swords,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'

import {
  HOMEPAGE_VALUE_PROPS,
  type HomepageValuePropIcon,
} from '@/constants/homepage'
import { isCjkLocale } from '@/i18n/routing'
import { cn } from '@/lib/utils'

import { MotionStagger, MotionStaggerItem } from '@/components/ui/motion-reveal'

import styles from './HomepageShell.module.css'

const valuePropIcons: Record<HomepageValuePropIcon, LucideIcon> = {
  sparkles: Sparkles,
  archive: Archive,
  shield: ShieldCheck,
  key: KeyRound,
  database: Database,
  swords: Swords,
}

export function HomepageValueProps() {
  const locale = useLocale()
  const isDenseLocale = isCjkLocale(locale)
  const t = useTranslations('Homepage')

  return (
    <section className={styles.section}>
      <div className={styles.sectionIntro}>
        <p
          className={cn(styles.sectionLabel, isDenseLocale && styles.denseCopy)}
        >
          {t('valueProps.eyebrow')}
        </p>
        <h2 className={styles.sectionTitle}>{t('valueProps.title')}</h2>
      </div>

      <MotionStagger staggerMs={80} className={styles.valuePropGrid}>
        {HOMEPAGE_VALUE_PROPS.map((prop) => {
          const Icon = valuePropIcons[prop.icon]
          return (
            <MotionStaggerItem key={prop.id}>
              <article className={styles.valuePropItem}>
                <span className={styles.valuePropIcon}>
                  <Icon className="size-5" />
                </span>
                <div>
                  <h3 className={styles.valuePropTitle}>
                    {t(`valueProps.items.${prop.id}.title`)}
                  </h3>
                  <p className={styles.valuePropDescription}>
                    {t(`valueProps.items.${prop.id}.description`)}
                  </p>
                </div>
              </article>
            </MotionStaggerItem>
          )
        })}
      </MotionStagger>
    </section>
  )
}
