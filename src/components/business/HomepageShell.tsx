import { ArrowRight } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { HOMEPAGE_ROUTES } from '@/constants/homepage'
import { LocaleSwitcher } from '@/components/layout/LocaleSwitcher'
import { BlurFade } from '@/components/ui/blur-fade'
import { HyperText } from '@/components/ui/hyper-text'
import { Button } from '@/components/ui/button'
import { Particles } from '@/components/ui/particles'
import { ShinyButton } from '@/components/ui/shiny-button'
import { Link } from '@/i18n/navigation'

import '@/app/homepage.css'

import { HomepageHero } from './HomepageHero'
import { HomepageModels } from './HomepageModels'

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
  const t = useTranslations('Homepage')
  const tCommon = useTranslations('Common')
  void eyebrow
  void title
  void description

  return (
    <div className="homepage relative">
      <Particles
        className="fixed inset-0 z-[1]"
        quantity={180}
        staticity={30}
        ease={40}
        size={2}
        color="#c4653f"
      />
      <header className="homepage-header sticky top-0 z-20 py-[0.9rem_1rem]">
        <div className="mx-auto max-w-content px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
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

          <div className="flex items-center justify-end gap-3 shrink-0 max-sm:gap-2">
            <LocaleSwitcher />

            <Link href={utilityActionHref}>
              <ShinyButton className="h-9 rounded-full border-border/80 px-5">
                {utilityActionLabel}
              </ShinyButton>
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-content px-4 sm:px-6 lg:px-8 relative z-[2]">
        <main
          className="flex flex-col gap-[clamp(3rem,5vw,4.5rem)] max-sm:gap-[clamp(2.25rem,4vw,3rem)]"
          style={{
            paddingBlock: 'clamp(1.5rem, 3vw, 2rem) clamp(3rem, 5vw, 4rem)',
          }}
        >
          <HomepageHero
            primaryActionHref={primaryActionHref}
            primaryActionLabel={primaryActionLabel}
            secondaryActionHref={secondaryActionHref}
            secondaryActionLabel={secondaryActionLabel}
            galleryActionHref={HOMEPAGE_ROUTES.gallery}
            galleryActionLabel={t('stage.cta')}
          />

          <HomepageValueProps />
          <HomepageWorkflow />
          <HomepageModels />

          {/* Footer CTA */}
          <BlurFade inView>
            <section className="homepage-border-top grid gap-3 pt-[clamp(2rem,3.5vw,3rem)] max-sm:pb-8">
              <h2 className="max-w-[18ch] font-display text-[clamp(2rem,4vw,3rem)] font-semibold leading-none tracking-[-0.04em] text-balance">
                {t('footer.title')}
              </h2>
              <div className="pt-[0.45rem]">
                <Button
                  asChild
                  size="lg"
                  className="homepage-primary-btn h-[2.85rem] min-w-48 px-[1.45rem] rounded-full max-sm:w-full max-sm:min-w-0"
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
