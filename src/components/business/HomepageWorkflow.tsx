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
      className="homepage-border-top grid gap-5 pt-[clamp(2rem,3.5vw,3rem)] scroll-mt-24"
    >
      <BlurFade inView>
        <div className="grid gap-[0.65rem] max-w-[42rem]">
          <p
            className={cn(
              'text-[0.72rem] font-semibold tracking-[0.18em] uppercase text-primary opacity-75',
              isDenseLocale && 'tracking-normal normal-case',
            )}
          >
            {t('workflow.eyebrow')}
          </p>
          <h2 className="font-display text-[clamp(1.8rem,4vw,3rem)] font-semibold leading-none tracking-[-0.04em] text-balance">
            {t('workflow.title')}
          </h2>
        </div>
      </BlurFade>

      <div className="flex flex-col gap-0 md:flex-row md:items-center">
        {HOMEPAGE_WORKFLOW.map((item, index) => (
          <div
            key={item.step}
            className="flex flex-col items-start md:flex-row md:items-center md:flex-1"
          >
            <motion.div
              className="flex items-center gap-[0.85rem] py-3"
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
                  'homepage-stepper-number inline-flex items-center justify-center w-12 h-12 shrink-0 rounded-full font-display text-[0.85rem] font-bold tracking-[0.08em] uppercase',
                  isDenseLocale && 'tracking-normal normal-case',
                )}
              >
                {item.step}
              </span>
              <h3 className="font-display text-[clamp(1.3rem,2vw,1.65rem)] font-semibold leading-[1.1] tracking-[-0.02em]">
                {t(`workflow.items.${item.id}.title`)}
              </h3>
            </motion.div>

            {index < HOMEPAGE_WORKFLOW.length - 1 && (
              <motion.div
                className="homepage-stepper-line w-0.5 h-8 ml-[calc(3rem/2-1px)] rounded-[1px] md:w-auto md:h-0.5 md:flex-1 md:ml-0 md:mx-2"
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
