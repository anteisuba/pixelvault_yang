'use client'

import { useState } from 'react'

import { ChevronDown, ChevronUp } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { getProviderLabel } from '@/constants/providers'
import {
  formatHomepageReferencePriceAmount,
  HOMEPAGE_MODEL_COUNT_VALUES,
  HOMEPAGE_MODEL_GROUP_PREVIEW_COUNT,
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
  limit?: number
}

function ModelGroup({
  label,
  models,
  formatPrice,
  tModels,
  limit,
}: ModelGroupProps) {
  if (models.length === 0) return null

  const shown = typeof limit === 'number' ? models.slice(0, limit) : models

  return (
    <div>
      <p className="homepage-model-group-label mb-4 text-xs font-semibold uppercase tracking-[0.18em]">
        {label}
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {shown.map((model) => {
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
  const [expanded, setExpanded] = useState(false)

  const available = getAvailableModels()
  const imageModels = available.filter((m) => m.outputType === 'IMAGE')
  const videoModels = available.filter((m) => m.outputType === 'VIDEO')
  const audioModels = available.filter((m) => m.outputType === 'AUDIO')
  const model3dModels = available.filter((m) => m.outputType === 'MODEL_3D')

  const limit = expanded ? undefined : HOMEPAGE_MODEL_GROUP_PREVIEW_COUNT

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
          limit={limit}
        />
        <ModelGroup
          label={t('groups.video')}
          models={videoModels}
          formatPrice={formatPrice}
          tModels={tModels}
          limit={limit}
        />
        <ModelGroup
          label={t('groups.audio')}
          models={audioModels}
          formatPrice={formatPrice}
          tModels={tModels}
          limit={limit}
        />
        <ModelGroup
          label={t('groups.model3d')}
          models={model3dModels}
          formatPrice={formatPrice}
          tModels={tModels}
          limit={limit}
        />
      </div>

      <div className="mt-10 flex justify-center">
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="homepage-model-toggle inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold"
          aria-expanded={expanded}
        >
          {expanded
            ? t('collapse')
            : t('expandAll', { count: HOMEPAGE_MODEL_COUNT_VALUES.count })}
          {expanded ? (
            <ChevronUp className="size-4" aria-hidden="true" />
          ) : (
            <ChevronDown className="size-4" aria-hidden="true" />
          )}
        </button>
      </div>
    </section>
  )
}
