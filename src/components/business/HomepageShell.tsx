import type { ReactNode } from 'react'

import Link from 'next/link'

import type { LucideIcon } from 'lucide-react'
import { Archive, ArrowRight, ShieldCheck, Sparkles } from 'lucide-react'

import {
  HOMEPAGE_COPY,
  HOMEPAGE_FEATURES,
  HOMEPAGE_NAVIGATION,
  HOMEPAGE_ROUTES,
  HOMEPAGE_SCENES,
  HOMEPAGE_WORKFLOW,
  type HomepageFeatureIcon,
  type HomepageSceneTone,
} from '@/constants/homepage'
import { MODEL_OPTIONS } from '@/constants/models'
import { Button } from '@/components/ui/button'

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

  return (
    <div className={styles.page}>
      <div
        className={`mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8 ${styles.shell}`}
      >
        <header className={styles.header}>
          <Link href={HOMEPAGE_ROUTES.home} className={styles.brandBlock}>
            <span className={styles.brandLabel}>{HOMEPAGE_COPY.label}</span>
            <span className={styles.brandName}>{HOMEPAGE_COPY.brand}</span>
            <span className={styles.brandSubline}>
              {HOMEPAGE_COPY.brandSubline}
            </span>
          </Link>

          <nav
            className={styles.nav}
            aria-label={HOMEPAGE_COPY.navigationLabel}
          >
            {HOMEPAGE_NAVIGATION.map((item) => (
              <Link key={item.href} href={item.href} className={styles.navLink}>
                {item.label}
              </Link>
            ))}
          </nav>

          <Button
            asChild
            variant="outline"
            size="sm"
            className={styles.utilityButton}
          >
            <Link href={utilityActionHref}>{utilityActionLabel}</Link>
          </Button>
        </header>

        <main className={styles.main}>
          <section className={heroClassName}>
            <div className={styles.heroCopy}>
              <p className={styles.eyebrow}>{eyebrow}</p>
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
                  <span className={styles.signalLabel}>
                    {HOMEPAGE_COPY.signalModelCoverageLabel}
                  </span>
                  <span className={styles.signalValue}>
                    {MODEL_OPTIONS.length}{' '}
                    {HOMEPAGE_COPY.signalModelCoverageSuffix} {providerCount}{' '}
                    {HOMEPAGE_COPY.signalModelCoverageTail}
                  </span>
                </div>
                <div className={styles.signalItem}>
                  <span className={styles.signalLabel}>
                    {HOMEPAGE_COPY.signalCreditLabel}
                  </span>
                  <span className={styles.signalValue}>
                    {HOMEPAGE_COPY.signalCreditPrefix} {startingCreditCost}{' '}
                    {HOMEPAGE_COPY.signalCreditSuffix}
                  </span>
                </div>
                <div className={styles.signalItem}>
                  <span className={styles.signalLabel}>
                    {HOMEPAGE_COPY.signalArchiveLabel}
                  </span>
                  <span className={styles.signalValue}>
                    {HOMEPAGE_COPY.signalArchiveValue}
                  </span>
                </div>
              </div>
            </div>

            <div className={styles.stage}>
              <div className={styles.stagePanel}>
                <div className={styles.stageTopline}>
                  <span className={styles.stageLabel}>
                    {HOMEPAGE_COPY.stageLabel}
                  </span>
                  <span className={styles.stageValue}>
                    {HOMEPAGE_COPY.stageValue}
                  </span>
                </div>

                <div className={stageContentClassName}>
                  <div className={styles.sceneGrid}>
                    {HOMEPAGE_SCENES.map((scene) => (
                      <article
                        key={scene.label}
                        className={`${styles.sceneCard} ${sceneToneClasses[scene.tone]}`}
                      >
                        <span className={styles.sceneTag}>{scene.label}</span>
                        <p className={styles.scenePrompt}>{scene.prompt}</p>
                        <div className={styles.sceneMeta}>
                          <span>{scene.note}</span>
                          <span>{HOMEPAGE_COPY.sceneSavedLabel}</span>
                        </div>
                      </article>
                    ))}
                  </div>

                  {authPanel ? (
                    <aside className={styles.authPanel}>
                      {authPanel}
                      <p className={styles.authNote}>
                        {HOMEPAGE_COPY.authNote}
                      </p>
                    </aside>
                  ) : null}
                </div>
              </div>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionIntro}>
              <p className={styles.sectionLabel}>
                {HOMEPAGE_COPY.featuresEyebrow}
              </p>
              <h2 className={styles.sectionTitle}>
                {HOMEPAGE_COPY.featuresTitle}
              </h2>
              <p className={styles.sectionDescription}>
                {HOMEPAGE_COPY.featuresDescription}
              </p>
            </div>

            <div className={styles.featureGrid}>
              {HOMEPAGE_FEATURES.map((feature) => {
                const FeatureIcon = featureIcons[feature.icon]

                return (
                  <article key={feature.title} className={styles.featureItem}>
                    <div className={styles.featureHeader}>
                      <span className={styles.featureIcon}>
                        <FeatureIcon className="size-5" />
                      </span>
                      <h3 className={styles.featureTitle}>{feature.title}</h3>
                    </div>
                    <p className={styles.featureDescription}>
                      {feature.description}
                    </p>
                  </article>
                )
              })}
            </div>
          </section>

          <section id="workflow" className={styles.section}>
            <div className={styles.sectionIntro}>
              <p className={styles.sectionLabel}>
                {HOMEPAGE_COPY.workflowEyebrow}
              </p>
              <h2 className={styles.sectionTitle}>
                {HOMEPAGE_COPY.workflowTitle}
              </h2>
              <p className={styles.sectionDescription}>
                {HOMEPAGE_COPY.workflowDescription}
              </p>
            </div>

            <div className={styles.workflowGrid}>
              {HOMEPAGE_WORKFLOW.map((item) => (
                <article key={item.step} className={styles.workflowItem}>
                  <span className={styles.workflowStep}>{item.step}</span>
                  <h3 className={styles.workflowTitle}>{item.title}</h3>
                  <p className={styles.workflowDescription}>
                    {item.description}
                  </p>
                </article>
              ))}
            </div>
          </section>

          <section id="models" className={styles.section}>
            <div className={styles.sectionIntro}>
              <p className={styles.sectionLabel}>
                {HOMEPAGE_COPY.modelsEyebrow}
              </p>
              <h2 className={styles.sectionTitle}>
                {HOMEPAGE_COPY.modelsTitle}
              </h2>
              <p className={styles.sectionDescription}>
                {HOMEPAGE_COPY.modelsDescription}
              </p>
            </div>

            <div className={styles.modelRail}>
              {MODEL_OPTIONS.map((model) => (
                <article key={model.id} className={styles.modelCard}>
                  <div>
                    <div className={styles.modelMeta}>
                      <span className={styles.providerTag}>
                        {model.provider}
                      </span>
                      <span className={styles.costTag}>
                        {model.cost} credit{model.cost === 1 ? '' : 's'}
                      </span>
                    </div>
                    <h3 className={styles.modelTitle}>{model.label}</h3>
                  </div>

                  <p className={styles.modelDescription}>{model.description}</p>
                </article>
              ))}
            </div>
          </section>

          <section className={styles.footerBand}>
            <p className={styles.sectionLabel}>{HOMEPAGE_COPY.footerEyebrow}</p>
            <h2 className={styles.footerTitle}>{HOMEPAGE_COPY.footerTitle}</h2>
            <p className={styles.footerDescription}>
              {HOMEPAGE_COPY.footerDescription}
            </p>
          </section>
        </main>
      </div>
    </div>
  )
}
