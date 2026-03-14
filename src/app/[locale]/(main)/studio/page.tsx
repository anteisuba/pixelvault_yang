import { getTranslations } from 'next-intl/server'

import { cn } from '@/lib/utils'

import { GenerateForm } from '@/components/business/GenerateForm'
import { ApiKeyManager } from '@/components/business/ApiKeyManager'
import { ApiKeyDrawerTrigger } from '@/components/business/ApiKeyDrawerTrigger'
import { ApiKeysProvider } from '@/contexts/api-keys-context'
import { getAvailableModels } from '@/constants/models'
import { isCjkLocale, type AppLocale } from '@/i18n/routing'

interface StudioPageProps {
  params: Promise<{ locale: AppLocale }>
}

export default async function StudioPage({ params }: StudioPageProps) {
  const { locale } = await params
  const isDenseLocale = isCjkLocale(locale)
  const t = await getTranslations({
    locale,
    namespace: 'StudioPage',
  })
  const tCommon = await getTranslations({
    locale,
    namespace: 'Common',
  })
  const availableModels = getAvailableModels()
  const providerCount = new Set(
    availableModels.map((model) => model.adapterType),
  ).size
  const startingCreditCost = availableModels.reduce(
    (lowestCost, model) => Math.min(lowestCost, model.cost),
    availableModels[0]?.cost ?? 0,
  )

  return (
    <div className="relative overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_top_right,_color-mix(in_oklab,var(--chart-4)_18%,transparent),transparent_55%),radial-gradient(circle_at_left,_color-mix(in_oklab,var(--chart-2)_14%,transparent),transparent_45%)]" />

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-16 pt-8 sm:px-6 sm:pb-20 sm:pt-10 lg:px-8">
        <section className="relative overflow-hidden rounded-[2.25rem] border border-border/70 bg-card/95 p-6 shadow-sm sm:p-8 lg:p-10">
          <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/3 bg-[linear-gradient(135deg,_transparent,_color-mix(in_oklab,var(--chart-1)_10%,transparent))] xl:block" />

          <div className="relative grid gap-8 xl:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.85fr)] xl:items-start">
            <div className="space-y-6">
              <div className="space-y-4">
                <span
                  className={cn(
                    'inline-flex rounded-full border border-border/70 bg-secondary/70 px-3 py-1 text-xs font-semibold text-foreground',
                    isDenseLocale
                      ? 'tracking-normal normal-case'
                      : 'uppercase tracking-wider',
                  )}
                >
                  {t('heroEyebrow')}
                </span>

                <div className="space-y-2">
                  <h1 className="font-display max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
                    {t('heroTitle')}
                  </h1>
                  <p className="max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
                    {t('heroDescription')}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              <article className="rounded-[1.5rem] border border-border/70 bg-background/80 p-4 backdrop-blur-sm">
                <p
                  className={cn(
                    'text-xs font-semibold text-muted-foreground',
                    isDenseLocale
                      ? 'tracking-normal normal-case'
                      : 'uppercase tracking-wider',
                  )}
                >
                  {t('metrics.modelCoverageLabel')}
                </p>
                <p className="mt-2 text-sm font-medium leading-6 text-foreground">
                  {t('metrics.modelCoverageValue', {
                    modelCount: availableModels.length,
                    providerCount,
                  })}
                </p>
              </article>

              <article className="rounded-[1.5rem] border border-border/70 bg-background/80 p-4 backdrop-blur-sm">
                <p
                  className={cn(
                    'text-xs font-semibold text-muted-foreground',
                    isDenseLocale
                      ? 'tracking-normal normal-case'
                      : 'uppercase tracking-wider',
                  )}
                >
                  {t('metrics.startingCostLabel')}
                </p>
                <p className="mt-2 text-sm font-medium leading-6 text-foreground">
                  {t('metrics.startingCostValue', {
                    creditCount: tCommon('creditCount', {
                      count: startingCreditCost,
                    }),
                  })}
                </p>
              </article>

              <article className="rounded-[1.5rem] border border-border/70 bg-background/80 p-4 backdrop-blur-sm">
                <p
                  className={cn(
                    'text-xs font-semibold text-muted-foreground',
                    isDenseLocale
                      ? 'tracking-normal normal-case'
                      : 'uppercase tracking-wider',
                  )}
                >
                  {t('metrics.archiveBehaviorLabel')}
                </p>
                <p className="mt-2 text-sm font-medium leading-6 text-foreground">
                  {t('metrics.archiveBehaviorValue')}
                </p>
              </article>
            </div>
          </div>
        </section>

        <ApiKeysProvider>
          <section className="rounded-[2rem] border border-border/70 bg-card/95 p-5 shadow-sm sm:p-6 lg:p-7">
            <div className="flex flex-col gap-5 border-b border-border/70 pb-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-2">
                <p
                  className={cn(
                    'text-xs font-semibold text-muted-foreground',
                    isDenseLocale
                      ? 'tracking-normal normal-case'
                      : 'uppercase tracking-wider',
                  )}
                >
                  {t('workspaceLabel')}
                </p>
                <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                  {t('workspaceTitle')}
                </h2>
                <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                  {t('workspaceDescription')}
                </p>
              </div>
              <div className="flex shrink-0 items-start">
                <ApiKeyDrawerTrigger>
                  <ApiKeyManager />
                </ApiKeyDrawerTrigger>
              </div>
            </div>

            <div className="pt-6">
              <GenerateForm />
            </div>
          </section>
        </ApiKeysProvider>
      </div>
    </div>
  )
}
