/**
 * 助手钱闸的判据（`p-assistant-autonomy`）：这一批要多少点、这句话里还剩多少、出不出。
 *
 * 创作者一句话里，助手出图 / 出视频加起来不超过上限（助手设置里的 `spendLimitPoints`，默认
 * 100 点 = $1）就直接出；超了、或估不出价，才停在确认卡上（卡上写价钱）。
 * ⚠ 累计从创作者开口那一刻算起，助手自己看图再出的那几轮也算在这句话里。
 * ⚠ 扳机仍在客户端（服务端没有任何工具能直接建 generation）。
 *
 * ⭐ 点 = 美分（1 点 = $0.01），与平台点数同一单位；这一批多少点由 `lib/credits/estimate-points.ts`
 *   估（工作台 / 画布同一套），这里只管判据。
 * ⭐ 估不出价（`null`）一律当超门槛：先问一次，⛔ 不当 0。
 */

/** 几份点数加起来；任意一份估不出，整批就估不出。 */
export function sumPoints(parts: readonly (number | null)[]): number | null {
  let sum = 0
  for (const part of parts) {
    if (part === null) return null
    sum += part
  }
  return sum
}

export type SpendDecision =
  | { kind: 'go'; points: number }
  | { kind: 'ask'; points: number | null }

/**
 * 出不出：这句话里已经花了 `spentPoints`，这一批 `points`，加起来不超过上限就直接出。
 */
export function spendDecision(
  points: number | null,
  spentPoints: number,
  limitPoints: number,
): SpendDecision {
  if (points === null) return { kind: 'ask', points: null }
  return spentPoints + points <= limitPoints
    ? { kind: 'go', points }
    : { kind: 'ask', points }
}
