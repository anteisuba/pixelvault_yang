import 'server-only'

import { z } from 'zod'

import {
  URL_READER,
  WEB_IMAGE_SEARCH,
  WEB_SEARCH,
} from '@/constants/web-search'
import { assertSafeUrl } from '@/lib/url-guard'
import { logger } from '@/lib/logger'
import { extractUrlsFromText, stripUrls } from '@/lib/research-intent'
import { withRetry } from '@/lib/with-retry'

// ─── Types ───────────────────────────────────────────────────────

export interface WebSearchResult {
  title: string
  url: string
  snippet: string
  /**
   * Serper 给的结果日期（只有部分结果带）。**新鲜度那道闸要它**：
   * 「查于 X 小时前」说的是抓取时刻，「这条内容是哪天的」是另一件事，
   * 两者都得有，证据冲突时才呈现得出「两说 + 各自日期」。
   */
  date?: string
}

export interface FetchedPage {
  url: string
  content: string
}

export interface WebContext {
  results: WebSearchResult[]
  pages: FetchedPage[]
}

// ─── External response schema ────────────────────────────────────

const SerperResponseSchema = z.object({
  organic: z
    .array(
      z.object({
        title: z.string().optional(),
        link: z.string().optional(),
        snippet: z.string().optional(),
        date: z.string().optional(),
      }),
    )
    .optional(),
})

// ─── Helpers ─────────────────────────────────────────────────────

function markStatus(error: Error, status: number): Error {
  ;(error as { status?: number }).status = status
  return error
}

// ─── Search (Serper / Google) ────────────────────────────────────

export function isWebSearchConfigured(): boolean {
  return Boolean(process.env.SERPER_API_KEY)
}

/**
 * Run a Google search via Serper. Best-effort: returns [] (never throws) when
 * the key is missing or the call fails, so a research turn degrades gracefully
 * to URL excerpts and/or model knowledge.
 */
export async function webSearch(
  query: string,
  options: {
    includeDomains?: string[]
    num?: number
    /**
     * Google 时间过滤（Serper 直通 `tbs`）。🔬 `qdr:w` 实测生效。
     * 只在「最新/今天/几号」这类时效意图上给值 —— 一律加时间窗会把稳定事实
     * 也过滤没了。取值走 `SERPER_TBS_BY_FRESHNESS`，别在调用点硬编码。
     */
    tbs?: string
  } = {},
): Promise<WebSearchResult[]> {
  const apiKey = process.env.SERPER_API_KEY
  if (!apiKey) {
    logger.warn('webSearch skipped: SERPER_API_KEY not configured')
    return []
  }

  const q = options.includeDomains?.length
    ? `${query} ${options.includeDomains.map((d) => `site:${d}`).join(' OR ')}`
    : query
  const num = Math.min(
    options.num ?? WEB_SEARCH.defaultNumResults,
    WEB_SEARCH.maxNumResults,
  )

  try {
    const data = await withRetry(
      async () => {
        const response = await fetch(WEB_SEARCH.serperEndpoint, {
          method: 'POST',
          headers: {
            'X-API-KEY': apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            q,
            num,
            ...(options.tbs ? { tbs: options.tbs } : {}),
          }),
          signal: AbortSignal.timeout(WEB_SEARCH.timeoutMs),
        })
        if (!response.ok) {
          throw markStatus(
            new Error(`Serper search failed: ${response.status}`),
            response.status,
          )
        }
        return SerperResponseSchema.parse(await response.json())
      },
      { label: 'webSearch.serper' },
    )

    return (data.organic ?? [])
      .filter((entry) => entry.link && entry.title)
      .map((entry) => ({
        title: entry.title ?? '',
        url: entry.link ?? '',
        snippet: (entry.snippet ?? '').slice(0, WEB_SEARCH.maxSnippetLength),
        ...(entry.date ? { date: entry.date } : {}),
      }))
  } catch (error) {
    logger.warn('webSearch failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return []
  }
}

// ─── Image search (Serper /images) ───────────────────────────────

/**
 * 一张联网**预览**候选。
 *
 * ⛔ 名字里的 preview 不是修辞：这里返回的东西**一个字节都没有落地**，
 * 转存进 R2 是另一条腿（用户点选 → `POST /api/studio/web-image-import`）。
 * owner 2026-08-30 原话：「主要是给个预览的功能，用户确定了再落 R2」。
 */
export interface WebImageSearchResult {
  /** 原图直链 —— 用户点选后转存取的就是它。 */
  imageUrl: string
  /**
   * gstatic 缩略图。🔬 选型报告：Serper 这一路的缩略图**不过期**（SerpApi 的 31 天
   * 就会 404），所以网格里画它是安全的；而原图直链实测约三成 403，画它会得到
   * 一半碎图。
   */
  thumbnailUrl?: string
  /** 图片所在页。 */
  pageUrl?: string
  domain?: string
  title?: string
  /** ⚠ 搜索引擎报的数，不是实到值 —— 只配当选图参考。 */
  width?: number
  height?: number
}

const SerperImagesResponseSchema = z.object({
  images: z
    .array(
      z.object({
        title: z.string().optional(),
        imageUrl: z.string().optional(),
        imageWidth: z.number().optional(),
        imageHeight: z.number().optional(),
        thumbnailUrl: z.string().optional(),
        source: z.string().optional(),
        domain: z.string().optional(),
        link: z.string().optional(),
      }),
    )
    .optional(),
})

export function isWebImageSearchConfigured(): boolean {
  return Boolean(process.env.SERPER_API_KEY)
}

function positiveIntOrUndefined(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : undefined
}

