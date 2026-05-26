import { useTranslations } from 'next-intl'

import { getProviderLabel } from '@/constants/providers'
import {
  formatHomepageReferencePriceAmount,
  HOMEPAGE_MODEL_COUNT_VALUES,
  HOMEPAGE_MODEL_REFERENCE_PRICES,
  type HomepageModelReferencePrice,
} from '@/constants/homepage'
import {
  getAvailableModels,
  MODEL_MESSAGE_KEYS,
  type ModelOption,
} from '@/constants/models'

function resolveModelLabel(
  model: ModelOption,
  tModels: (key: string) => string,
): string {
  const messageKey = MODEL_MESSAGE_KEYS[model.id]
  if (!messageKey) return model.id
  const labelKey = `${messageKey}.label`
  const value = tModels(labelKey)
  return value === labelKey ? model.id : value
}

interface PriceTagProps {
  model: ModelOption
  formatPrice: (price: HomepageModelReferencePrice) => string
}

function PriceTag({ model, formatPrice }: PriceTagProps) {
  const price = HOMEPAGE_MODEL_REFERENCE_PRICES[model.id]
  if (!price) return null

  return (
    <span className="homepage-model-price shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold">
      {formatPrice(price)}
    </span>
  )
}

interface ModelGroupProps {
  label: string
  models: readonly ModelOption[]
  formatPrice: (price: HomepageModelReferencePrice) => string
  tModels: (key: string) => string
}

function ModelGroup({ label, models, formatPrice, tModels }: ModelGroupProps) {
  if (models.length === 0) return null

  return (
    <div>
      <p className="homepage-model-group-label mb-4 text-xs font-semibold uppercase tracking-[0.18em]">
        {label}
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {models.map((model) => {
          const provider = getProviderLabel(model.providerConfig)
          return (
            <div key={model.id} className="homepage-model-card">
              <div className="min-w-0 flex-1">
                <p className="homepage-model-card-name font-display font-semibold">
                  {resolveModelLabel(model, tModels)}
                </p>
                <p className="homepage-model-card-provider truncate text-xs">
                  {provider}
                </p>
              </div>
              <PriceTag model={model} formatPrice={formatPrice} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function HomepageModelLineup() {
  const t = useTranslations('Homepage.modelLineup')
  const tModels = useTranslations('Models')

  const available = getAvailableModels()
  const imageModels = available.filter((m) => m.outputType === 'IMAGE')
  const videoModels = available.filter((m) => m.outputType === 'VIDEO')
  const audioModels = available.filter((m) => m.outputType === 'AUDIO')
  const model3dModels = available.filter((m) => m.outputType === 'MODEL_3D')

  const formatPrice = (price: HomepageModelReferencePrice) => {
    const amountStr = formatHomepageReferencePriceAmount(price.amount)
    if (price.unit === 'image') return t('priceImage', { amount: amountStr })
    if (price.unit === 'second') return t('priceSecond', { amount: amountStr })
    return t('priceKChars', { amount: amountStr })
  }

  return (
    <section
      id="models"
      data-homepage-reveal
      className="homepage-model-lineup scroll-mt-24"
      aria-labelledby="homepage-model-lineup-title"
    >
      <div className="mx-auto max-w-2xl text-center">
        <h2
          id="homepage-model-lineup-title"
          className="homepage-feature-title font-display font-bold text-foreground text-balance"
        >
          {t('title')}
        </h2>
        <p className="homepage-feature-copy mt-6 font-display font-medium text-[var(--home-muted)] text-balance">
          {t('description', HOMEPAGE_MODEL_COUNT_VALUES)}
        </p>
      </div>

      <div className="mt-14 space-y-12">
        <ModelGroup
          label={t('groups.image')}
          models={imageModels}
          formatPrice={formatPrice}
          tModels={tModels}
        />
        <ModelGroup
          label={t('groups.video')}
          models={videoModels}
          formatPrice={formatPrice}
          tModels={tModels}
        />
        <ModelGroup
          label={t('groups.audio')}
          models={audioModels}
          formatPrice={formatPrice}
          tModels={tModels}
        />
        <ModelGroup
          label={t('groups.model3d')}
          models={model3dModels}
          formatPrice={formatPrice}
          tModels={tModels}
        />
      </div>
    </section>
  )
}
