import { getModelById } from '@/constants/models'
import { hasCapability } from '@/constants/provider-capabilities'
import {
  VIDEO_UNIT_PRICE_BASE_RESOLUTION,
  getIdeogramImageOutputPrice,
  getImageUnitPrice,
  getModelUnitPriceRangeByStringId,
  getOpenAIImageOutputPrice,
  getVideoUnitPricePerSecond,
} from '@/constants/models/unit-prices'
import type { AI_ADAPTER_TYPES } from '@/constants/providers'
import { getVideoModelParameterOptions } from '@/constants/video-model-send-plan'
import {
  isVideoResolution,
  type VideoResolution,
} from '@/constants/video-options'

/**
 * 一批生成大约多少钱 —— 工作台成本预览（`StudioCostPreview`）与助手钱闸（`assistant-spend-gate`）
 * 读的同一个算式。⚠ 单价是参考价，不是计费依据（见 `unit-prices.ts` 文件头）。
 *
 * ⚠ 平台点数（`p-platform-credits`）上线后由 `lib/credits` 的 `estimatePoints` 接手，这里并过去。
 */

/** 计价口径：图片档要「每模型几张」，视频档要「几秒 + 哪一档」，两组互斥。 */
export type CostPreviewBasis =
  | {
      kind: 'image'
      perModelCount: number
      aspectRatio?: string
      resolution?: string
      quality?: string
      hasReferenceImage?: boolean
      preview?: boolean
      outputFormat?: string
    }
  | { kind: 'video'; durationSeconds: number; resolution: VideoResolution }

export interface GenerationCostEstimate {
  /** 钉得死单价的那几个加起来（USD）。 */
  total: number
  pricedCount: number
  /** 一个数都给不出的模型个数 —— ⛔ 不当 0 加进 `total`。 */
  unpricedCount: number
  /** 只知道上下界的那几个（不进 `total`）。 */
  rangeBounds: { min: number; max: number } | null
  /** 恰好一条视频模型时的每秒单价（预览那一行写算式用）。 */
  videoPerSecond: number | null
  /** Ideogram 高档：带不带参考图价钱不同。 */
  referenceRange: boolean
}

/** 这条模型这次真会出 GIF 吗 —— 声明了帧数能力的才会（其余在发送时被裁回 PNG）。 */
function producesGif(modelId: string): boolean {
  const adapterType = getModelById(modelId)?.adapterType
  return adapterType
    ? hasCapability(adapterType, 'gifFrameCount', modelId)
    : false
}

export function estimateGenerationCost(
  models: readonly { modelId: string }[],
  basis: CostPreviewBasis,
): GenerationCostEstimate {
  let sum = 0
  let priced = 0
  let rangeMin = 0
  let rangeMax = 0
  let rangedCount = 0
  let hasReferenceRange = false
  let perSecondForLine: number | null = null
  for (const model of models) {
    if (basis.kind === 'image') {
      // GIF：官方没有 GIF 单价，按实际用量计 —— 出图前估不出，按缺价报（⛔ 不拿
      // 单张 PNG 的价顶上，帧数一多差几十倍）。
      if (basis.outputFormat === 'gif' && producesGif(model.modelId)) continue
      const ideogramPrice = getIdeogramImageOutputPrice(model.modelId, basis)
      if (ideogramPrice && ideogramPrice.min !== ideogramPrice.max) {
        hasReferenceRange = true
      }
      const outputPrice =
        ideogramPrice ??
        (basis.aspectRatio
          ? getOpenAIImageOutputPrice(model.modelId, {
              ...basis,
              aspectRatio: basis.aspectRatio,
            })
          : null)
      if (outputPrice) {
        if (outputPrice.min === outputPrice.max) {
          sum += outputPrice.min * basis.perModelCount
          priced += 1
        } else {
          rangeMin += outputPrice.min * basis.perModelCount
          rangeMax += outputPrice.max * basis.perModelCount
          rangedCount += 1
        }
        continue
      }
      const price = getImageUnitPrice(model.modelId, basis)
      if (price === null) {
        const range = getModelUnitPriceRangeByStringId(model.modelId)
        if (range && range.unit === 'image') {
          rangeMin += range.min * basis.perModelCount
          rangeMax += range.max * basis.perModelCount
          rangedCount += 1
        }
        continue
      }
      sum += price * basis.perModelCount
      priced += 1
      continue
    }

    const perSecond = getVideoUnitPricePerSecond(
      model.modelId,
      basis.resolution,
    )
    if (perSecond === null) continue
    sum += perSecond * basis.durationSeconds
    priced += 1
    perSecondForLine = models.length === 1 ? perSecond : null
  }
  return {
    total: sum,
    pricedCount: priced,
    unpricedCount: models.length - priced - rangedCount,
    rangeBounds: rangedCount > 0 ? { min: rangeMin, max: rangeMax } : null,
    videoPerSecond: perSecondForLine,
    referenceRange: hasReferenceRange,
  }
}

/**
 * 视频档的计价口径 —— 按**真正会发出去的那两个值**算（与 `buildVideoInput` 同一条夹取），
 * 否则报的是一个用户不会被收的数。模型没有时长档 = `null`（给不出价）。
 */
export function videoCostBasisOf(
  model: { modelId: string; adapterType: AI_ADAPTER_TYPES },
  duration: number,
  resolution: string | null | undefined,
): CostPreviewBasis | null {
  const { durations, resolutions } = getVideoModelParameterOptions(
    model.modelId,
    model.adapterType,
  )
  if (durations.length === 0) return null
  const durationSeconds = durations.includes(duration)
    ? duration
    : durations.reduce((closest, candidate) =>
        Math.abs(candidate - duration) < Math.abs(closest - duration)
          ? candidate
          : closest,
      )
  const picked =
    resolution && resolutions.includes(resolution)
      ? resolution
      : (getModelById(model.modelId)?.videoDefaults?.resolution ??
        VIDEO_UNIT_PRICE_BASE_RESOLUTION)
  return {
    kind: 'video',
    durationSeconds,
    resolution: isVideoResolution(picked)
      ? picked
      : VIDEO_UNIT_PRICE_BASE_RESOLUTION,
  }
}
