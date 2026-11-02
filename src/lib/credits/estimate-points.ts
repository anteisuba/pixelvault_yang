import { CREDIT_LIMITS, CREDIT_POINT_USD } from '@/constants/credits'
import { getModelById } from '@/constants/models'
import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { estimateCanvasNodeCost } from '@/lib/credits/canvas-generation-cost'
import {
  estimateGenerationCost,
  type CostPreviewBasis,
  type GenerationCostEstimate,
} from '@/lib/credits/generation-cost'
import { imageSubmitCount } from '@/lib/image-prompt-templates'
import type { CanvasNodeGenerationState } from '@/lib/studio-operator-canvas-snapshot'

/**
 * **事先估一批生成要多少点**（平台点数第 2 片后半，`docs/design/platform-credits.md` §2.7）。
 * 工作台、画布、助手钱闸都读这里；单价表只在 `constants/models/*`，美元算式在同目录
 * `generation-cost.ts` / `canvas-generation-cost.ts`。
 *
 * - 1 点 = 1 美分。事先估的一律**向上取整**到整点（宁可多问一次）；账本里实扣的是三位小数
 *   （`points.ts` 的 `usdToPoints`）。
 * - NAI 是订阅，不另花钱 → 0。
 * - 平台 Modal Runner 花的是平台点数 → 每张按 `runnerEstimatePointsPerImage` 估（实扣按占卡秒数）。
 * - 估不出价（`null`）⛔ 不当 0：调用方当「要先问」。
 */

/** USD → 整点，向上取整，不被浮点误差多算一点（0.12 → 12，0.031 → 4）。 */
export function ceilUsdToPoints(usd: number): number {
  return Math.ceil(Math.round((usd / CREDIT_POINT_USD) * 100) / 100)
}

type GenerationPricing = 'subscription' | 'runner' | 'priced'

function pricingOf(
  modelId: string,
  adapterType?: AI_ADAPTER_TYPES,
): GenerationPricing {
  const adapter = adapterType ?? getModelById(modelId)?.adapterType
  if (adapter === AI_ADAPTER_TYPES.NOVELAI) return 'subscription'
  if (adapter === AI_ADAPTER_TYPES.RUNNER) return 'runner'
  return 'priced'
}

/**
 * 一份美元估算 → 点。有缺价的、一个都没标价的 → `null`。
 * 只知道上下界的按上界算：宁可多问一次。
 */
export function pointsOfCost(
  estimate: GenerationCostEstimate,
  modelCount: number,
): number | null {
  if (modelCount === 0) return 0
  if (estimate.unpricedCount > 0) return null
  if (estimate.pricedCount === 0 && !estimate.rangeBounds) return null
  return ceilUsdToPoints(estimate.total + (estimate.rangeBounds?.max ?? 0))
}

/** 工作台这一批（几个模型 × 每个几张 / 一条视频）要多少点。 */
export function estimateGenerationPoints(
  models: readonly { modelId: string; adapterType?: AI_ADAPTER_TYPES }[],
  basis: CostPreviewBasis,
): number | null {
  if (models.length === 0) return null
  let points = 0
  const priced: { modelId: string }[] = []
  for (const model of models) {
    const pricing = pricingOf(model.modelId, model.adapterType)
    if (pricing === 'subscription') continue
    if (pricing === 'runner') {
      if (basis.kind !== 'image') return null
      points += basis.perModelCount * CREDIT_LIMITS.runnerEstimatePointsPerImage
      continue
    }
    priced.push(model)
  }
  if (priced.length === 0) return points
  const paid = pointsOfCost(
    estimateGenerationCost(priced, basis),
    priced.length,
  )
  return paid === null ? null : points + paid
}

/** 画布上一张卡按现在的参数跑一次要多少点。 */
export function estimateCanvasNodePoints(
  node: CanvasNodeGenerationState,
): number | null {
  if (!node.model) return null
  const pricing = pricingOf(node.model)
  if (pricing === 'subscription') return 0
  if (pricing === 'runner') {
    if (node.kind !== NODE_MEDIA_KIND_IDS.image) return null
    return (
      imageSubmitCount(node.parameters?.values ?? {}) *
      CREDIT_LIMITS.runnerEstimatePointsPerImage
    )
  }
  const usd = estimateCanvasNodeCost(node)
  return usd === null ? null : ceilUsdToPoints(usd)
}
