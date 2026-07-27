import Image from 'next/image'
import { useTranslations } from 'next-intl'

import {
  getHomeV3ModelCover,
  HOME_V3_RAIL_ARROW_MIN,
  HOME_V3_RAIL_GROUPS,
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
import { Link } from '@/i18n/navigation'

const AVAILABLE = getAvailableModels()

function railRows() {
  return HOME_V3_RAIL_GROUPS.map((group) => ({
    ...group,
    models: AVAILABLE.filter(
      (model) => model.outputType === group.outputType,
    ).map((model) => ({
      model,
      shot: getHomeV3ModelCover(model.id, group.outputType),
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

            <div className="home-v3-rail" data-home-v3-rail={rail.id}>
              {rail.models.map(({ model, shot }) => (
                <Link className="home-v3-mcard" href={rail.href} key={model.id}>
                  <Image src={shot} alt="" width={320} height={320} />
                  <div className="home-v3-mcard-top">
                    <b>{modelLabel(model)}</b>
                    <span>{priceLabel(model)}</span>
                  </div>
                  <p>{getProviderLabel(model.providerConfig)}</p>
                </Link>
              ))}
            </div>
          </div>
        )
      })}
    </section>
  )
}
