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
  if (option.id === AI_MODELS.FLUX_LORA) {
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

/**
 * Whether a recipe-extra LoRA (given its raw baseModel string) can be mounted
 * onto a base of the given family without an architecture mismatch that
 * corrupts the checkpoint. Reuses the same coarse buckets as hosted routing:
 * illustrious/pony/sdxl share the SDXL bucket and interload; flux, anima and
 * sd1.5/other are distinct architectures whose LoRA tensors don't map onto an
 * SDXL checkpoint (→ melted/garbage output). Buckets must match; `other`
 * (unrecognized / sd1.5) never matches. `baseFamilyRaw` accepts either a raw
 * baseModel string or a `LoraBaseFamily` value (e.g. `'illustrious'`).
 */
export function isLoraBaseModelMountCompatible(
  loraRawBaseModel: string,
  baseFamilyRaw: string,
): boolean {
  const loraBucket = getLoraFamilyBucket(loraRawBaseModel)
  const baseBucket = getLoraFamilyBucket(baseFamilyRaw)
  if (loraBucket === 'other' || baseBucket === 'other') return false
  return loraBucket === baseBucket
}

/**
 * §4.1 挂载栈 vs 选中底模的兼容摘要（lora-workbench.md §4.1/§4.2）：脊柱条
 * 圆点 + 出图键上方警示行共用同一份判定，抽成纯函数方便脱离 UI 单测。
 *
 * - `incompatibleCount`：挂载栈里有多少项与 `selectedBaseFamily` 不兼容
 *   （粗粒度架构桶不同，见 isLoraBaseModelMountCompatible）。
 * - `mutuallyExclusive`：挂载栈里存在 2+ 个不同的粗架构桶（`other` 桶不计入，
 *   因为它本来就永不兼容任何底模，不构成"桶冲突"）——此时没有单一底模能
 *   同时满足全部挂载，警示行退化成"卸载其一"而不是给一个只能救一半的假
 *   建议。
 *
 * `selectedBaseFamily` 为 null（底模未选）时不判定，两个字段都归零/false。
 */
export interface LoraStackCompatibilitySummary {
  incompatibleCount: number
  mutuallyExclusive: boolean
}

export function summarizeLoraStackCompatibility(
  mountBaseModelFamilies: readonly string[],
  selectedBaseFamily: string | null,
): LoraStackCompatibilitySummary {
  if (!selectedBaseFamily) {
    return { incompatibleCount: 0, mutuallyExclusive: false }
  }
  const incompatibleCount = mountBaseModelFamilies.filter(
    (family) => !isLoraBaseModelMountCompatible(family, selectedBaseFamily),
  ).length
  const buckets = new Set(
    mountBaseModelFamilies
      .map((family) => getLoraFamilyBucket(family))
      .filter((bucket) => bucket !== 'other'),
  )
  return {
    incompatibleCount,
    mutuallyExclusive: buckets.size > 1,
  }
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
