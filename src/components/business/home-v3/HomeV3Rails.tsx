import { useTranslations } from 'next-intl'

import {
  HomeV3ModelRail,
  type HomeV3ModelDetailLabels,
} from '@/components/business/home-v3/HomeV3ModelRail'
import { AUDIO_KIND } from '@/constants/audio-options'
import {
  getHomeV3ModelCover,
  HOME_V3_RAIL_ARROW_MIN,
  HOME_V3_RAIL_GROUPS,
  isHomeV3ModelBrandCover,
} from '@/constants/home-v3'
import {
  formatHomepageReferencePriceAmount,
  HOMEPAGE_MODEL_COUNTS,
  HOMEPAGE_MODEL_REFERENCE_PRICES,
} from '@/constants/homepage'
import {
  getAvailableModels,
  MODEL_MESSAGE_KEYS,
  type ModelOption,
} from '@/constants/models'
import { getProviderLabel } from '@/constants/providers'

const AVAILABLE = getAvailableModels()

type ModelAdvantageKey =
  | 'premiumQuality'
  | 'balancedQuality'
  | 'fastValue'
  | 'freeTier'
  | 'imageGeneration'
  | 'videoGeneration'
  | 'photorealistic'
  | 'anime'
  | 'design'
  | 'artistic'
  | 'versatile'
  | 'lora'
  | 'imageToVideo'
  | 'referenceInput'
  | 'nativeAudio'
  | 'speech'
  | 'soundEffects'
  | 'imageTo3d'
  | 'glbOutput'

function modelAdvantageKeys(model: ModelOption): ModelAdvantageKey[] {
  const keys: ModelAdvantageKey[] = []
  const add = (key: ModelAdvantageKey) => {
    if (!keys.includes(key)) keys.push(key)
  }

  if (model.freeTier) add('freeTier')
  if (model.qualityTier === 'premium') add('premiumQuality')
  if (model.qualityTier === 'standard') add('balancedQuality')
  if (model.qualityTier === 'budget') add('fastValue')

  if (model.outputType === 'IMAGE') {
    add('imageGeneration')
    if (model.styleTag === 'photorealistic') add('photorealistic')
    if (model.styleTag === 'anime') add('anime')
    if (model.styleTag === 'design') add('design')
    if (model.styleTag === 'artistic') add('artistic')
    if (model.styleTag === 'general') add('versatile')
    if (model.supportsLora) add('lora')
  }

  if (model.outputType === 'VIDEO') {
    add('videoGeneration')
    if (model.i2vModelId) add('imageToVideo')
    if (model.requiresReferenceImage) add('referenceInput')
    if (model.videoDefaults?.generateAudio) add('nativeAudio')
  }

  if (model.outputType === 'AUDIO') {
    add(model.audioKind === AUDIO_KIND.SFX ? 'soundEffects' : 'speech')
  }

  if (model.outputType === 'MODEL_3D') {
    add('imageTo3d')
    add('glbOutput')
    if (model.requiresReferenceImage) add('referenceInput')
  }

  return keys.slice(0, 4)
}

function railRows() {
  return HOME_V3_RAIL_GROUPS.map((group) => ({
    ...group,
    models: AVAILABLE.filter(
      (model) => model.outputType === group.outputType,
    ).map((model) => ({
      model,
      shot: getHomeV3ModelCover(model.id, group.outputType),
      shotKind: isHomeV3ModelBrandCover(model.id)
        ? ('brand' as const)
        : ('artwork' as const),
    })),
  }))
}

const RAILS = railRows()

/**
 * Four rails, one per modality, at the very bottom — the model lineup is the
 * last thing on the page, not the pitch (docs/references/pages/home.md §A1).
 *
 * Contents are the real catalog. Native `overflow-x` keeps touch/trackpad
 * gestures working; the client motion bridge adds mouse-wheel navigation while
 * the pointer is over a rail.
 */
export function HomeV3Rails() {
  const t = useTranslations('Homepage.models')
  const tModels = useTranslations('Models')
  const detailLabels: HomeV3ModelDetailLabels = {
    canDo: t('detail.canDo'),
    advantages: t('detail.advantagesTitle'),
    provider: t('detail.provider'),
    pricing: t('detail.pricing'),
    modality: t('detail.modality'),
    openStudio: t('detail.openStudio'),
    officialDocs: t('detail.officialDocs'),
    close: t('detail.close'),
  }

  const modelLabel = (model: ModelOption) => {
    const messageKey = MODEL_MESSAGE_KEYS[model.id]
    if (!messageKey) return model.id
    const labelKey = `${messageKey}.label`
    const value = tModels(labelKey)
    return value === labelKey ? model.id : value
  }

  const priceLabel = (model: ModelOption) => {
    const price = HOMEPAGE_MODEL_REFERENCE_PRICES[model.id]
    if (!price) return t('priceVaries')
    const amount = formatHomepageReferencePriceAmount(price.amount)
    if (price.unit === 'image') return t('priceImage', { amount })
    if (price.unit === 'second') return t('priceSecond', { amount })
    return t('priceKChars', { amount })
  }

  const modelDescription = (model: ModelOption) => {
    const messageKey = MODEL_MESSAGE_KEYS[model.id]
    if (!messageKey) return model.id
    return tModels(`${messageKey}.description`)
  }

  return (
    <section className="home-v3-railsec">
      <div className="home-v3-wrap">
        <h2>{t('title', { count: HOMEPAGE_MODEL_COUNTS.total })}</h2>
      </div>

      {RAILS.map((rail) => {
        const groupLabel = t(`groups.${rail.id}`)
        return (
          <div className="home-v3-railgroup" key={rail.id}>
            <div className="home-v3-rail-head">
              <div className="home-v3-rail-title">
                <h3>{groupLabel}</h3>
                <span>{t('groupCount', { count: rail.models.length })}</span>
              </div>

              {rail.models.length >= HOME_V3_RAIL_ARROW_MIN ? (
                <div className="home-v3-arrows">
                  <button
                    type="button"
                    className="home-v3-arrow"
                    data-home-v3-rail-prev={rail.id}
                    aria-label={t('prevBatch', { group: groupLabel })}
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    className="home-v3-arrow"
                    data-home-v3-rail-next={rail.id}
                    aria-label={t('nextBatch', { group: groupLabel })}
                  >
                    →
                  </button>
                </div>
              ) : null}
            </div>

            <HomeV3ModelRail
              railId={rail.id}
              labels={detailLabels}
              models={rail.models.map(({ model, shot, shotKind }) => {
                const name = modelLabel(model)
                return {
                  id: model.id,
                  name,
                  description: modelDescription(model),
                  shot,
                  shotKind,
                  price: priceLabel(model),
                  provider: getProviderLabel(model.providerConfig),
                  modality: groupLabel,
                  advantages: modelAdvantageKeys(model).map((key) =>
                    t(`detail.advantages.${key}`),
                  ),
                  href: rail.href,
                  officialUrl: model.officialUrl,
                  viewDetailsLabel: t('detail.viewDetails', { model: name }),
                }
              })}
            />
          </div>
        )
      })}
    </section>
  )
}
