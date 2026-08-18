export type ModelVisual = {
  src: string
  wide?: boolean
}

const BRAND_ROOT = '/homepage/production/models/brand'

/** Series identity comes from the model owner, not the API execution route. */
const MODEL_FAMILY_VISUALS: Readonly<Record<string, ModelVisual>> = {
  'GPT Image': { src: `${BRAND_ROOT}/openai.svg` },
  Gemini: { src: `${BRAND_ROOT}/gemini.svg` },
  FLUX: { src: `${BRAND_ROOT}/flux.svg`, wide: true },
  Seedream: { src: `${BRAND_ROOT}/bytedance.svg`, wide: true },
  Recraft: { src: `${BRAND_ROOT}/recraft.svg`, wide: true },
}

export function getModelFamilyVisual(family: string): ModelVisual | null {
  return MODEL_FAMILY_VISUALS[family] ?? null
}
