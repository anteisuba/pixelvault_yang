import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { API_USAGE } from '@/constants/config'
import { cn } from '@/lib/utils'

import { ModelRanking } from '@/components/business/ModelRanking'
import { StudioWorkspace } from '@/components/business/StudioWorkspace'
import { ApiKeyManager } from '@/components/business/ApiKeyManager'
import { ApiKeyDrawerTrigger } from '@/components/business/ApiKeyDrawerTrigger'
import { ApiKeysProvider } from '@/contexts/api-keys-context'
import { getAvailableModels } from '@/constants/models'
import { isCjkLocale, type AppLocale } from '@/i18n/routing'

interface StudioPageProps {
  params: Promise<{ locale: AppLocale }>
}

export async function generateMetadata({
  params,
}: StudioPageProps): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'Metadata' })
  return {
    title: t('studio.title'),
    description: t('studio.description'),
  }
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
        <ApiKeysProvider>
          <section className="editorial-panel">
            <div className="editorial-panel-head">
              <div className="editorial-section-head">
                <span
                  className={cn(
                    'editorial-eyebrow',
                    isDenseLocale && 'tracking-normal normal-case',
                  )}
                >
                  {t('heroEyebrow')}
                </span>
                <h1 className="editorial-section-title">{t('heroTitle')}</h1>
                <p className="editorial-section-copy max-w-3xl">
                  {t('workspaceDescription')}
                </p>
              </div>

              <div className="editorial-panel-meta">
                <div className="flex justify-start lg:justify-end">
                  <ApiKeyDrawerTrigger>
                    <ApiKeyManager />
                  </ApiKeyDrawerTrigger>
                </div>

                <div className="editorial-summary-grid">
                  <article className="editorial-summary-card">
                    <p
                      className={cn(
                        'editorial-summary-label',
                        isDenseLocale && 'tracking-normal normal-case',
                      )}
                    >
                      {t('metrics.modelCoverageLabel')}
                    </p>
                    <p className="editorial-summary-value">
                      {t('metrics.modelCoverageValue', {
                        modelCount: availableModels.length,
                        providerCount,
                      })}
                    </p>
                  </article>

                  <article className="editorial-summary-card">
                    <p
                      className={cn(
                        'editorial-summary-label',
                        isDenseLocale && 'tracking-normal normal-case',
                      )}
                    >
                      {t('metrics.startingCostLabel')}
                    </p>
                    <p className="editorial-summary-value">
                      {t('metrics.startingCostValue', {
                        creditCount: tCommon('creditCount', {
                          count: API_USAGE.DEFAULT_REQUESTS_PER_GENERATION,
                        }),
                      })}
                    </p>
                  </article>

                  <article className="editorial-summary-card">
                    <p
                      className={cn(
                        'editorial-summary-label',
                        isDenseLocale && 'tracking-normal normal-case',
                      )}
                    >
                      {t('metrics.archiveBehaviorLabel')}
                    </p>
                    <p className="editorial-summary-value">
                      {t('metrics.archiveBehaviorValue')}
                    </p>
                  </article>
                </div>
              </div>
            </div>

            <div className="editorial-panel-divider">
              <StudioWorkspace />
            </div>
          </section>

          <section className="editorial-panel">
            <ModelRanking />
          </section>
        </ApiKeysProvider>
      </div>
    </div>
  )
}
