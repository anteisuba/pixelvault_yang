'use client'

import { motion, useReducedMotion } from 'motion/react'
import { useLocale, useTranslations } from 'next-intl'

import { HOMEPAGE_WORKFLOW } from '@/constants/homepage'
import { isCjkLocale } from '@/i18n/routing'
import { cn } from '@/lib/utils'

import { MotionReveal } from '@/components/ui/motion-reveal'

import styles from './HomepageShell.module.css'

export function HomepageWorkflow() {
  const locale = useLocale()
  const isDenseLocale = isCjkLocale(locale)
  const t = useTranslations('Homepage')
  const shouldReduce = useReducedMotion()

  return (
    <section id="workflow" className={styles.section}>
      <MotionReveal>
        <div className={styles.sectionIntro}>
          <p
            className={cn(
              styles.sectionLabel,
              isDenseLocale && styles.denseCopy,
            )}
          >
            {t('workflow.eyebrow')}
          </p>
          <h2 className={styles.sectionTitle}>{t('workflow.title')}</h2>
        </div>
      </MotionReveal>

      <div className={styles.stepperTrack}>
        {HOMEPAGE_WORKFLOW.map((item, index) => (
          <div key={item.step} className={styles.stepperUnit}>
            <motion.div
              className={styles.stepperNode}
              initial={shouldReduce ? false : { opacity: 0, scale: 0.6 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{
                type: 'tween',
                ease: 'easeOut',
                duration: 0.4,
                delay: index * 0.3,
              }}
            >
              <span
                className={cn(
                  styles.stepperNumber,
                  isDenseLocale && styles.denseCopy,
                )}
              >
                {item.step}
              </span>
              <h3 className={styles.stepperTitle}>
                {t(`workflow.items.${item.id}.title`)}
              </h3>
            </motion.div>

            {index < HOMEPAGE_WORKFLOW.length - 1 && (
              <motion.div
                className={styles.stepperLine}
                initial={shouldReduce ? false : { scaleX: 0 }}
                whileInView={{ scaleX: 1 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{
                  type: 'tween',
                  ease: 'easeOut',
                  duration: 0.4,
                  delay: index * 0.3 + 0.2,
                }}
                style={{ transformOrigin: 'left' }}
              />
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
