'use client'

import { motion, useReducedMotion } from 'motion/react'
import { useLocale, useTranslations } from 'next-intl'

import { HOMEPAGE_WORKFLOW } from '@/constants/homepage'
import { isCjkLocale } from '@/i18n/routing'
import { cn } from '@/lib/utils'

import { BlurFade } from '@/components/ui/blur-fade'

export function HomepageWorkflow() {
  const locale = useLocale()
  const isDenseLocale = isCjkLocale(locale)
  const t = useTranslations('Homepage')
  const shouldReduce = useReducedMotion()

  return (
    <section
      id="workflow"
      className="homepage-workflow grid gap-8 scroll-mt-24"
    >
      <BlurFade inView>
        <div className="grid max-w-[50rem] gap-3">
          <p
            className={cn(
              'text-xs font-semibold uppercase tracking-widest text-foreground/48',
              isDenseLocale && 'tracking-normal normal-case',
            )}
          >
            {t('workflow.eyebrow')}
          </p>
          <h2
            className={cn(
              'font-display text-[clamp(2.4rem,5vw,5.4rem)] font-semibold leading-[0.95] tracking-[-0.06em] text-balance',
              isDenseLocale && 'tracking-normal',
            )}
          >
            {t('workflow.title')}
          </h2>
          <p className="max-w-[35rem] font-serif text-base leading-7 text-[var(--home-muted)]">
            {t('workflow.description')}
          </p>
        </div>
      </BlurFade>

      <div className="homepage-workflow-board grid gap-0 overflow-hidden rounded-[2rem] lg:grid-cols-3">
        {HOMEPAGE_WORKFLOW.map((item, index) => (
          <motion.article
            key={item.step}
            className="homepage-workflow-card grid min-h-72 content-between gap-8 p-5 sm:p-6"
            initial={shouldReduce ? false : { opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{
              type: 'tween',
              ease: 'easeOut',
              duration: 0.4,
              delay: index * 0.08,
            }}
          >
            <span
              className={cn(
                'font-display text-[clamp(3rem,6vw,6rem)] font-semibold leading-none tracking-[-0.08em] text-foreground/16',
                isDenseLocale && 'tracking-normal',
              )}
            >
              {item.step}
            </span>
            <div>
              <h3 className="font-display text-[clamp(1.4rem,2.4vw,2rem)] font-semibold leading-tight tracking-[-0.04em]">
                {t(`workflow.items.${item.id}.title`)}
              </h3>
              <p className="mt-3 font-serif text-sm leading-7 text-[var(--home-muted)]">
                {t(`workflow.items.${item.id}.description`)}
              </p>
            </div>
          </motion.article>
        ))}
      </div>
    </section>
  )
}
