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

import '@/app/homepage.css'

import { HomepageHero } from './HomepageHero'
import { HomepageModels } from './HomepageModels'
import { HomepageShowcaseCard } from './HomepageShowcaseCard'
import { HomepageValueProps } from './HomepageValueProps'
import { HomepageWorkflow } from './HomepageWorkflow'

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
    <div className="homepage">
      <header className="homepage-header sticky top-0 z-20 py-[0.9rem_1rem]">
        <div
          className="mx-auto max-w-content px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4"
        >
          <Link href={HOMEPAGE_ROUTES.home} className="grid gap-[0.18rem] min-w-0">
            <span
              className={cn(
                'text-[0.72rem] font-semibold tracking-[0.2em] uppercase text-primary opacity-75 max-sm:hidden',
                isDenseLocale && 'tracking-normal normal-case',
              )}
            >
              {t('brandLabel')}
            </span>
            <span className="font-display text-[clamp(1.3rem,1.8vw,1.55rem)] font-medium leading-[0.95] tracking-[-0.04em] max-sm:text-[1.08rem] max-sm:whitespace-nowrap">
              {tCommon('brand')}
            </span>
            <span className="max-w-96 font-serif text-base leading-[1.65] text-[var(--home-muted)] text-pretty max-sm:hidden">
              {t('brandSubline')}
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-[1.35rem]" aria-label={t('navigationLabel')}>
            {HOMEPAGE_NAVIGATION.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="homepage-nav-link text-[0.78rem] font-semibold tracking-[0.16em] uppercase text-[var(--home-muted)] transition-colors duration-[180ms] ease-in-out hover:text-foreground focus-visible:text-foreground focus-visible:outline-2 focus-visible:outline-[color-mix(in_oklab,var(--ring)_75%,transparent)] focus-visible:outline-offset-[0.35rem] focus-visible:rounded-sm"
              >
                {t(`navigation.${item.id}`)}
              </Link>
            ))}
          </nav>

          <div className="flex items-center justify-end gap-3 shrink-0 max-sm:gap-2">
            <LocaleSwitcher />

            <Button
              asChild
              variant="outline"
              size="sm"
              className="homepage-utility-btn h-8 px-4 rounded-full text-[0.68rem] font-semibold tracking-[0.16em] uppercase"
            >
              <Link href={utilityActionHref}>{utilityActionLabel}</Link>
            </Button>
          </div>
        </div>
      </header>

      <div
        className="mx-auto max-w-content px-4 sm:px-6 lg:px-8 relative z-[1]"
      >
        <main className="flex flex-col gap-[clamp(3rem,5vw,4.5rem)] max-sm:gap-[clamp(2.25rem,4vw,3rem)]" style={{ paddingBlock: 'clamp(1.5rem, 3vw, 2rem) clamp(3rem, 5vw, 4rem)' }}>
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
          <section id="gallery" className="homepage-border-top grid gap-6 pt-[clamp(2rem,3.5vw,3rem)] scroll-mt-24">
            <MotionReveal>
              <div className="grid gap-[0.65rem] max-w-[42rem]">
                <h2 className="font-display text-[clamp(1.8rem,4vw,3rem)] font-semibold leading-none tracking-[-0.04em] text-balance">
                  {t('stage.title')}
                </h2>
              </div>
            </MotionReveal>

            <MotionStagger staggerMs={120} className="grid gap-4 min-w-0 max-sm:grid-cols-2 md:grid-cols-3">
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

            <div className="pt-1">
              <Button
                asChild
                variant="outline"
                size="lg"
                className="homepage-secondary-btn h-[2.85rem] min-w-48 px-[1.45rem] rounded-full max-sm:w-full max-sm:min-w-0"
              >
                <Link href={HOMEPAGE_ROUTES.gallery}>
                  {t('stage.cta')}
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
          </section>

          <div className="homepage-warm">
            <HomepageValueProps />
          </div>
          <HomepageWorkflow />
          <HomepageModels />

          {/* Footer CTA */}
          <MotionReveal>
            <section className="homepage-border-top grid gap-3 pt-[clamp(2rem,3.5vw,3rem)] max-sm:pb-8">
              <h2 className="max-w-[18ch] font-display text-[clamp(2rem,4vw,3rem)] font-semibold leading-none tracking-[-0.04em] text-balance">
                {t('footer.title')}
              </h2>
              <div className="pt-[0.45rem]">
                <Button asChild size="lg" className="homepage-primary-btn h-[2.85rem] min-w-48 px-[1.45rem] rounded-full max-sm:w-full max-sm:min-w-0">
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
