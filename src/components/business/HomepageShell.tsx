import type { ReactNode } from 'react'

import type { LucideIcon } from 'lucide-react'
import { Archive, ArrowRight, ShieldCheck, Sparkles } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'

import {
  HOMEPAGE_FEATURES,
  HOMEPAGE_NAVIGATION,
  HOMEPAGE_ROUTES,
  HOMEPAGE_SCENES,
  HOMEPAGE_WORKFLOW,
  type HomepageFeatureIcon,
  type HomepageSceneTone,
} from '@/constants/homepage'
import { getModelMessageKey, MODEL_OPTIONS } from '@/constants/models'
import { LocaleSwitcher } from '@/components/layout/LocaleSwitcher'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import { isCjkLocale } from '@/i18n/routing'
import { cn } from '@/lib/utils'

import styles from './HomepageShell.module.css'

const featureIcons: Record<HomepageFeatureIcon, LucideIcon> = {
  sparkles: Sparkles,
  archive: Archive,
  shield: ShieldCheck,
}

const sceneToneClasses: Record<HomepageSceneTone, string> = {
  dawn: styles.sceneDawn,
  forest: styles.sceneForest,
  ink: styles.sceneInk,
}

const startingCreditCost = MODEL_OPTIONS.reduce(
  (lowestCost, model) => Math.min(lowestCost, model.cost),
  MODEL_OPTIONS[0]?.cost ?? 0,
)

const providerCount = new Set(MODEL_OPTIONS.map((model) => model.provider)).size

interface HomepageShellProps {
  eyebrow: string
  title: string
  description: string
  primaryActionHref: string
  primaryActionLabel: string
  secondaryActionHref: string
  secondaryActionLabel: string
  utilityActionHref: string
  utilityActionLabel: string
  authPanel?: ReactNode
}

export function HomepageShell({
  eyebrow,
  title,
  description,
  primaryActionHref,
  primaryActionLabel,
  secondaryActionHref,
  secondaryActionLabel,
  utilityActionHref,
  utilityActionLabel,
  authPanel,
}: HomepageShellProps) {
  const heroClassName = authPanel
    ? `${styles.hero} ${styles.heroAuth}`
    : styles.hero
  const stageContentClassName = authPanel
    ? `${styles.stageContent} ${styles.stageContentAuth}`
    : styles.stageContent
  const locale = useLocale()
  const isDenseLocale = isCjkLocale(locale)
  const t = useTranslations('Homepage')
  const tCommon = useTranslations('Common')
  const tModels = useTranslations('Models')

  return (
    <div className={styles.page}>
      <div
        className={`mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8 ${styles.shell}`}
      >
        <header className={styles.header}>
          <Link href={HOMEPAGE_ROUTES.home} className={styles.brandBlock}>
            <span
              className={cn(
                styles.brandLabel,
                isDenseLocale && styles.denseCopy,
              )}
            >
              {t('brandLabel')}
            </span>
            <span className={styles.brandName}>{tCommon('brand')}</span>
            <span className={styles.brandSubline}>
              {t('brandSubline')}
            </span>
          </Link>

          <nav className={styles.nav} aria-label={t('navigationLabel')}>
            {HOMEPAGE_NAVIGATION.map((item) => (
              <Link key={item.href} href={item.href} className={styles.navLink}>
                {t(`navigation.${item.id}`)}
              </Link>
            ))}
          </nav>

          <div className={styles.headerActions}>
            <LocaleSwitcher />

            <Button
              asChild
              variant="outline"
              size="sm"
              className={styles.utilityButton}
            >
              <Link href={utilityActionHref}>{utilityActionLabel}</Link>
            </Button>
          </div>
        </header>

        <main className={styles.main}>
          <section className={heroClassName}>
            <div className={styles.heroCopy}>
              <p
                className={cn(
                  styles.eyebrow,
                  isDenseLocale && styles.denseCopy,
                )}
              >
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

              <div className={styles.signalList}>
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
                        count: startingCreditCost,
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
                  <span className={styles.signalValue}>{t('signals.archiveValue')}</span>
                </div>
              </div>
            </div>

            <div className={styles.stage}>
              <div className={styles.stagePanel}>
                <div className={styles.stageTopline}>
                  <span
                    className={cn(
                      styles.stageLabel,
                      isDenseLocale && styles.denseCopy,
                    )}
                  >
                    {t('stage.label')}
                  </span>
                  <span className={styles.stageValue}>{t('stage.value')}</span>
                </div>

                <div className={stageContentClassName}>
                  <div className={styles.sceneGrid}>
                    {HOMEPAGE_SCENES.map((scene) => (
                      <article
                        key={scene.id}
                        className={`${styles.sceneCard} ${sceneToneClasses[scene.tone]}`}
                      >
                        <span
                          className={cn(
                            styles.sceneTag,
                            isDenseLocale && styles.denseCopy,
                          )}
                        >
                          {tModels(`${getModelMessageKey(scene.modelId)}.label`)}
                        </span>
                        <p className={styles.scenePrompt}>
                          {t(`scenes.items.${scene.id}.prompt`)}
                        </p>
                        <div className={styles.sceneMeta}>
                          <span>{t(`scenes.items.${scene.id}.note`)}</span>
                          <span>{t('stage.savedLabel')}</span>
                        </div>
                      </article>
                    ))}
                  </div>

                  {authPanel ? (
                    <aside className={styles.authPanel}>
                      {authPanel}
                      <p className={styles.authNote}>{t('auth.note')}</p>
                    </aside>
                  ) : null}
                </div>
              </div>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionIntro}>
              <p
                className={cn(
                  styles.sectionLabel,
                  isDenseLocale && styles.denseCopy,
                )}
              >
                {t('features.eyebrow')}
              </p>
              <h2 className={styles.sectionTitle}>{t('features.title')}</h2>
              <p className={styles.sectionDescription}>
                {t('features.description')}
              </p>
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

          <section id="workflow" className={styles.section}>
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
              <p className={styles.sectionDescription}>
                {t('workflow.description')}
              </p>
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

          <section id="models" className={styles.section}>
            <div className={styles.sectionIntro}>
              <p
                className={cn(
                  styles.sectionLabel,
                  isDenseLocale && styles.denseCopy,
                )}
              >
                {t('models.eyebrow')}
              </p>
              <h2 className={styles.sectionTitle}>{t('models.title')}</h2>
              <p className={styles.sectionDescription}>
                {t('models.description')}
              </p>
            </div>

            <div className={styles.modelRail}>
              {MODEL_OPTIONS.map((model) => (
                <article key={model.id} className={styles.modelCard}>
                  <div>
                    <div className={styles.modelMeta}>
                      <span
                        className={cn(
                          styles.providerTag,
                          isDenseLocale && styles.denseCopy,
                        )}
                      >
                        {model.provider}
                      </span>
                      <span
                        className={cn(
                          styles.costTag,
                          isDenseLocale && styles.denseCopy,
                        )}
                      >
                        {tCommon('creditCount', { count: model.cost })}
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
          </section>

          <section className={styles.footerBand}>
            <p
              className={cn(
                styles.sectionLabel,
                isDenseLocale && styles.denseCopy,
              )}
            >
              {t('footer.eyebrow')}
            </p>
            <h2 className={styles.footerTitle}>{t('footer.title')}</h2>
            <p className={styles.footerDescription}>
              {t('footer.description')}
            </p>
          </section>
        </main>
      </div>
    </div>
  )
}
