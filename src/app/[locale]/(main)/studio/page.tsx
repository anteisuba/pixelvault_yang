import { getTranslations } from 'next-intl/server'

import { cn } from '@/lib/utils'

import { GenerateForm } from '@/components/business/GenerateForm'
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
  const providerCount = new Set(availableModels.map((model) => model.provider))
    .size
  const startingCreditCost = availableModels.reduce(
    (lowestCost, model) => Math.min(lowestCost, model.cost),
    availableModels[0]?.cost ?? 0,
  )

  return (
    <div className="bg-gradient-to-b from-secondary/25 via-background to-background">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pb-16 pt-8 sm:px-6 sm:pb-20 sm:pt-10 lg:px-8">
        <section className="rounded-3xl border bg-card p-6 shadow-sm sm:p-8">
          <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
            <div className="space-y-6 lg:col-span-2">
              <div className="space-y-4">
                <span
                  className={cn(
                    'inline-flex rounded-full border bg-secondary/70 px-3 py-1 text-xs font-semibold text-foreground',
                    isDenseLocale
                      ? 'tracking-normal normal-case'
                      : 'uppercase tracking-wider',
                  )}
                >
                  {t('heroEyebrow')}
                </span>

                <div className="space-y-2">
                  <h1 className="font-display max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
                    {t('heroTitle')}
                  </h1>
                  <p className="max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
                    {t('heroDescription')}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <article className="rounded-2xl border bg-secondary/20 p-4">
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

              <article className="rounded-2xl border bg-secondary/20 p-4">
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

              <article className="rounded-2xl border bg-secondary/20 p-4">
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

        <section className="rounded-3xl border bg-card p-5 shadow-sm sm:p-6">
          <div className="space-y-2 border-b pb-4">
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
            <h2 className="font-display text-2xl font-semibold tracking-tight">
              {t('workspaceTitle')}
            </h2>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              {t('workspaceDescription')}
            </p>
          </div>

          <div className="pt-5">
            <GenerateForm />
          </div>
        </section>
      </div>
    </div>
  )
}
