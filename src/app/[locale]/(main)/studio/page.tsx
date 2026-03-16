import { getTranslations } from 'next-intl/server'

import { API_USAGE } from '@/constants/config'
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

  return (
    <div className="editorial-page">
      <div className="editorial-container">
        <section className="editorial-hero">
          <div className="editorial-hero-copy">
            <span
              className={cn(
                'editorial-eyebrow',
                isDenseLocale && 'tracking-normal normal-case',
              )}
            >
              {t('heroEyebrow')}
            </span>

            <h1 className="editorial-title">{t('heroTitle')}</h1>
            <p className="editorial-copy max-w-2xl">{t('heroDescription')}</p>
          </div>

          <div className="editorial-metrics">
            <article className="editorial-metric">
              <p
                className={cn(
                  'editorial-metric-label',
                  isDenseLocale && 'tracking-normal normal-case',
                )}
              >
                {t('metrics.modelCoverageLabel')}
              </p>
              <p className="editorial-metric-value">
                {t('metrics.modelCoverageValue', {
                  modelCount: availableModels.length,
                  providerCount,
                })}
              </p>
            </article>

            <article className="editorial-metric">
              <p
                className={cn(
                  'editorial-metric-label',
                  isDenseLocale && 'tracking-normal normal-case',
                )}
              >
                {t('metrics.startingCostLabel')}
              </p>
              <p className="editorial-metric-value">
                {t('metrics.startingCostValue', {
                  creditCount: tCommon('creditCount', {
                    count: API_USAGE.DEFAULT_REQUESTS_PER_GENERATION,
                  }),
                })}
              </p>
            </article>

            <article className="editorial-metric">
              <p
                className={cn(
                  'editorial-metric-label',
                  isDenseLocale && 'tracking-normal normal-case',
                )}
              >
                {t('metrics.archiveBehaviorLabel')}
              </p>
              <p className="editorial-metric-value">
                {t('metrics.archiveBehaviorValue')}
              </p>
            </article>
          </div>
        </section>

        <ApiKeysProvider>
          <section className="editorial-panel">
            <div className="flex flex-col gap-5 border-b border-border/70 pb-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="editorial-section-head">
                <p
                  className={cn(
                    'editorial-eyebrow',
                    isDenseLocale && 'tracking-normal normal-case',
                  )}
                >
                  {t('workspaceLabel')}
                </p>
                <h2 className="editorial-section-title">
                  {t('workspaceTitle')}
                </h2>
                <p className="editorial-section-copy max-w-3xl">
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
