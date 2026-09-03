/**
 * 归属追踪 —— **「这一次生成是助手备的那一枪吗」**（P3-C，拍板 4 的钥匙）。
 *
 * ## 为什么需要它
 * 拍板 4：「助手准备的生成，结果回来自动看图评价并预填下一轮；**用户自己发的
 * 不打扰**」。那句话要落地，就得有一个判据能把两种生成分开 —— 而工作台里
 * 「点生成键」只有一条路径，两种情况走的是同一个函数。
 *
 * ## 判据：领一张票，只认票上写的那几条
 * 用户在 **primed 态**下按生成键的那一瞬间领一张票（`createOperatorClaim`），
 * 票上抄下**此刻已经存在的 run item id**。之后第一次出现新 id 的那一批，就是
 * 这一枪打出来的（`bindOperatorClaim`）。绑定即消费，后面再冒出来的都不算。
 *
 * ⛔ **绝不按 `activeRun.id` 认**。视频档的队列会**复用同一个 run id**
 * （`use-unified-generate.ts` 的 `generateVideo`：同批就接在现有队列后面），
 * 按 run id 认的话，助手备了第一条、用户自己排的第二条会被一起认领 ——
 * 台账里那个「共享的 pollRef 让视频不能排队」是同一类错误的另一面：
 * **把标记挂在一个会被复用的东西上**。item id 每次都是新的 `crypto.randomUUID()`，
 * 这是本仓里唯一一个「一次提交一个、绝不复用」的标识。
 *
 * ## 三个不许犯的错
 * ① **票有保质期**。用户在 primed 态点了生成键、但那一枪被 `blockedReason`
 *    挡下（本仓的生成键是「点了才告诉你缺什么」的 Krea 式），票就永远绑不上。
 *    没有 TTL 的话它会一直等着，然后认领用户**下一次自己发的**那一枪 ——
 *    正好是拍板 4 明令不许打扰的那一种。
 * ② **只发一次**。绑定之后每次轮询都会重新走一遍这段逻辑，缺了 `delivered`
 *    就是每轮一次评价请求（每次都要付一次视觉 token）。
 * ③ **等它settle 再看**。四张一批时第一张先回来，这时就去评价等于对着半批说话。
 *
 * 纯函数、不碰 React —— 这一层是最值得单测钉死的（宿主 hook 只是把它接上）。
 */

import { STUDIO_OPERATOR_CLAIM_TTL_MS } from '@/constants/studio-assistant-operator'
import type { GenerationRecord } from '@/types'
import type { AssistantOperatorResult } from '@/types/assistant-operator'

/**
 * 一张票。
 *
 * ⚠ 不可变：每次流转都造一份新的，宿主整体替换。可变对象在模块级单例里活着
 * 是最容易被两处半改的东西。
 */
export interface StudioOperatorClaim {
  claimedAt: number
  /** 领票那一刻已经在跑的那些 —— 它们**不属于**这一枪。 */
  knownItemIds: readonly string[]
  /** 绑上的那一批；`null` = 还没等到新的一批。 */
  boundItemIds: readonly string[] | null
  /** 已经投回线程了 —— 见头注 ②。 */
  delivered: boolean
}

/** run item 里这段逻辑真正要读的那几样（`RunItem` 直接可赋值）。 */
export interface StudioOperatorClaimItem {
  id: string
  status: 'pending' | 'generating' | 'completed' | 'failed' | 'cancelled'
  generation: GenerationRecord | null
}

export function createOperatorClaim(
  now: number,
  knownItemIds: readonly string[],
): StudioOperatorClaim {
  return {
    claimedAt: now,
    knownItemIds: [...knownItemIds],
    boundItemIds: null,
    delivered: false,
  }
}

export type StudioOperatorClaimBinding =
  /** 过期了 —— 宿主要把票扔掉（见头注 ①）。 */
  | { kind: 'expired' }
  /** 还没有新的一批冒出来，继续等。 */
  | { kind: 'waiting' }
  /** 绑上了/早就绑上了。 */
  | { kind: 'bound'; claim: StudioOperatorClaim }

/**
 * 把票绑到「这一枪真正打出来的那几条」上。
 *
 * ⚠ 已经绑过的票**原样返回**，不重新计算：绑定之后 items 会继续变（轮询把
 * `generating` 换成 `completed`），重算一次就会把后来加进来的也算进这一枪。
 */
export function bindOperatorClaim(
  claim: StudioOperatorClaim,
  items: readonly StudioOperatorClaimItem[],
  now: number,
): StudioOperatorClaimBinding {
  if (claim.boundItemIds) return { kind: 'bound', claim }
  if (now - claim.claimedAt > STUDIO_OPERATOR_CLAIM_TTL_MS) {
    return { kind: 'expired' }
  }

  const known = new Set(claim.knownItemIds)
  const fresh = items
    .filter((item) => !known.has(item.id))
    .map((item) => item.id)
  if (fresh.length === 0) return { kind: 'waiting' }

  return { kind: 'bound', claim: { ...claim, boundItemIds: fresh } }
}

/**
 * 这一枪打完了没有 —— 每一条都有了结局（成了 / 失败了 / 被取消了）才算
 * （头注 ③）。⚠ `cancelled` 与 `failed` 同等对待：都是不会再变的终态，
 * 缺了它助手会为一条已经被用户取消的条目永远等一张永远不会来的图。
 */
export function isOperatorClaimSettled(
  claim: StudioOperatorClaim,
  items: readonly StudioOperatorClaimItem[],
): boolean {
  const bound = claim.boundItemIds
  if (!bound || bound.length === 0) return false
  const mine = items.filter((item) => bound.includes(item.id))
  // 条目整个消失了（换了模态 / 清了批次）= 这一枪没有结果可看，别一直等下去。
  if (mine.length === 0) return true
  return mine.every(
    (item) =>
      item.status === 'completed' ||
      item.status === 'failed' ||
      item.status === 'cancelled',
  )
}

/**
 * 这一枪拿得出来给助手看的那张图。
 *
 * ⭐ **只取一张**（拍板 6 的评价卡内嵌的就是「它评的那张图」，单数）：一批四张
 * 时取第一张成的。四张全评就是四次视觉往返 + 一张卡上四份证据，两样都不是这
 * 一片要的东西。
 * 全失败时返回 `null` —— 没有图就没有评价，⛔ 别拿一句「失败了」去请一次视觉。
 */
export function readOperatorClaimEvidence(
  claim: StudioOperatorClaim,
  items: readonly StudioOperatorClaimItem[],
): AssistantOperatorResult | null {
  const bound = claim.boundItemIds
  if (!bound) return null

  for (const id of bound) {
    const item = items.find((entry) => entry.id === id)
    const generation = item?.generation
    if (item?.status !== 'completed' || !generation?.url) continue
    return {
      url: generation.url,
      ...(generation.thumbnailUrl
        ? { thumbnailUrl: generation.thumbnailUrl }
        : {}),
      generationId: generation.id,
      ...(generation.model ? { modelLabel: generation.model } : {}),
      ...(generation.prompt ? { prompt: generation.prompt } : {}),
    }
  }
  return null
}
