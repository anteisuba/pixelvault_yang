import { ArrowRight } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'

import { API_USAGE } from '@/constants/config'
import { MODEL_OPTIONS } from '@/constants/models'
import { Button } from '@/components/ui/button'
import { MotionReveal } from '@/components/ui/motion-reveal'
import { Link } from '@/i18n/navigation'
import { isCjkLocale } from '@/i18n/routing'
import { cn } from '@/lib/utils'

import { HomepageHeroVisual } from './HomepageHeroVisual'
import styles from './HomepageShell.module.css'

const providerCount = new Set(MODEL_OPTIONS.map((model) => model.adapterType))
  .size

interface HomepageHeroProps {
  eyebrow: string
  title: string
  description: string
  primaryActionHref: string
  primaryActionLabel: string
  secondaryActionHref: string
  secondaryActionLabel: string
}

export function HomepageHero({
  eyebrow,
  title,
  description,
  primaryActionHref,
  primaryActionLabel,
  secondaryActionHref,
  secondaryActionLabel,
}: HomepageHeroProps) {
  const locale = useLocale()
  const isDenseLocale = isCjkLocale(locale)
  const t = useTranslations('Homepage')
  const tCommon = useTranslations('Common')

  return (
    <section className={styles.hero}>
      <div className={styles.heroGrid}>
        <div className={styles.heroCopy}>
          <MotionReveal delay={0}>
            <p
              className={cn(styles.eyebrow, isDenseLocale && styles.denseCopy)}
            >
              {eyebrow}
            </p>
          </MotionReveal>

          <MotionReveal delay={0.1}>
            <h1 className={styles.title}>
              {title}
              <span className={styles.titleAccent} aria-hidden="true" />
            </h1>
          </MotionReveal>

          <MotionReveal delay={0.2}>
            <p className={styles.description}>{description}</p>
          </MotionReveal>

          <MotionReveal delay={0.3}>
            <div className={styles.actions}>
              <Button asChild size="lg" className={styles.primaryButton}>
                <Link href={primaryActionHref}>
                  {primaryActionLabel}
                  <ArrowRight className="size-4" />
                </Link>
              </Button>

              <Button
                asChild
                variant="outline"
                size="lg"
                className={styles.secondaryButton}
              >
                <Link href={secondaryActionHref}>{secondaryActionLabel}</Link>
              </Button>
            </div>
          </MotionReveal>

          <MotionReveal delay={0.4}>
            <div className={styles.heroPills}>
              <span className={styles.heroPill}>
                {t('signals.modelCoverageValue', {
                  modelCount: MODEL_OPTIONS.length,
                  providerCount,
                })}
              </span>
              <span className={styles.heroPill}>
                {t('signals.creditValue', {
                  creditCount: tCommon('creditCount', {
                    count: API_USAGE.DEFAULT_REQUESTS_PER_GENERATION,
                  }),
                })}
              </span>
            </div>
          </MotionReveal>
        </div>

        <MotionReveal delay={0.2}>
          <HomepageHeroVisual />
        </MotionReveal>
      </div>
    </section>
  )
}
