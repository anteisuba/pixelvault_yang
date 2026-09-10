import type { ApiKeyHealthStatus } from '@/types'

/**
 * 一个型号底下的一条渠道（fal / 火山 / BytePlus …）。
 *
 * ⚠ 这是**选择器的口径**，不是 `StudioModelOption` 的子集：它只留下「选哪条」
 * 需要的四件事（有没有自己的 key、有没有平台额度、多少钱、key 健不健康），
 * 好让规则本身是可测的纯函数。映射发生在组件里（见 `ModelPickerPopover`）。
 */
export interface ModelChannelCandidate {
  /** 该渠道在选择器里的稳定标识（= 对应条目的 `optionId`）。 */
  channelId: string
  /** 渠道名，展示用。 */
  channelLabel: string
  /** 用户自己配了这条渠道的 key（provider 级覆盖也算）。 */
  hasUserKey: boolean
  /** 平台给的免费额度。 */
  hasFreeQuota: boolean
  /** USD 参考单价；查不到价为 null —— **排最后**，不当 0。 */
  unitPrice: number | null
  /** key 健康度；同一档内先比它，再比价。 */
  health?: ApiKeyHealthStatus
}

/** 选中这条渠道的理由。`manual` = 用户自己改过并被记住了。 */
export type ModelChannelReason = 'manual' | 'userKey' | 'freeQuota' | 'cheapest'

export interface ResolvedModelChannel {
  channel: ModelChannelCandidate
  reason: ModelChannelReason
  /**
   * 与它完全并列（同档、同健康、同价）的其余候选数。>0 说明这一条是按清单
   * 顺序定的 —— 规则本身分不出高下，调用方想提示「有并列」时用得上。
   */
  tiedWith: number
}

/**
 * 自动规则的三档：自己的 key ＞ 平台免费额度 ＞ 最便宜。
 *
 * ⚠ 「最便宜」不是第四条独立规则，而是**每一档内部的次序**：一个人配了两把
 * key，仍然该走便宜的那条；两条都只剩公开价时，比的也是价。所以档只分三级，
 * 档内一律 健康 → 价格 → 清单顺序。
 */
const CHANNEL_TIERS = ['userKey', 'freeQuota', 'cheapest'] as const

function tierOf(candidate: ModelChannelCandidate): number {
  if (candidate.hasUserKey) return 0
  if (candidate.hasFreeQuota) return 1
  return 2
}

const HEALTH_RANK: Record<ApiKeyHealthStatus, number> = {
  available: 0,
  unknown: 1,
  no_key: 2,
  failed: 3,
}

/** 没有健康信息 = 与 `unknown` 同级：不奖励也不惩罚。 */
function healthRankOf(candidate: ModelChannelCandidate): number {
  return candidate.health ? HEALTH_RANK[candidate.health] : HEALTH_RANK.unknown
}

/** 缺价排最后：查不到价当 0 会让「没数据」冒充「免费」。 */
function priceOf(candidate: ModelChannelCandidate): number {
  return candidate.unitPrice ?? Number.POSITIVE_INFINITY
}

function isTiedWith(
  a: ModelChannelCandidate,
  b: ModelChannelCandidate,
): boolean {
  return (
    tierOf(a) === tierOf(b) &&
    healthRankOf(a) === healthRankOf(b) &&
    priceOf(a) === priceOf(b)
  )
}

/**
 * 挑出这个型号该跑哪条渠道，并说明理由。
 *
 * - `manualChannelId` 命中清单就直接赢（用户手选优先，调用方按型号记住它）；
 *   记忆里的渠道**已经不在清单里**（模型下架 / 被模式过滤掉）时静默退回自动规则，
 *   不报错也不留空 —— 那会让选择器显示一个点不动的型号。
 * - 清单为空返回 `null`，调用方按「这个型号今天没有可用渠道」处理。
 */
export function resolveModelChannel(
  candidates: readonly ModelChannelCandidate[],
  manualChannelId?: string | null,
): ResolvedModelChannel | null {
  if (candidates.length === 0) return null

  const manual = manualChannelId
    ? candidates.find((c) => c.channelId === manualChannelId)
    : undefined
  if (manual) return { channel: manual, reason: 'manual', tiedWith: 0 }

  const best = candidates.reduce((a, b) => {
    if (tierOf(a) !== tierOf(b)) return tierOf(a) < tierOf(b) ? a : b
    if (healthRankOf(a) !== healthRankOf(b)) {
      return healthRankOf(a) < healthRankOf(b) ? a : b
    }
    if (priceOf(a) !== priceOf(b)) return priceOf(a) < priceOf(b) ? a : b
    // 完全并列 —— 清单顺序说了算（reduce 的左值就是更靠前的那条）。
    return a
  })

  return {
    channel: best,
    reason: CHANNEL_TIERS[tierOf(best)],
    tiedWith: candidates.filter(
      (c) => c.channelId !== best.channelId && isTiedWith(c, best),
    ).length,
  }
}
