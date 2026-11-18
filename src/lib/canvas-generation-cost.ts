import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import { isVideoResolution } from '@/constants/video-options'
import { estimateGenerationCost } from '@/lib/generation-cost'
import { imageSubmitCount } from '@/lib/image-prompt-templates'
import type { CanvasNodeGenerationState } from '@/lib/studio-operator-canvas-snapshot'

/**
 * 一张画布卡按现在的参数跑一次大约多少钱（队列条底下那句「约 $X」）。
 *
 * ⭐ 算式只有一份：`estimateGenerationCost`（工作台 `StudioCostPreview`、助手确认卡、
 * 画布卡面发送键都读它）。这里只做「画布卡快照 → 计价口径」的翻译，⛔ 不另写单价逻辑。
 * 钉不死一个数（区间价、缺价、视频非基准档又没逐档核过）就返回 `null`，⛔ 不拿下界
 * 或基准档去顶 —— 调用方把它算作「起」。单价是参考价，不是计费依据。
 */
export function estimateCanvasNodeCost(
  node: CanvasNodeGenerationState,
): number | null {
  const model = node.model
  const values = node.parameters?.values
  if (!model) return null
  if (node.kind === NODE_MEDIA_KIND_IDS.image) {
    const estimate = estimateGenerationCost([{ modelId: model }], {
      kind: 'image',
      perModelCount: imageSubmitCount(values ?? {}),
      ...(values?.aspectRatio ? { aspectRatio: values.aspectRatio } : {}),
      ...(values?.resolution ? { resolution: values.resolution } : {}),
      ...(values?.quality ? { quality: values.quality } : {}),
    })
    return estimate.pricedCount === 1 ? estimate.total : null
  }
  if (node.kind === NODE_MEDIA_KIND_IDS.video) {
    const seconds = Number(values?.duration)
    const resolution = values?.resolution
    if (!resolution || !isVideoResolution(resolution) || !(seconds > 0))
      return null
    const estimate = estimateGenerationCost([{ modelId: model }], {
      kind: 'video',
      durationSeconds: seconds,
      resolution,
    })
    return estimate.pricedCount === 1 ? estimate.total : null
  }
  return null
}
