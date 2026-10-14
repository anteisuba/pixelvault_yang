import 'server-only'

import { z } from 'zod'

import {
  CHUB_LIBRARY,
  CHUB_LIBRARY_ERRORS,
  CHUB_LIBRARY_SORTS,
} from '@/constants/cards/chub-library'
import { TAVERN_CARD } from '@/constants/cards/tavern-card'
import type { CharacterCardRecord } from '@/types'
import type {
  ChubCardSummary,
  ChubSearchQuery,
  ChubSearchResult,
  ImportChubCardRequest,
} from '@/types/chub-library'
import { ApiRequestError } from '@/lib/errors'
import { logger } from '@/lib/logger'
import {
  isPng,
  mapTavernCard,
  parseTavernCard,
  stripPngTextChunks,
} from '@/lib/tavern-card'
import { createImportedCharacterCard } from '@/services/cards/character-card.service'

/**
 * **酒馆卡库**（角色页「卡库」页签）：搜 chub.ai、把一张卡建成我们的角色卡。
 *
 * 搜索只取画卡片要的几格；导入时再取完整定义（与酒馆 `downloadChubCharacter`
 * 同一个接口、同一套字段落点），交给文件导入那一条（`mapTavernCard` →
 * `createImportedCharacterCard`）—— 世界书、卡自带系统提示词照样只存不注入。
 * ⛔ 成人内容：搜索固定 `nsfw=false`，再按标签兜一层。
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

const CharacterResponseSchema = z.object({
  node: z.object({
    name: z.string().catch(''),
    topics: z.array(z.string()).catch([]),
    max_res_url: z.string().nullish().catch(null),
    definition: z.record(z.string(), z.unknown()),
  }),
})

function chubError(kind: keyof typeof CHUB_LIBRARY_ERRORS): ApiRequestError {
  const error = CHUB_LIBRARY_ERRORS[kind]
  return new ApiRequestError(
    error.code,
    error.httpStatus,
    error.i18nKey,
    error.message,
  )
}

/** chub 的 JSON：超时、网络错、非 2xx 一律「chub 没回」（404 另算）。 */
async function fetchChubJson(url: string): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': CHUB_LIBRARY.USER_AGENT,
      },
      signal: AbortSignal.timeout(CHUB_LIBRARY.TIMEOUT_MS),
      cache: 'no-store',
    })
  } catch (error) {
    logger.warn('chub request failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    throw chubError('unavailable')
  }
  if (response.status === 404) throw chubError('notFound')
  if (!response.ok) {
    logger.warn('chub responded with an error', { status: response.status })
    throw chubError('unavailable')
  }
  return response.json().catch(() => {
    throw chubError('unavailable')
  })
}

function realTopics(topics: readonly string[]): string[] {
  return topics.filter((topic) => topic && topic !== CHUB_LIBRARY.ROOT_TOPIC)
}

function isAdultTopic(topic: string): boolean {
  return /^nsf[wl]$/i.test(topic.trim())
}