/**
 * Serper `/images` —— 与 `webSearch` **同 key 同域、不同路径**，接它不需要任何新凭据。
 *
 * ⚠ 与 `webSearch` 同一条 best-effort 契约：失败返回 `[]` 并 `logger.warn`，
 * **不抛**。理由是调用方（助手工具环）一步失败不该让整轮作废 —— 那条链上每一步
 * 都是一次 LLM 往返，抛出去的表现是「跑到一半整段消失」。代价是「上游挂了」与
 * 「真的一张都没搜到」在日志条上长得一样；⚠ 真要分辨看服务端日志，别在 UI 上猜。
 *
 * ⚠ 每调一次就是一个 Serper credit（免费池 2500）。⛔ 别在任何地方给它加自动重试
 * 或"顺手预取" —— `withRetry` 在这里是**故意没用**的（`webSearch` 用了，因为那条
 * 是一轮研究里的唯一一次调用；这条挂在助手的多步工具环上，重试会把额度按步数翻倍）。
 */
export async function webImageSearch(
  query: string,
  options: { num?: number } = {},
): Promise<WebImageSearchResult[]> {
  const apiKey = process.env.SERPER_API_KEY
  if (!apiKey) {
    logger.warn('webImageSearch skipped: SERPER_API_KEY not configured')
    return []
  }

  const num = Math.min(
    options.num ?? WEB_IMAGE_SEARCH.defaultNumResults,
    WEB_IMAGE_SEARCH.maxNumResults,
  )

  try {
    const response = await fetch(WEB_IMAGE_SEARCH.serperEndpoint, {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: query, num }),
      signal: AbortSignal.timeout(WEB_IMAGE_SEARCH.timeoutMs),
    })
    if (!response.ok) {
      throw markStatus(
        new Error(`Serper image search failed: ${response.status}`),
        response.status,
      )
    }
    const data = SerperImagesResponseSchema.parse(await response.json())

    return (
      (data.images ?? [])
        // 没有原图直链的那些直接丢：候选的全部意义就是「点它能转存」。
        .filter((entry) => Boolean(entry.imageUrl))
        .slice(0, num)
        .map((entry) => ({
          imageUrl: entry.imageUrl ?? '',
          ...(entry.thumbnailUrl ? { thumbnailUrl: entry.thumbnailUrl } : {}),
          ...(entry.link ? { pageUrl: entry.link } : {}),
          // `domain` 有时缺席，`source` 是站点显示名 —— 两者取其一给人看。
          ...(entry.domain || entry.source
            ? { domain: entry.domain ?? entry.source ?? '' }
            : {}),
          ...(entry.title
            ? { title: entry.title.slice(0, WEB_IMAGE_SEARCH.maxTitleLength) }
            : {}),
          ...(positiveIntOrUndefined(entry.imageWidth)
            ? { width: entry.imageWidth }
            : {}),
          ...(positiveIntOrUndefined(entry.imageHeight)
            ? { height: entry.imageHeight }
            : {}),
        }))
    )
  } catch (error) {
    logger.warn('webImageSearch failed', {
      query,
      error: error instanceof Error ? error.message : String(error),
    })
    return []
  }
}

// ─── URL reader (Jina) ───────────────────────────────────────────

/**
 * Read a single URL via Jina Reader (renders JS, returns clean markdown).
 * Best-effort: returns null on an unsafe URL or any fetch failure. The target
 * is SSRF-guarded before we hand it to the reader.
 */
export async function readUrl(rawUrl: string): Promise<FetchedPage | null> {
  let target: string
  try {
    target = assertSafeUrl(rawUrl, {
      allowedProtocols: ['http:', 'https:'],
    }).toString()
  } catch {
    return null
  }

  const headers: Record<string, string> = {
    'X-Return-Format': 'markdown',
  }
  const jinaKey = process.env.JINA_API_KEY
  if (jinaKey) {
    headers.Authorization = `Bearer ${jinaKey}`
  }

  try {
    const content = await withRetry(
      async () => {
        const response = await fetch(`${URL_READER.jinaEndpoint}${target}`, {
          headers,
          signal: AbortSignal.timeout(URL_READER.timeoutMs),
        })
        if (!response.ok) {
          throw markStatus(
            new Error(`URL reader failed: ${response.status}`),
            response.status,
          )
        }
        return response.text()
      },
      { label: 'readUrl.jina' },
    )

    const trimmed = content.trim()
    if (!trimmed) return null
    return {
      url: target,
      content: trimmed.slice(0, URL_READER.maxContentLength),
    }
  } catch (error) {
    logger.warn('readUrl failed', {
      url: target,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

// ─── Orchestrator ────────────────────────────────────────────────

/**
 * Gather web evidence for a research turn: read any URLs in the message (Jina)
 * and search the remaining text (Serper), in parallel. Both steps are
 * best-effort, so the result may be empty — the caller then falls back to
 * provider-native grounding or the model's own knowledge.
 */
export async function gatherWebContext(query: string): Promise<WebContext> {
  const urls = extractUrlsFromText(query, URL_READER.maxUrlsPerTurn)
  const searchQuery = stripUrls(query)

  const [pages, results] = await Promise.all([
    Promise.all(urls.map(readUrl)).then((list) =>
      list.filter((page): page is FetchedPage => page !== null),
    ),
    searchQuery
      ? webSearch(searchQuery)
      : Promise.resolve<WebSearchResult[]>([]),
  ])

  return { results, pages }
}

export function hasWebContext(context: WebContext): boolean {
  return context.results.length > 0 || context.pages.length > 0
}
