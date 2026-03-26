import { ArrowRight } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'

import {
  HOMEPAGE_NAVIGATION,
  HOMEPAGE_ROUTES,
  HOMEPAGE_SCENES,
} from '@/constants/homepage'
import { LocaleSwitcher } from '@/components/layout/LocaleSwitcher'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import { isCjkLocale } from '@/i18n/routing'
import { cn } from '@/lib/utils'

import { HomepageComparison } from './HomepageComparison'
import { HomepageFeatures } from './HomepageFeatures'
import { HomepageHero } from './HomepageHero'
import { HomepageModels } from './HomepageModels'
import { HomepageSceneCard } from './HomepageSceneCard'
import { HomepageWorkflow } from './HomepageWorkflow'
import styles from './HomepageShell.module.css'

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
}: HomepageShellProps) {
  const locale = useLocale()
  const isDenseLocale = isCjkLocale(locale)
  const t = useTranslations('Homepage')
  const tCommon = useTranslations('Common')

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div
          className={`mx-auto max-w-content px-4 sm:px-6 lg:px-8 ${styles.headerInner}`}
        >
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
            <span className={styles.brandSubline}>{t('brandSubline')}</span>
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
        </div>
      </header>

      <div
        className={`mx-auto max-w-content px-4 sm:px-6 lg:px-8 ${styles.shell}`}
      >
        <main className={styles.main}>
          <HomepageHero
            eyebrow={eyebrow}
            title={title}
            description={description}
            primaryActionHref={primaryActionHref}
            primaryActionLabel={primaryActionLabel}
            secondaryActionHref={secondaryActionHref}
            secondaryActionLabel={secondaryActionLabel}
          />

          {/* Gallery Preview */}
          <section id="gallery" className={styles.galleryPreview}>
            <div className={styles.galleryPreviewHead}>
              <p
                className={cn(
                  styles.sectionLabel,
                  isDenseLocale && styles.denseCopy,
                )}
              >
                {t('stage.label')}
              </p>
              <h2 className={styles.galleryPreviewTitle}>{t('stage.title')}</h2>
              <p className={styles.galleryPreviewDesc}>{t('stage.value')}</p>
            </div>

            <div className={styles.sceneGrid}>
              {HOMEPAGE_SCENES.map((scene) => (
                <HomepageSceneCard
                  key={scene.id}
                  sceneId={scene.id}
                  modelId={scene.modelId}
                  tone={scene.tone}
                />
              ))}
            </div>

            <div className={styles.galleryPreviewActions}>
              <Button
                asChild
                variant="outline"
                size="lg"
                className={styles.secondaryButton}
              >
                <Link href={HOMEPAGE_ROUTES.gallery}>
                  {t('stage.cta')}
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
          </section>

          <HomepageFeatures />
          <HomepageComparison />
          <HomepageWorkflow />
          <HomepageModels />

          {/* Footer CTA */}
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
            <div className={styles.footerActions}>
              <Button asChild size="lg" className={styles.primaryButton}>
                <Link href={primaryActionHref}>
                  {primaryActionLabel}
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}
