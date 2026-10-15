import { z } from 'zod'

import {
  CHUB_LIBRARY,
  CHUB_LIBRARY_SORTS,
} from '@/constants/cards/chub-library'
import {
  ChubCharacterNodeSchema,
  ChubSearchQuerySchema,
  isChubNodeWithinLimit,
  type ChubCardSummary,
  type ChubCharacterNode,
  type ChubSearchQuery,
  type ChubSearchResult,
} from '@/types/chub-library'

/**
 * **卡库读 chub 的规则**（纯函数，浏览器与服务端共用）：拼地址、读搜索结果、读一张卡。
 * 问 chub 的是浏览器（`lib/api-client/cards.ts`，原因见 `CHUB_LIBRARY` 头注）；建卡的
 * 服务端（`chub-library.service`）只用其中的图床与标签判断。
 * ⛔ 成人内容：搜索固定 `nsfw=false&nsfl=false`，再按标签兜一层。
 */

const SearchNodeSchema = z.object({
  fullPath: z.string().min(3),
  name: z.string().catch(''),
  tagline: z.string().nullish().catch(null),
  topics: z.array(z.string()).catch([]),
  avatar_url: z.string().nullish().catch(null),
  starCount: z.number().nullish().catch(null),
  nTokens: z.number().nullish().catch(null),
})

const SearchResponseSchema = z.object({
  data: z.object({ nodes: z.array(z.unknown()) }),
})

const CharacterResponseSchema = z.object({ node: z.unknown() })

/** chub 的标签去掉树根（`ROOT` 不是真标签）。 */
export function realChubTopics(topics: readonly string[]): string[] {
  return topics.filter((topic) => topic && topic !== CHUB_LIBRARY.ROOT_TOPIC)
}

function isAdultTopic(topic: string): boolean {
  return /^nsf[wl]$/i.test(topic.trim())
}

/** 只认 chub 自己的图床（⛔ 跟着上游给的任意地址去取或去显示）。 */
export function isChubImageUrl(
  value: string | null | undefined,
): value is string {
  if (!value) return false
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      CHUB_LIBRARY.IMAGE_HOST_SUFFIXES.some(
        (suffix) =>
          url.hostname === suffix || url.hostname.endsWith(`.${suffix}`),
      )
    )
  } catch {
    return false
  }
}

function encodeFullPath(fullPath: string): string {
  return fullPath.split('/').map(encodeURIComponent).join('/')
}

/** 搜一页的地址（太长的词、越界的页码先回到默认）。 */
export function chubSearchUrl(query: ChubSearchQuery): string {
  const { q, page, sort } = ChubSearchQuerySchema.parse(query)
  const params = new URLSearchParams({
    search: q,
    first: String(CHUB_LIBRARY.PAGE_SIZE),
    page: String(page),
    sort: CHUB_LIBRARY_SORTS[sort],
    asc: 'false',
    nsfw: 'false',
    nsfl: 'false',
  })
  return `${CHUB_LIBRARY.SEARCH_URL}?${params}`
}

/** 一张卡完整定义的地址（`fullPath` 已过 `ChubFullPathSchema`）。 */
export function chubCharacterUrl(fullPath: string): string {
  return `${CHUB_LIBRARY.CHARACTER_URL}/${encodeFullPath(fullPath)}?full=true`
}

function toSummary(node: z.infer<typeof SearchNodeSchema>): ChubCardSummary {
  return {
    fullPath: node.fullPath,
    name: node.name.trim() || node.fullPath.split('/')[1] || node.fullPath,
    tagline: (node.tagline ?? '').trim(),
    tags: realChubTopics(node.topics),
    avatarUrl: isChubImageUrl(node.avatar_url)
      ? node.avatar_url
      : `${CHUB_LIBRARY.AVATAR_URL}/${encodeFullPath(node.fullPath)}/avatar.webp`,
    starCount: node.starCount ?? null,
    tokenCount: node.nTokens ?? null,
  }
}

/**
 * 搜索回来的 JSON → 卡片（坏节点、带成人标签的跳过，⛔ 不拒整页）。形状不对是 `null`。
 * 满一页且没到 `MAX_PAGE` 才算还有下一页。
 */
export function parseChubSearch(
  json: unknown,
  page: number,
): ChubSearchResult | null {
  const parsed = SearchResponseSchema.safeParse(json)
  if (!parsed.success) return null
  const nodes = parsed.data.data.nodes
  const items = nodes.flatMap((raw) => {
    const node = SearchNodeSchema.safeParse(raw)
    if (!node.success) return []
    if (node.data.topics.some(isAdultTopic)) return []
    return [toSummary(node.data)]
  })
  return {
    items,
    page,
    hasMore:
      nodes.length >= CHUB_LIBRARY.PAGE_SIZE && page < CHUB_LIBRARY.MAX_PAGE,
  }
}

/**
 * 一张卡的 JSON → 递给服务端建卡的 `node`（只留落格要的几格）。读不出来算「没这张卡」；
 * 有一格超长或整张卡超过文件导入的上限算「太大」。
 */
export function parseChubCharacter(
  json: unknown,
):
  | { success: true; node: ChubCharacterNode }
  | { success: false; reason: 'notFound' | 'tooLarge' } {
  const envelope = CharacterResponseSchema.safeParse(json)
  const parsed = ChubCharacterNodeSchema.safeParse(
    envelope.success ? envelope.data.node : null,
  )
  if (!parsed.success) {
    const tooBig = parsed.error.issues.some((issue) => issue.code === 'too_big')
    return { success: false, reason: tooBig ? 'tooLarge' : 'notFound' }
  }
  if (!isChubNodeWithinLimit(parsed.data)) {
    return { success: false, reason: 'tooLarge' }
  }
  return { success: true, node: parsed.data }
}

/** chub 的 403「This service is not available in your country.」（它拒这个网络）。 */
export function isChubCountryBlock(status: number, body: string): boolean {
  return (
    status === 403 &&
    body.toLowerCase().includes(CHUB_LIBRARY.COUNTRY_BLOCK_TEXT)
  )
}
