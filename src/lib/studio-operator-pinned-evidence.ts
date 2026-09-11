/**
 * **钉住的证据住在结论记录里**（v2 §3.2 / §7.2，2026-09-12 实测第三组 B）。
 *
 * ⭐ 实测第 8 步：钉住条刷新一次就没了 —— 它此前只是面板的一个 `useState`。
 * 而用户钉一条结论正是为了「接下来这一整轮都别让我忘了这句」，一个刷新就忘的
 * 提醒不如没有。所以钉住 = 写进**本轮结论记录**的 `pinnedEvidence` 一列
 * （走 §7.7 那条既有 PATCH），取消钉住 = 从那一列里移掉。
 *
 * ⚠ 这个文件里**一个请求都不发、一个 React 概念都不碰**：面板要的是三个纯判断
 * （这张卡钉住没有 / 钉它该写哪一轮 / 写完那一轮长什么样），而那三条正是唯一
 * 值得逐条测的东西。
 * ⚠ 认卡靠**证据编号**（§7.3），⛔ 不靠 `runKey`：后者是这一次页面加载现造的串，
 * 刷新之后对不上任何一条记录，而「刷新之后还在」就是这件事的全部意义。
 */

import { ASSISTANT_ROUND_SUMMARY_LIMITS as ROUND_LIMITS } from '@/constants/assistant-operator'
import type {
  AssistantOperatorPinnedEvidence,
  AssistantOperatorRoundSummary,
} from '@/types/assistant-operator'

/** 一条钉住 + 它落在哪一轮 —— 常驻条要画的那一份。 */
export interface StudioOperatorPinnedRecord extends AssistantOperatorPinnedEvidence {
  roundIndex: number
}

/**
 * **还没落进记录的那一条钉住**（这一轮尚未结账）—— 面板的暂存态。
 * ⚠ 多一个 `runKey`：暂存期间时间线上那张卡还认得它，⛔ 而 `runKey` 不入库。
 */
export interface StudioOperatorPinState extends AssistantOperatorPinnedEvidence {
  runKey: string
}

/** 一次钉住 / 取消钉住要写回去的那一轮。 */
export interface StudioOperatorPinPatch {
  roundIndex: number
  pinnedEvidence: AssistantOperatorPinnedEvidence[]
}

function sharesRef(left: readonly string[], right: readonly string[]): boolean {
  return left.some((ref) => right.includes(ref))
}

/**
 * 载回来的 + 在飞的那几条结论记录里，**已经钉住的**都在这儿。
 *
 * ⚠ 同一个 `roundIndex` 可能在两个数组里各存在一份（这一次页面加载生成的 vs
 * 上一次载回来的）—— 按号去重，留**后给的**那一份（调用方按「在飞在后」传）。
 */
export function derivePinnedEvidence(
  rounds: readonly AssistantOperatorRoundSummary[],
): StudioOperatorPinnedRecord[] {
  const byRound = new Map<number, AssistantOperatorRoundSummary>()
  for (const round of rounds) byRound.set(round.roundIndex, round)
  return [...byRound.values()]
    .sort((left, right) => left.roundIndex - right.roundIndex)
    .flatMap((round) =>
      (round.pinnedEvidence ?? []).map((pinned) => ({
        ...pinned,
        roundIndex: round.roundIndex,
      })),
    )
}

/** 这几条证据编号**已经被钉住了**没有（证据卡的 `pinned` 态读它）。 */
export function isEvidencePinned(
  rounds: readonly AssistantOperatorRoundSummary[],
  refs: readonly string[],
): boolean {
  if (refs.length === 0) return false
  return derivePinnedEvidence(rounds).some((pinned) =>
    sharesRef(pinned.refs, refs),
  )
}

/**
 * 钉 / 取消钉住一条结论 —— 返回**要 PATCH 回去的那一轮**。
 *
 * ⚠ 已经钉住的那一条从**它自己所在的那一轮**里摘掉（⛔ 不是从最新那一轮）：
 * 用户取消的是屏幕上那一条，而它可能是三轮之前钉的。
 * ⚠ 还没钉住的写进**最新那一条结论记录**（「当前轮」）。一条记录都还没有
 * （这一轮还没结账）时返回 `null` —— 调用方先留在本地态，等结账那一帧再合并。
 * ⚠ 超出 `maxPinnedPerRound` 时**从最旧的那头挤掉**：常驻条摞满一屏之后就不再
 * 是「别忘了」了。⛔ 不拒绝钉住 —— 那会让最后一颗图钉按下去没有任何反应。
 */
export function togglePinnedEvidence(
  rounds: readonly AssistantOperatorRoundSummary[],
  item: AssistantOperatorPinnedEvidence,
): StudioOperatorPinPatch | null {
  if (item.refs.length === 0) return null
  const ordered = [...rounds].sort(
    (left, right) => left.roundIndex - right.roundIndex,
  )
  const holder = ordered.find((round) =>
    (round.pinnedEvidence ?? []).some((pinned) =>
      sharesRef(pinned.refs, item.refs),
    ),
  )
  if (holder) {
    return {
      roundIndex: holder.roundIndex,
      pinnedEvidence: (holder.pinnedEvidence ?? []).filter(
        (pinned) => !sharesRef(pinned.refs, item.refs),
      ),
    }
  }
  const target = ordered.at(-1)
  if (!target) return null
  return {
    roundIndex: target.roundIndex,
    pinnedEvidence: [...(target.pinnedEvidence ?? []), item].slice(
      -ROUND_LIMITS.maxPinnedPerRound,
    ),
  }
}
