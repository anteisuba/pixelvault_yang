import { ArrowRight } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'

import {
  HOMEPAGE_NAVIGATION,
  HOMEPAGE_ROUTES,
  HOMEPAGE_SHOWCASE,
} from '@/constants/homepage'
import { LocaleSwitcher } from '@/components/layout/LocaleSwitcher'
import { Button } from '@/components/ui/button'
import {
  MotionReveal,
  MotionStagger,
  MotionStaggerItem,
} from '@/components/ui/motion-reveal'
import { Link } from '@/i18n/navigation'
import { isCjkLocale } from '@/i18n/routing'
import { cn } from '@/lib/utils'

import { HomepageHero } from './HomepageHero'
import { HomepageModels } from './HomepageModels'
import { HomepageShowcaseCard } from './HomepageShowcaseCard'
import { HomepageValueProps } from './HomepageValueProps'
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
            <MotionReveal>
              <div className={styles.galleryPreviewHead}>
                <h2 className={styles.galleryPreviewTitle}>
                  {t('stage.title')}
                </h2>
              </div>
            </MotionReveal>

            <MotionStagger staggerMs={120} className={styles.showcaseGrid}>
              {HOMEPAGE_SHOWCASE.map((item) => (
                <MotionStaggerItem key={item.id}>
                  <HomepageShowcaseCard
                    src={item.src}
                    model={item.model}
                    prompt={t(
                      `scenes.items.${item.id}.prompt` as Parameters<
                        typeof t
                      >[0],
                      { defaultValue: item.model },
                    )}
                  />
                </MotionStaggerItem>
              ))}
            </MotionStagger>

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

          <div className={styles.sectionWarm}>
            <HomepageValueProps />
          </div>
          <HomepageWorkflow />
          <HomepageModels />

          {/* Footer CTA */}
          <MotionReveal>
            <section className={styles.footerBand}>
              <h2 className={styles.footerTitle}>{t('footer.title')}</h2>
              <div className={styles.footerActions}>
                <Button asChild size="lg" className={styles.primaryButton}>
                  <Link href={primaryActionHref}>
                    {primaryActionLabel}
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </div>
            </section>
          </MotionReveal>
        </main>
      </div>
    </div>
  )
}
