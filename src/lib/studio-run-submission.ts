import type { ActiveRun } from '@/types'

/**
 * 这一拍 `activeRun` 里有没有**刚提交**的一条：出现了上一拍没有的条目 id。
 *
 * 判据取「新条目」而不是「新批次 id」：图片每次提交换一个批次（条目全新），视频是
 * 接在同一批后面排队（批次不变、多一条）—— 两种提交都只认「多了一条没见过的」。
 * 轮询改状态、取消摘条、清空批次都不是提交：条目 id 只会少不会多。
 */
export function hasNewRunItem(
  previous: ActiveRun | null,
  next: ActiveRun | null,
): boolean {
  if (!next || next === previous) return false
  const seen = new Set(previous?.items.map((item) => item.id))
  return next.items.some((item) => !seen.has(item.id))
}
