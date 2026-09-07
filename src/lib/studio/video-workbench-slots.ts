import type { AI_ADAPTER_TYPES } from '@/constants/providers'
import { getVideoModelSendContract } from '@/constants/video-model-send-plan'

/**
 * 视频工作台参考区**这一刻该出现哪几个具名槽**（第二期，owner 2026-09-07 定）。
 *
 * ⚠ 这是一条**判据**，不是布局偏好：槽出现与否说的是「这个模型认不认这个语义」。
 * 判据全部来自发送契约（`getVideoModelSendContract`），⛔ 不再登记第二张模型表 ——
 * 契约填对了槽自动正确（与 `video-node-modes.ts` 那条「模式 ↔ referenceMode
 * 一一对应」同一条设计）。
 *
 * ⛔ **不支持的槽不渲染，不摆禁用占位**（`ui-defaults.md` 状态配方）：一个永远
 * 点不动的「尾帧」框只会让用户反复去试它，而它给不出任何解释。
 *
 * ⚠ 首尾帧只在**关键帧档**（`referenceMode: 'text-or-first-frame'`）成立。另外两
 * 档里图片不是帧，是内容参考 —— 那条轨仍归 `imageUpload`（见 `studio-context`
 * 里 `videoFrameSlots` 的头注）。
 */
export interface VideoWorkbenchSlots {
  /** 首帧槽出不出现。 */
  first: boolean
  /**
   * 尾帧槽出不出现。
   *
   * ⚠ 判据是契约的 `keyframeSlots === 2`，也就是「**我们的 worker 发得出来吗**」
   * 而不是「上游支不支持」（那条头注在 `video-model-send-plan.ts` 里）。声明得比
   * 实现宽 = 用户填了尾帧被静默丢掉。
   */
  last: boolean
  /** 参考视频槽能放几条；0 = 不渲染这个槽。 */
  videos: number
}

export function getVideoWorkbenchSlots(
  modelId: string | undefined,
  adapterType?: AI_ADAPTER_TYPES,
): VideoWorkbenchSlots {
  // 还没选模型 —— ⛔ 不猜一个默认模型的能力：那会让槽在选完模型之后突然消失。
  if (!modelId) return { first: false, last: false, videos: 0 }

  const contract = getVideoModelSendContract(modelId, adapterType)
  const isKeyframe = contract.referenceMode === 'text-or-first-frame'
  return {
    first: isKeyframe,
    last: isKeyframe && contract.keyframeSlots === 2,
    videos: contract.slots.videos,
  }
}
