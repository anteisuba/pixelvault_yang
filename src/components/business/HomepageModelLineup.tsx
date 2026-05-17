import { useTranslations } from 'next-intl'

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  AI_MODELS,
  getAvailableModels,
  MODEL_MESSAGE_KEYS,
  type ModelOption,
} from '@/constants/models'

const PROVIDER_LABELS: Record<string, string> = {
  [AI_ADAPTER_TYPES.OPENAI]: 'OpenAI',
  [AI_ADAPTER_TYPES.GEMINI]: 'Google',
  [AI_ADAPTER_TYPES.FAL]: 'fal.ai',
  [AI_ADAPTER_TYPES.RUNWAY]: 'Runway',
  [AI_ADAPTER_TYPES.REPLICATE]: 'Replicate',
  [AI_ADAPTER_TYPES.NOVELAI]: 'NovelAI',
  [AI_ADAPTER_TYPES.VOLCENGINE]: 'VolcEngine',
  [AI_ADAPTER_TYPES.HUGGINGFACE]: 'HuggingFace',
  [AI_ADAPTER_TYPES.FISH_AUDIO]: 'Fish Audio',
}

type PricingUnit = 'image' | 'second' | 'kchars'

interface ModelPrice {
  amount: number
  unit: PricingUnit
}

/**
 * Best-effort USD pricing per model based on each provider's public API rates.
 * Update when providers change pricing — these are reference numbers, not contracts.
 * Sources: fal.ai/models, OpenAI platform pricing, ai.google.dev, NovelAI Anlas, VolcEngine Doubao.
 */
const MODEL_PRICING: Partial<Record<AI_MODELS, ModelPrice>> = {
  // Image — per generated image
  [AI_MODELS.OPENAI_GPT_IMAGE_2]: { amount: 0.04, unit: 'image' },
  [AI_MODELS.GEMINI_PRO_IMAGE]: { amount: 0.039, unit: 'image' },
  [AI_MODELS.GEMINI_FLASH_IMAGE]: { amount: 0.039, unit: 'image' },
  [AI_MODELS.FLUX_2_PRO]: { amount: 0.04, unit: 'image' },
  [AI_MODELS.FLUX_2_DEV]: { amount: 0.025, unit: 'image' },
  [AI_MODELS.FLUX_2_SCHNELL]: { amount: 0.003, unit: 'image' },
  [AI_MODELS.FLUX_2_MAX]: { amount: 0.06, unit: 'image' },
  [AI_MODELS.FLUX_KONTEXT_PRO]: { amount: 0.04, unit: 'image' },
  [AI_MODELS.FLUX_KONTEXT_MAX]: { amount: 0.08, unit: 'image' },
  [AI_MODELS.IDEOGRAM_3]: { amount: 0.06, unit: 'image' },
  [AI_MODELS.RECRAFT_V4_PRO]: { amount: 0.06, unit: 'image' },
  [AI_MODELS.SEEDREAM_45]: { amount: 0.04, unit: 'image' },
  [AI_MODELS.SEEDREAM_50_LITE]: { amount: 0.012, unit: 'image' },
  [AI_MODELS.SEEDREAM_40]: { amount: 0.011, unit: 'image' },
  [AI_MODELS.NOVELAI_V45_FULL]: { amount: 0.012, unit: 'image' },
  [AI_MODELS.NOVELAI_V45_CURATED]: { amount: 0.012, unit: 'image' },
  [AI_MODELS.ILLUSTRIOUS_XL]: { amount: 0.003, unit: 'image' },
  [AI_MODELS.SD_35_LARGE]: { amount: 0.025, unit: 'image' },
  [AI_MODELS.ANIMAGINE_XL_4]: { amount: 0.003, unit: 'image' },

  // Video — per second of generated video
  [AI_MODELS.KLING_V3_PRO]: { amount: 0.3, unit: 'second' },
  [AI_MODELS.VEO_31]: { amount: 0.2, unit: 'second' },
  [AI_MODELS.SEEDANCE_20]: { amount: 0.1, unit: 'second' },
  [AI_MODELS.SEEDANCE_20_FAST]: { amount: 0.06, unit: 'second' },
  [AI_MODELS.SEEDANCE_20_VOLC]: { amount: 0.1, unit: 'second' },
  [AI_MODELS.SEEDANCE_20_FAST_VOLC]: { amount: 0.06, unit: 'second' },
  [AI_MODELS.MINIMAX_VIDEO]: { amount: 0.3, unit: 'second' },
  [AI_MODELS.LUMA_RAY_2]: { amount: 0.2, unit: 'second' },
  [AI_MODELS.RUNWAY_GEN45]: { amount: 0.12, unit: 'second' },
  [AI_MODELS.RUNWAY_GEN4_TURBO]: { amount: 0.05, unit: 'second' },
  [AI_MODELS.WAN_VIDEO]: { amount: 0.05, unit: 'second' },
  [AI_MODELS.HUNYUAN_VIDEO]: { amount: 0.06, unit: 'second' },

  // Audio — per 1,000 characters
  [AI_MODELS.FISH_AUDIO_S2_PRO]: { amount: 0.2, unit: 'kchars' },
  [AI_MODELS.FAL_F5_TTS]: { amount: 0.12, unit: 'kchars' },
}

function formatAmount(amount: number): string {
  if (amount >= 1) return `$${amount.toFixed(2)}`
  if (amount >= 0.01) return `$${amount.toFixed(2)}`
  return `$${amount.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}`
}

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
  formatPrice: (price: ModelPrice) => string
}

function PriceTag({ model, formatPrice }: PriceTagProps) {
  const price = MODEL_PRICING[model.id]
  if (!price) {
    return (
      <span className="homepage-model-price-muted shrink-0 rounded-full px-2.5 py-1 text-xs font-medium">
        —
      </span>
    )
  }
  return (
    <span className="homepage-model-price shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold">
      {formatPrice(price)}
    </span>
  )
}

interface ModelGroupProps {
  label: string
  models: readonly ModelOption[]
  formatPrice: (price: ModelPrice) => string
  tModels: (key: string) => string
}

function ModelGroup({ label, models, formatPrice, tModels }: ModelGroupProps) {
  if (models.length === 0) return null

  return (
    <div>
      <p className="homepage-model-group-label mb-4 text-xs font-semibold uppercase tracking-[0.18em]">
        {label}
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {models.map((model) => {
          const provider =
            PROVIDER_LABELS[model.adapterType] ?? model.adapterType
          return (
            <div key={model.id} className="homepage-model-card">
              <div className="min-w-0 flex-1">
                <p className="homepage-model-card-name truncate font-display font-semibold">
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

  const formatPrice = (price: ModelPrice) => {
    const amountStr = formatAmount(price.amount)
    if (price.unit === 'image') return t('priceImage', { amount: amountStr })
    if (price.unit === 'second') return t('priceSecond', { amount: amountStr })
    return t('priceKChars', { amount: amountStr })
  }

  return (
    <section
      id="models"
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
          {t('description')}
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
      </div>
    </section>
  )
}
