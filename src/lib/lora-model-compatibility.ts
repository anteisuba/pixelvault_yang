import { AI_MODELS } from '@/constants/models'
import { IMAGE_MODEL_OPTIONS } from '@/constants/models/image'

export type LoraFamilyBucket = 'flux' | 'sdxl' | 'anima' | 'other'

export interface LoraRouteOption {
  optionId: string
  modelId: string
  sourceType: 'workspace' | 'saved'
  freeTier?: boolean
}

export function getLoraFamilyBucket(rawBaseModel: string): LoraFamilyBucket {
  const value = rawBaseModel.toLowerCase()
  if (value.includes('flux')) return 'flux'
  if (value.includes('anima')) return 'anima'
  if (
    value.includes('sdxl') ||
    value.includes('illustrious') ||
    value.includes('pony') ||
    value.includes('noobai')
  ) {
    return 'sdxl'
  }
  return 'other'
}

export function getImageModelLoraFamilyBucket(
  modelId: string | null,
): LoraFamilyBucket | null {
  if (!modelId) return null
  const option = IMAGE_MODEL_OPTIONS.find((model) => model.id === modelId)
  if (!option?.supportsLora) return 'other'
  if (option.id === AI_MODELS.FLUX_2_DEV || option.id === AI_MODELS.FLUX_LORA) {
    return 'flux'
  }
  if (option.id === AI_MODELS.ILLUSTRIOUS_XL) return 'sdxl'
  if (option.id === AI_MODELS.ANIMA_PENCIL_XL) return 'anima'
  return 'other'
}

export function getRecommendedLoraImageModelId(
  rawBaseModel: string,
): AI_MODELS | null {
  const family = getLoraFamilyBucket(rawBaseModel)
  if (family === 'flux') return AI_MODELS.FLUX_LORA
  if (family === 'sdxl') return AI_MODELS.ILLUSTRIOUS_XL
  if (family === 'anima') return AI_MODELS.ANIMA_PENCIL_XL
  return null
}

export function isImageModelCompatibleWithLoraFamily(
  modelId: string | null,
  rawBaseModel: string,
): boolean {
  const family = getLoraFamilyBucket(rawBaseModel)
  if (family === 'other') return false
  return getImageModelLoraFamilyBucket(modelId) === family
}

export function findUsableRecommendedLoraRoute(
  options: readonly LoraRouteOption[],
  rawBaseModel: string,
): LoraRouteOption | null {
  const recommendedModelId = getRecommendedLoraImageModelId(rawBaseModel)
  if (!recommendedModelId) return null
  const candidates = options.filter(
    (option) => option.modelId === recommendedModelId,
  )
  return (
    candidates.find((option) => option.sourceType === 'saved') ??
    candidates.find((option) => option.freeTier) ??
    null
  )
}
