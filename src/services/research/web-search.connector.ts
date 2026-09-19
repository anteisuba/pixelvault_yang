import 'server-only'

import {
  RESEARCH_LIMITS,
  RESEARCH_SOURCE_IDS,
  SERPER_TBS_BY_FRESHNESS,
  detectResearchVideoSite,
  type ResearchFreshness,
} from '@/constants/research'
import { readUrl, webSearch } from '@/services/web-research.service'
import type { EvidenceItem } from '@/types/research'
import {
  clampExcerpt,
  evidenceId,
  evidenceTier,
  type ConnectorResult,
} from '@/services/research/connector-runtime'

/**
 * 通用网搜连接器 —— Serper（找）+ Jina（读）。
 *
 * 与既有 `web-research.service.ts` 的分工：那一层是**传输**（谁去发请求、怎么重试、
 * key 缺了怎么办），本文件是**证据形态**（带 `sourceId` / `sourceTier` /
 * `retrievedAt` 的 EvidenceItem）。传输层的导出一个都没动，node 助手那条路照旧。
 *
 * 🔬 两条实测支撑：
 *  - Serper 的时间过滤 `tbs=qdr:w` **生效**，所以「最新/今天」这类意图能真的收窄；
 *  - Jina 渲染 SPA 合格（火山 24,949 字 / BytePlus 25,760 字，关键词全命中，匿名可用），
 *    所以官方文档站那类目标不需要自己写渲染。
 */

export async function fetchWebSearchEvidence(params: {
  queries: readonly string[]
  freshness: ResearchFreshness
  includeDomains?: string[]
}): Promise<ConnectorResult> {
  const tbs = SERPER_TBS_BY_FRESHNESS[params.freshness]
  const batches = await Promise.all(
    params.queries.slice(0, RESEARCH_LIMITS.maxQueries).map((query) =>
      webSearch(query, {
        ...(tbs ? { tbs } : {}),
        ...(params.includeDomains?.length
          ? { includeDomains: params.includeDomains }
          : {}),
      }),
    ),
  )

  const retrievedAt = new Date().toISOString()
  const tier = evidenceTier(RESEARCH_SOURCE_IDS.webSearch)
  const seen = new Set<string>()
  const items: EvidenceItem[] = []

  /**
   * ⭐ **按名次交叉取，⛔ 不是一条查询接一条查询**（2026-09-07 修）。
   *
   * 🔬 owner 真机的根因之一就在这几行：三条查询的结果原先首尾相接，而
   * `runConnector` 只留前 `maxItemsPerSource`（8）条 —— 第一条查询回 10 条就把
   * 名额吃光，后两条（正是**角色级**的那两条）一条都进不来。回执上写着
   * `web_search:ok · 8`，看不出后两条被整段丢掉。
   * 现在按名次轮转：每条查询的第 1 名先进，再第 2 名…… 截断落在每条查询的**尾巴**
   * 上，而不是落在某一整条查询上。
   */
  const depth = Math.max(0, ...batches.map((results) => results.length))
  for (let rank = 0; rank < depth; rank += 1) {
    for (const results of batches) {
      const result = results[rank]
      if (!result) continue
      if (seen.has(result.url)) continue
      seen.add(result.url)
      const excerpt = clampExcerpt(
        result.date ? `（${result.date}）${result.snippet}` : result.snippet,
      )
      const base = {
        id: evidenceId(RESEARCH_SOURCE_IDS.webSearch, result.url),
        sourceId: RESEARCH_SOURCE_IDS.webSearch,
        sourceTier: tier,
        retrievedAt,
        title: result.title,
        url: result.url,
        // 结果日期是内容的日期，`retrievedAt` 是抓取的时刻 —— 两件事，都留着。
        ...(result.date ? { publishedAt: result.date } : {}),
      }
      /**
       * ⭐ **播放页出视频证据**（56b 切片 1）——同一条结果**只出一条**：
       * 视频档比文字档多的只有「点下去去哪儿」（新窗口跳原站），摘要一字不丢
       * （`excerpt` 原样带过去）。⛔ 别两档都出：那会让同一支视频在来源卡上
       * 占两格，而用户读到的是「它找到了两个来源」。
       * ⚠ Serper 的网页结果**没有封面**，所以这一档没有 `thumbnailUrl` ——
       * 正文里那一格因此不画封面（⛔ 不回落成站点 logo）。
       */
      const videoSite = detectResearchVideoSite(result.url)
      items.push(
        videoSite
          ? {
              ...base,
              kind: 'video',
              videoUrl: result.url,
              site: videoSite,
              excerpt,
            }
          : { ...base, kind: 'text', excerpt },
      )
    }
  }

  return { items }
}

/**
 * 用户在消息里贴了 URL —— 直接读，**不再打搜索**（规划器那条启发式的落点）。
 * Jina 读回来的正文是 SSRF 已守卫过的（`readUrl` 内部走 `assertSafeUrl`）。
 */
export async function fetchUrlEvidence(params: {
  urls: readonly string[]
}): Promise<ConnectorResult> {
  const pages = await Promise.all(params.urls.map((url) => readUrl(url)))
  const retrievedAt = new Date().toISOString()
  const tier = evidenceTier(RESEARCH_SOURCE_IDS.urlReader)

  const items: EvidenceItem[] = []
  for (const page of pages) {
    if (!page) continue
    items.push({
      kind: 'text',
      id: evidenceId(RESEARCH_SOURCE_IDS.urlReader, page.url),
      sourceId: RESEARCH_SOURCE_IDS.urlReader,
      sourceTier: tier,
      retrievedAt,
      title: page.url,
      url: page.url,
      excerpt: clampExcerpt(page.content),
    })
  }
  return { items }
}
