import { ArrowRight } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { HOMEPAGE_NAVIGATION, HOMEPAGE_ROUTES } from '@/constants/homepage'
import { ROUTES } from '@/constants/routes'
import { LocaleSwitcher } from '@/components/layout/LocaleSwitcher'
import { BlurFade } from '@/components/ui/blur-fade'
import { Button } from '@/components/ui/button'
import { HyperText } from '@/components/ui/hyper-text'
import { Link } from '@/i18n/navigation'

import '@/app/homepage.css'

import { HomepageHero } from './HomepageHero'
import { HomepageModels } from './HomepageModels'

import { HomepageValueProps } from './HomepageValueProps'
import { HomepageWorkflow } from './HomepageWorkflow'

interface HomepageShellProps {
  primaryActionHref: string
  primaryActionLabel: string
  utilityActionHref: string
  utilityActionLabel: string
}

export function HomepageShell({
  primaryActionHref,
  primaryActionLabel,
  utilityActionHref,
  utilityActionLabel,
}: HomepageShellProps) {
  const t = useTranslations('Homepage')
  const tCommon = useTranslations('Common')

  return (
    <div className="homepage relative isolate">
      <header className="homepage-header sticky top-0 z-30 py-3">
        <div className="mx-auto flex max-w-content items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link href={HOMEPAGE_ROUTES.home} className="min-w-0">
            <HyperText
              as="span"
              duration={600}
              animateOnHover
              startOnView
              className="font-display text-[clamp(1.4rem,2vw,1.7rem)] font-bold leading-none tracking-[-0.03em] max-sm:text-[1.2rem] !py-0"
            >
              {tCommon('brand')}
            </HyperText>
          </Link>

          <nav
            aria-label={t('navigationLabel')}
            className="hidden items-center gap-7 lg:flex"
          >
            {HOMEPAGE_NAVIGATION.map((item) => {
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className="homepage-nav-link font-display text-sm font-semibold text-foreground/78 transition-colors hover:text-foreground"
                >
                  {t(`navigation.${item.id}`)}
                </Link>
              )
            })}
          </nav>

          <div className="flex shrink-0 items-center justify-end gap-3 max-sm:gap-2">
            <LocaleSwitcher />

            <Button
              asChild
              variant="outline"
              className="homepage-utility-btn h-10 rounded-full px-5 font-display text-sm font-semibold"
            >
              <Link href={utilityActionHref}>{utilityActionLabel}</Link>
            </Button>
          </div>
        </div>
      </header>

      <div className="relative z-[2] mx-auto max-w-content px-4 sm:px-6 lg:px-8">
        <main
          className="flex flex-col gap-[clamp(5rem,8vw,7.5rem)] max-sm:gap-[clamp(3.5rem,6vw,4.5rem)]"
          style={{
            paddingBlock: 'clamp(4rem, 7vw, 7rem) clamp(3rem, 5vw, 4.5rem)',
          }}
        >
          <HomepageHero
            primaryActionHref={primaryActionHref}
            primaryActionLabel={primaryActionLabel}
            galleryActionHref={ROUTES.GALLERY}
            galleryActionLabel={t('hero.secondaryCta')}
          />

          <HomepageValueProps />
          <HomepageWorkflow />
          <HomepageModels />

          <BlurFade inView>
            <section className="homepage-final-cta grid gap-5 rounded-[2rem] p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
              <div className="grid gap-3">
                <p className="font-display text-xs font-semibold uppercase tracking-widest text-foreground/48">
                  {t('footer.eyebrow')}
                </p>
                <h2 className="max-w-[18ch] font-display text-[clamp(2.3rem,5vw,4.7rem)] font-semibold leading-[0.95] tracking-[-0.06em] text-balance">
                  {t('footer.title')}
                </h2>
                <p className="max-w-[36rem] font-serif text-base leading-7 text-[var(--home-muted)]">
                  {t('footer.description')}
                </p>
              </div>
              <div>
                <Button
                  asChild
                  size="lg"
                  className="homepage-primary-btn h-12 min-w-48 rounded-full px-6 max-sm:w-full max-sm:min-w-0"
                >
                  <Link href={primaryActionHref}>
                    {primaryActionLabel}
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </div>
            </section>
          </BlurFade>
        </main>
      </div>
    </div>
  )
}