/** 只认 chub 自己的图床（⛔ 跟着上游给的任意地址去取或去显示）。 */
function isChubImageUrl(value: string | null | undefined): value is string {
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

function toSummary(node: z.infer<typeof SearchNodeSchema>): ChubCardSummary {
  return {
    fullPath: node.fullPath,
    name: node.name.trim() || node.fullPath.split('/')[1] || node.fullPath,
    tagline: (node.tagline ?? '').trim(),
    tags: realTopics(node.topics),
    avatarUrl: isChubImageUrl(node.avatar_url)
      ? node.avatar_url
      : `${CHUB_LIBRARY.AVATAR_URL}/${encodeFullPath(node.fullPath)}/avatar.webp`,
    starCount: node.starCount ?? null,
    tokenCount: node.nTokens ?? null,
  }
}

export async function searchChubCards(
  query: ChubSearchQuery,
): Promise<ChubSearchResult> {
  const params = new URLSearchParams({
    search: query.q,
    first: String(CHUB_LIBRARY.PAGE_SIZE),
    page: String(query.page),
    sort: CHUB_LIBRARY_SORTS[query.sort],
    asc: 'false',
    nsfw: 'false',
    nsfl: 'false',
  })
  const json = await fetchChubJson(`${CHUB_LIBRARY.SEARCH_URL}?${params}`)
  const parsed = SearchResponseSchema.safeParse(json)
  if (!parsed.success) {
    logger.warn('chub search returned an unexpected shape')
    throw chubError('unavailable')
  }
  const nodes = parsed.data.data.nodes
  const items = nodes.flatMap((raw) => {
    const node = SearchNodeSchema.safeParse(raw)
    if (!node.success) return []
    if (node.data.topics.some(isAdultTopic)) return []
    return [toSummary(node.data)]
  })
  return {
    items,
    page: query.page,
    hasMore:
      nodes.length >= CHUB_LIBRARY.PAGE_SIZE &&
      query.page < CHUB_LIBRARY.MAX_PAGE,
  }
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** 卡图：拿不到、太大、不是图都只是「没有图」，⛔ 不因此拒整张卡。 */
async function fetchCardImage(
  url: string | null | undefined,
): Promise<{ data: Buffer; mimeType: string } | null> {
  if (!isChubImageUrl(url)) return null
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(CHUB_LIBRARY.TIMEOUT_MS),
      cache: 'no-store',
    })
    const mimeType = (response.headers.get('content-type') ?? '')
      .split(';')[0]
      .trim()
      .toLowerCase()
    if (
      !response.ok ||
      !(CHUB_LIBRARY.IMAGE_MIME_TYPES as readonly string[]).includes(mimeType)
    ) {
      return null
    }
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength > CHUB_LIBRARY.IMAGE_MAX_BYTES) return null
    // PNG 卡图常把整张卡塞在文本块里：去掉再存（与文件导入同一条）。
    const data = isPng(bytes) ? stripPngTextChunks(bytes) : bytes
    return { data: Buffer.from(data), mimeType }
  } catch (error) {
    logger.warn('chub card image fetch failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

export async function importChubCard(
  clerkId: string,
  input: ImportChubCardRequest,
): Promise<CharacterCardRecord> {
  const json = await fetchChubJson(
    `${CHUB_LIBRARY.CHARACTER_URL}/${encodeFullPath(input.fullPath)}?full=true`,
  )
  const parsed = CharacterResponseSchema.safeParse(json)
  if (!parsed.success) throw chubError('notFound')
  const { node } = parsed.data
  const definition = node.definition
  const [creator] = input.fullPath.split('/')

  // chub 的定义 → 酒馆 V2 卡（字段落点照酒馆 `downloadChubCharacter`：chub 的
  // `personality` 才是酒馆的 description，`description` 是作者写给读者的简介）。
  const card = parseTavernCard({
    spec: TAVERN_CARD.SPEC_V2,
    spec_version: '2.0',
    data: {
      name: text(definition.name).trim() || node.name,
      description: text(definition.personality),
      personality: text(definition.tavern_personality),
      scenario: text(definition.scenario),
      first_mes: text(definition.first_message),
      mes_example: text(definition.example_dialogs),
      creator_notes: text(definition.description),
      system_prompt: text(definition.system_prompt),
      post_history_instructions: text(definition.post_history_instructions),
      alternate_greetings: definition.alternate_greetings,
      tags: realTopics(node.topics),
      creator,
      character_version: '',
      character_book: definition.embedded_lorebook ?? undefined,
    },
  })
  if (!card) throw chubError('notFound')

  const imported = mapTavernCard(card)
  const stCard = imported.extensions[TAVERN_CARD.EXTENSION_KEY]
  const withSource = {
    ...imported,
    extensions: {
      [TAVERN_CARD.EXTENSION_KEY]: {
        ...(stCard && typeof stCard === 'object' ? stCard : {}),
        source: 'chub',
        fullPath: input.fullPath,
      },
    },
  }

  return createImportedCharacterCard(
    clerkId,
    withSource,
    await fetchCardImage(node.max_res_url),
  )
}
