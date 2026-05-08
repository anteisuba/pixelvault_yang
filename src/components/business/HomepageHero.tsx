'use client'

import { ArrowRight, Images } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'

import { getAvailableModels, groupModelsByProvider } from '@/constants/models'
import { isCjkLocale } from '@/i18n/routing'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'

import { HomepageHeroVisual } from './HomepageHeroVisual'

interface HomepageHeroProps {
  primaryActionHref: string
  primaryActionLabel: string
  galleryActionHref: string
  galleryActionLabel: string
}

export function HomepageHero({
  primaryActionHref,
  primaryActionLabel,
  galleryActionHref,
  galleryActionLabel,
}: HomepageHeroProps) {
  const locale = useLocale()
  const isDenseLocale = isCjkLocale(locale)
  const t = useTranslations('Homepage')
  const availableModels = getAvailableModels()
  const providerCount = groupModelsByProvider(availableModels).length
  const imageModelCount = availableModels.filter(
    (model) => model.outputType === 'IMAGE',
  ).length

  return (
    <section
      className="homepage-hero-grid grid items-center gap-10 lg:grid-cols-[minmax(0,0.86fr)_minmax(25rem,0.78fr)] lg:gap-[clamp(4rem,7vw,7rem)]"
      style={{
        minHeight: 'min(54rem, calc(100vh - 6rem))',
      }}
    >
      <HomepageHeroVisual />

      <div className="max-w-[39rem] max-lg:order-first">
        <p
          className={cn(
            'animate-fade-in-up font-display text-xs font-semibold uppercase tracking-widest text-foreground/50',
            isDenseLocale && 'tracking-normal normal-case',
          )}
          style={{ animationDuration: '500ms', animationFillMode: 'both' }}
        >
          {t('hero.badge', { count: imageModelCount })}
        </p>
        <h1
          className={cn(
            'mt-5 animate-fade-in-up break-words font-display text-[clamp(3.2rem,8.5vw,6.6rem)] font-semibold leading-[0.92] tracking-[-0.07em] text-foreground text-balance',
            isDenseLocale && 'tracking-normal',
          )}
          style={{
            animationDuration: '500ms',
            animationDelay: '90ms',
            animationFillMode: 'both',
          }}
        >
          {t('hero.title')}
        </h1>
        <p
          className="mt-6 max-w-[34rem] animate-fade-in-up font-serif text-[clamp(1.05rem,1.4vw,1.28rem)] leading-8 text-[var(--home-muted)] text-pretty"
          style={{
            animationDuration: '500ms',
            animationDelay: '170ms',
            animationFillMode: 'both',
          }}
        >
          {t('hero.description')}
        </p>

        <div
          className="homepage-hero-stats mt-6 grid grid-cols-3 overflow-hidden rounded-2xl"
          style={{
            animationDuration: '500ms',
            animationDelay: '230ms',
            animationFillMode: 'both',
          }}
        >
          <div>
            <span>{availableModels.length}</span>
            <p>{t('hero.stats.models')}</p>
          </div>
          <div>
            <span>{providerCount}</span>
            <p>{t('hero.stats.providers')}</p>
          </div>
          <div>
            <span>4</span>
            <p>{t('hero.stats.workflows')}</p>
          </div>
        </div>

        <div
          className="flex flex-wrap gap-3 pt-8 max-sm:flex-col animate-fade-in-up"
          style={{
            animationDuration: '500ms',
            animationDelay: '300ms',
            animationFillMode: 'both',
          }}
        >
          <Button
            asChild
            size="lg"
            className="homepage-primary-btn h-12 min-w-44 rounded-full px-6 text-sm font-semibold max-sm:w-full"
          >
            <Link href={primaryActionHref}>
              {primaryActionLabel}
              <ArrowRight className="size-4" />
            </Link>
          </Button>

          <Button
            asChild
            size="lg"
            variant="outline"
            className="homepage-secondary-btn h-12 min-w-44 rounded-full px-6 text-sm font-semibold max-sm:w-full"
          >
            <Link href={galleryActionHref}>
              <Images className="size-4" />
              {galleryActionLabel}
            </Link>
          </Button>
        </div>
      </div>
    </section>
  )
}
