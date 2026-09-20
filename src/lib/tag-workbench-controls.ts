import {
  getModelCapabilityChips,
  type CapabilityChip,
} from '@/lib/model-capability-chips'
import type { AI_ADAPTER_TYPES } from '@/constants/providers'

/**
 * 标签台右列的**派生层**（D10 ② Q3）。
 *
 * 右列控件仍从 `provider-capabilities` 派生 —— 与自然语言台那一行专属 chip
 * **同一份派生**，只是排版从 chip 行换成常驻卡片（② 「与 11 的关系」那一条）。
 * 这里在它之上只加一件事：**台内多选时取交集**。
 *
 * - 两家都支持的 → `shared: true`，照常可改。
 * - 只有一家支持的 → `shared: false` + `supportedBy` 说清是哪一家，界面上灰掉
 *   并标「只对 X 生效」，**仍然可改**；出图时按各模型能力裁剪 payload
 *   （`pruneIncompatibleCapabilityValues`）。
 * - ⛔ 不跨方言 —— 两台的选择器各只列自己方言的模型，所以这里比较的永远是
 *   标签模型之间。
 */

export interface TagWorkbenchModelRef {
  modelId: string
  adapterType: AI_ADAPTER_TYPES
}

export interface TagWorkbenchControl {
  /** 形态 / 值域 / 缺省全从能力表来，⛔ 这里不复述。 */
  chip: CapabilityChip
  /** 选中的模型里哪些真的支持它（modelId，按传入顺序）。 */
  supportedBy: readonly string[]
  /** 选中的模型**全都**支持 = 共享档。 */
  shared: boolean
}

/**
 * 选中模型的控件并集，按能力表的声明顺序去重。
 *
 * ⚠ 并集而不是交集：只有一家支持的那些**要画出来**（灰着、可改），
 * 画板上那一句「只对 NAI V5 生效」就是它。真正「取交集」的是**可改而不灰**
 * 的那一档，由 `shared` 表达。
 *
 * ⚠ 同一个能力在两个模型上值域不同（例：V5 Full 的 `textRendering` 750 字 /
 * Curated 374 字）时，取**第一个声明它的模型**那一份 —— 主模型排在名单第一位，
 * 所以界面跟着主模型走；发出去时各自再裁剪一次。
 */
export function getTagWorkbenchControls(
  models: readonly TagWorkbenchModelRef[],
): TagWorkbenchControl[] {
  if (models.length === 0) return []

  const order: CapabilityChip[] = []
  const supported = new Map<string, string[]>()

  for (const model of models) {
    for (const chip of getModelCapabilityChips(
      model.adapterType,
      model.modelId,
    )) {
      const seen = supported.get(chip.capability)
      if (seen) {
        seen.push(model.modelId)
        continue
      }
      order.push(chip)
      supported.set(chip.capability, [model.modelId])
    }
  }

  return order.map((chip) => {
    const supportedBy = supported.get(chip.capability) ?? []
    return {
      chip,
      supportedBy,
      shared: supportedBy.length === models.length,
    }
  })
}
