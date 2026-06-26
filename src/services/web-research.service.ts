import 'server-only'

import { z } from 'zod'

import { URL_READER, WEB_SEARCH } from '@/constants/web-search'
import { assertSafeUrl } from '@/lib/url-guard'
import { logger } from '@/lib/logger'
import { withRetry } from '@/lib/with-retry'

// ─── Types ───────────────────────────────────────────────────────

export interface WebSearchResult {
  title: string
  url: string
  snippet: string
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
      }),
    )
    .optional(),
})

// ─── Helpers ─────────────────────────────────────────────────────

const URL_PATTERN = /https?:\/\/[^\s<>"')]+/gi

function extractUrls(text: string): string[] {
  const matches = text.match(URL_PATTERN) ?? []
  const seen = new Set<string>()
  const urls: string[] = []
  for (const raw of matches) {
    // Trim trailing punctuation the URL regex greedily swallowed.
    const url = raw.replace(/[.,;]+$/, '')
    if (seen.has(url)) continue
    seen.add(url)
    urls.push(url)
  }
  return urls.slice(0, URL_READER.maxUrlsPerTurn)
}

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
  options: { includeDomains?: string[]; num?: number } = {},
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
          body: JSON.stringify({ q, num }),
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
      }))
  } catch (error) {
    logger.warn('webSearch failed', {
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
  const urls = extractUrls(query)
  const searchQuery = query
    .replace(URL_PATTERN, ' ')
    .replace(/\s+/g, ' ')
    .trim()

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
