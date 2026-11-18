import { formatUnitPriceAmount } from '@/constants/models/unit-prices'
import { estimateGenerationCost } from '@/lib/generation-cost'
import type { AssistantOperatorSnapshot } from '@/types/assistant-operator'
import type { OperatorWorkingState } from '@/features/assistant/services/assistant-operator-run.service'

/**
 * 图片台 / 标签台「此刻是什么样」的那一句 —— 给模型的 edit 回执与板子共用（11-17 真机）。
 *
 * ⭐ 读的是**这一轮落下之后**的工作态（`run.state`，每一步 `apply()` 都写它），⛔ 不是请求：
 *   真机上比例那一条被拒了，助手却照着自己发出去的 16:9 说「按 16:9 一张的价」。回执写
 *   落下之后的真值，它要说错就得跟眼前的字对着干。
 * ⭐ 价钱与出图键旁那个「约 $X」**同一个算式**（`estimateGenerationCost`，口径同
 *   `StudioPromptArea` 那颗 `StudioCostPreview`）：主模型 + 一起跑的那几个 × 每个几张。
 *   以前模型看不到价，问价就只能调 generate 让确认卡替它报 —— 用户明说「先别出图」也一样。
 * ⚠ 单价是参考价不是计费依据；没标价的模型 ⛔ 不当 0（照实说没有标价）。
 * ⚠ GIF 输出（帧数 chip）不在快照里，这里按单张算 —— 那一档出图键旁写「起」，这里也只是估。
 */

/** 清晰度「没设」（`null`）与表单的不设态 `auto` 都是交给模型默认。 */
function resolutionText(
  resolution: string | null,
  options: readonly string[],
): string {
  if (
    resolution === null ||
    (resolution === 'auto' && !options.includes('auto'))
  )
    return options.length ? 'model default' : 'none (this model has no tiers)'
  return resolution
}

/** 这一批大约多少钱（一次出图键）；一个模型都没有 = `null`。 */
export function imageBenchPrice(state: OperatorWorkingState): string | null {
  if (!state.modelId) return null
  const models = [
    { modelId: state.modelId },
    ...state.extraModels.map((model) => ({ modelId: model.id })),
  ]
  const count = state.count ?? 1
  const estimate = estimateGenerationCost(models, {
    kind: 'image',
    perModelCount: count,
    ...(state.aspectRatio ? { aspectRatio: state.aspectRatio } : {}),
    ...(state.resolution ? { resolution: state.resolution } : {}),
    ...(state.quality ? { quality: state.quality } : {}),
    hasReferenceImage: state.referenceUrls.some(Boolean),
    ...(state.preview !== undefined ? { preview: state.preview } : {}),
  })
  const pictures = `${count} picture${count === 1 ? '' : 's'}${
    models.length > 1 ? ` × ${models.length} models` : ''
  }`
  const unpriced =
    estimate.unpricedCount > 0
      ? `; ${estimate.unpricedCount} model${estimate.unpricedCount === 1 ? ' has' : 's have'} no listed price, not counted`
      : ''
  if (estimate.pricedCount === 0 && !estimate.rangeBounds)
    return `no listed price for ${models.length === 1 ? 'this model' : 'these models'} — say you do not know the exact cost`
  const amount = estimate.rangeBounds
    ? `about ${formatUnitPriceAmount(estimate.total + estimate.rangeBounds.min)}–${formatUnitPriceAmount(estimate.total + estimate.rangeBounds.max)}`
    : `${estimate.unpricedCount > 0 ? 'from ' : ''}about ${formatUnitPriceAmount(estimate.total)}`
  return `${amount} per run (${pictures}${unpriced}; a reference price, the same number shown next to the generate button)`
}

/** 板子上那一行价钱。 */
export function imageBenchPriceLine(
  state: OperatorWorkingState,
): string | null {
  const price = imageBenchPrice(state)
  return price
    ? `Price: ${price}. When the creator asks what it costs, answer with this number — never call generate just to show a price.`
    : null
}

/** edit 回执末尾那一句：落下之后台上是什么样。 */
export function renderImageBenchNow(
  state: OperatorWorkingState,
  snapshot: AssistantOperatorSnapshot,
): string {
  const specs = snapshot.specs
  const parts = [
    `model ${state.modelLabel ?? state.modelId ?? '(none picked)'}`,
    ...(state.hasSpecsControl
      ? [
          `aspect ratio ${state.aspectRatio ?? '(not set)'}`,
          `resolution ${resolutionText(state.resolution, specs?.resolutionOptions ?? [])}`,
        ]
      : []),
    ...(state.hasCountControl ? [`${state.count ?? 1} per run`] : []),
  ]
  const price = imageBenchPrice(state)
  return `BENCH NOW (after these changes, exactly what is on the form): ${parts.join(' · ')}${
    price ? `\nPrice: ${price}.` : ''
  }`
}
