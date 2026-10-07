/**
 * 「先搜再画」（Gemini Google 搜索落地）的纯函数。来源与搜索建议只在出图当下
 * 交给发起者一次，按 Gemini API 条款 ⛔ 不缓存、不进 Generation。
 */

import { supportsSearchGrounding } from '@/constants/models'
import type {
  AdvancedParams,
  RunItem,
  SearchGroundingResult,
  SearchGroundingSource,
} from '@/types'

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

/** 这一格开没开「先搜再画」：参数开着、型号又支持（服务端对别的型号会去掉）。 */
export function searchGroundingForRunItem(
  modelId: string,
  advancedParams: Pick<AdvancedParams, 'searchGrounding'> | undefined,
): Pick<RunItem, 'searchGrounding'> {
  return advancedParams?.searchGrounding === true &&
    supportsSearchGrounding(modelId)
    ? { searchGrounding: {} }
    : {}
}

/**
 * 资料列要画的那一份：同一轮里开着搜索的几格合起来（来源按链接去重；搜索建议
 * 每格各一条，相同的只画一次 —— 条款要求建议条跟着它那一份结果出现）。
 */
export interface SearchGroundingView {
  status: SearchGroundingResult['status']
  sources: SearchGroundingSource[]
  suggestionsHtml: string[]
}

export function mergeSearchGroundingResults(
  results: readonly SearchGroundingResult[],
): SearchGroundingView | undefined {
  if (results.length === 0) return undefined
  const sources: SearchGroundingSource[] = []
  const seen = new Set<string>()
  const suggestionsHtml: string[] = []
  for (const result of results) {
    for (const source of result.sources) {
      if (seen.has(source.url)) continue
      seen.add(source.url)
      sources.push(source)
    }
    // 搜索出错的那一份没有建议条（来源与建议条同进同出）。
    if (
      result.status !== 'error' &&
      result.suggestionsHtml &&
      !suggestionsHtml.includes(result.suggestionsHtml)
    ) {
      suggestionsHtml.push(result.suggestionsHtml)
    }
  }
  const status = sources.length
    ? 'grounded'
    : results.every((result) => result.status === 'error')
      ? 'error'
      : 'empty'
  return { status, sources, suggestionsHtml }
}

/**
 * 一轮运行里「先搜再画」那一份：`null` = 这一轮没开搜索；`searching` = 还有开着
 * 搜索的格子在跑；`done` 而没有 `view` = 一份来源都没交回来（什么都不画）。
 */
export function searchGroundingForRun(
  items: readonly RunItem[],
): { phase: 'searching' | 'done'; view?: SearchGroundingView } | null {
  const searched = items.filter((item) => item.searchGrounding)
  if (searched.length === 0) return null
  if (
    searched.some(
      (item) => item.status === 'generating' || item.status === 'pending',
    )
  ) {
    return { phase: 'searching' }
  }
  return {
    phase: 'done',
    view: mergeSearchGroundingResults(
      searched.flatMap((item) =>
        item.searchGrounding?.result ? [item.searchGrounding.result] : [],
      ),
    ),
  }
}
