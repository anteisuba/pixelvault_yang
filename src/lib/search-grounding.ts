/**
 * 「先搜再画」（Gemini Google 搜索落地）的纯函数。来源与搜索建议只在出图当下
 * 交给发起者一次，按 Gemini API 条款 ⛔ 不缓存、不进 Generation。
 */

/** 去掉暂放的「先搜再画」来源，其余元数据原样。读不了的原串原样返回。 */
export function withoutSearchGrounding(value: string): string {
  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return value
    }
    const rest: Record<string, unknown> = { ...parsed }
    delete rest.searchGrounding
    return JSON.stringify(rest)
  } catch {
    return value
  }
}
