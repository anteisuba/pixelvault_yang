import type { ApiKeyHealthStatus } from '@/types'

/**
 * 一个型号底下的一条渠道（fal / 火山 / BytePlus …）。
 *
 * ⚠ 这是**选择器的口径**，不是 `StudioModelOption` 的子集：它只留下「这条渠道
 * 是什么、今天能不能跑、多少钱」，好让「走哪条」本身是可测的纯函数。映射发生在
 * `toModelChannelCandidate`，选择器与新卡默认模型共用那一份。
 */
export interface ModelChannelCandidate {
  /** 该渠道在选择器里的稳定标识（= 对应条目的 `optionId`）。 */
  channelId: string
  /** 渠道名，展示用。 */
  channelLabel: string
  /** 用户自己配了这条渠道的 key（provider 级覆盖也算）—— 面板上的绿 / 黄点。 */
  hasUserKey: boolean
  /** USD 参考单价；查不到价为 null。面板与行上的价格位读它。 */
  unitPrice: number | null
  /** key 健康度；展示用（点的颜色由 `hasUserKey` 定，健康度是行上的健康点）。 */
  health?: ApiKeyHealthStatus
}

/**
 * 选中这条渠道的理由。
 *
 * - `manual` = 用户自己点过并被记住了（跨会话，按型号存）。
 * - `only` = 这个型号只有一条渠道 —— 唯一选择自动成立（D2 ④「单渠道型号面板只有
 *   一行且自动选中」）。
 */
export type ModelChannelReason = 'manual' | 'only'

export interface ResolvedModelChannel {
  channel: ModelChannelCandidate
  reason: ModelChannelReason
}

/**
 * 挑出这个型号该跑哪条渠道。
 *
 * ⚠ 2026-09-17 owner 在 D2 Q1 拍板：**没有「自动」**。曾经的
 * `manual › userKey › cheapest` 三档整条删掉 —— 「自动 = 最便宜」与「上次选的 X
 * 已不可用，已回到自动」两条提示随它一起消失。今天只剩两条成立的路径：
 *
 * - 用户手选过并被记住的那条（`manual`）；
 * - 这个型号只有一条渠道（`only`）—— 没有第二个选项，谈不上替他选。
 *
 * 其余一律返回 `null` = **未选渠道**。这是一个合法且可见的状态：行上的价格位写
 * 「—」，触发器写「先选渠道」，点它回到这一行的渠道面板。⛔ 不要为了「总得有个
 * 值」在这里补一条兜底 —— 那正是被删掉的「自动」。
 *
 * ⚠ 记忆里的渠道已经不在清单里（模型下架 / 被模式过滤掉）时静默回到未选，不报错
 * 也不改选另一条。**缺 key 不影响它是不是被选中**：key 失效时面板上那条点变黄，
 * 价格位清空，但它仍然是这个型号选中的渠道（owner「key 失效时该渠道点变黄」）。
 */
export function resolveModelChannel(
  candidates: readonly ModelChannelCandidate[],
  manualChannelId?: string | null,
): ResolvedModelChannel | null {
  if (candidates.length === 0) return null

  const manual = manualChannelId
    ? candidates.find((c) => c.channelId === manualChannelId)
    : undefined
  if (manual) return { channel: manual, reason: 'manual' }

  const only = candidates.length === 1 ? candidates[0] : undefined
  if (only) return { channel: only, reason: 'only' }

  return null
}
