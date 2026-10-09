import {
  getIdeogramImageOutputPrice,
  getImageUnitPrice,
  getOpenAIImageOutputPrice,
  getVideoUnitPricePerSecond,
} from '@/constants/models/unit-prices'
import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import type { VideoResolution } from '@/constants/video-options'
import type { CanvasNodeGenerationState } from '@/lib/studio-operator-canvas-snapshot'

/**
 * 一张画布卡按现在的参数跑一次大约多少钱（队列条底下那句「约 $X」）。
 *
 * 判据与工作台的 `StudioCostPreview` 同一套单价表：钉不死一个数（区间价、缺价、
 * 视频非基准档又没逐档核过）就返回 `null`，⛔ 不拿下界或基准档去顶 —— 调用方把它
 * 算作「起」。单价是参考价，不是计费依据。
 */
export function estimateCanvasNodeCost(
  node: CanvasNodeGenerationState,
): number | null {
  const model = node.model
  const values = node.parameters?.values
  if (!model) return null
  if (node.kind === NODE_MEDIA_KIND_IDS.image) {
    const count = values?.storyboardGrid ? 1 : (values?.count ?? 1)
    const quality = values?.quality
    const ideogram = getIdeogramImageOutputPrice(model, { quality })
    if (ideogram)
      return ideogram.min === ideogram.max ? ideogram.min * count : null
    if (values?.aspectRatio) {
      const openai = getOpenAIImageOutputPrice(model, {
        aspectRatio: values.aspectRatio,
        resolution: values.resolution,
        quality,
      })
      if (openai) return openai.min === openai.max ? openai.min * count : null
    }
    const unit = getImageUnitPrice(model, { quality })
    return unit === null ? null : unit * count
  }
  if (node.kind === NODE_MEDIA_KIND_IDS.video) {
    const seconds = Number(values?.duration)
    if (!values?.resolution || !(seconds > 0)) return null
    const perSecond = getVideoUnitPricePerSecond(
      model,
      values.resolution as VideoResolution,
    )
    return perSecond === null ? null : perSecond * seconds
  }
  return null
}
