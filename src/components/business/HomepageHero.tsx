import { ArrowRight } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'

import { API_USAGE } from '@/constants/config'
import { HOMEPAGE_SCENES } from '@/constants/homepage'
import { MODEL_OPTIONS } from '@/constants/models'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import { isCjkLocale } from '@/i18n/routing'
import { cn } from '@/lib/utils'

import { HomepageSceneCard } from './HomepageSceneCard'
import styles from './HomepageShell.module.css'

const providerCount = new Set(MODEL_OPTIONS.map((model) => model.adapterType))
  .size

const HERO_SCENE_COUNT = 2

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
          <p className={cn(styles.eyebrow, isDenseLocale && styles.denseCopy)}>
            {eyebrow}
          </p>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.description}>{description}</p>

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
        </div>

        <div className={styles.heroVisual}>
          <div className={styles.heroVisualInner}>
            {HOMEPAGE_SCENES.slice(0, HERO_SCENE_COUNT).map((scene) => (
              <HomepageSceneCard
                key={scene.id}
                sceneId={scene.id}
                modelId={scene.modelId}
                tone={scene.tone}
                className={styles.heroVisualCard}
              />
            ))}
          </div>
        </div>
      </div>

      <div className={styles.heroMetrics}>
        <div className={styles.signalItem}>
          <span
            className={cn(
              styles.signalLabel,
              isDenseLocale && styles.denseCopy,
            )}
          >
            {t('signals.modelCoverageLabel')}
          </span>
          <span className={styles.signalValue}>
            {t('signals.modelCoverageValue', {
              modelCount: MODEL_OPTIONS.length,
              providerCount,
            })}
          </span>
        </div>
        <div className={styles.signalItem}>
          <span
            className={cn(
              styles.signalLabel,
              isDenseLocale && styles.denseCopy,
            )}
          >
            {t('signals.creditLabel')}
          </span>
          <span className={styles.signalValue}>
            {t('signals.creditValue', {
              creditCount: tCommon('creditCount', {
                count: API_USAGE.DEFAULT_REQUESTS_PER_GENERATION,
              }),
            })}
          </span>
        </div>
        <div className={styles.signalItem}>
          <span
            className={cn(
              styles.signalLabel,
              isDenseLocale && styles.denseCopy,
            )}
          >
            {t('signals.archiveLabel')}
          </span>
          <span className={styles.signalValue}>
            {t('signals.archiveValue')}
          </span>
        </div>
      </div>
    </section>
  )
}
