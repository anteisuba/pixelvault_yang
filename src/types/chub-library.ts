import { z } from 'zod'

import {
  CHUB_LIBRARY,
  CHUB_LIBRARY_SORT_KEYS,
} from '@/constants/cards/chub-library'
import { TAVERN_CARD } from '@/constants/cards/tavern-card'

/** 卡库搜索的查询（浏览器问 chub 之前过一遍：太长的词、越界的页码回到默认）。 */
export const ChubSearchQuerySchema = z.object({
  q: z.string().trim().max(CHUB_LIBRARY.QUERY_MAX_LENGTH).catch(''),
  page: z.coerce.number().int().min(1).max(CHUB_LIBRARY.MAX_PAGE).catch(1),
  sort: z.enum(CHUB_LIBRARY_SORT_KEYS).catch('popular'),
})

export type ChubSearchQuery = z.infer<typeof ChubSearchQuerySchema>

/**
 * `作者/卡名`：两段、不带空白与 `? #`。⚠ 只用来拼 chub 的地址，每段另做
 * `encodeURIComponent`。
 */
export const ChubFullPathSchema = z
  .string()
  .trim()
  .max(CHUB_LIBRARY.FULL_PATH_MAX_LENGTH)
  .regex(/^[^/\s?#]+\/[^/\s?#]+$/, 'Expected creator/name')

/** 卡库里的一张卡（只够画卡片；完整定义在导入那一步才取）。 */
export const ChubCardSummarySchema = z.object({
  fullPath: z.string(),
  name: z.string(),
  tagline: z.string(),
  tags: z.array(z.string()),
  avatarUrl: z.string().nullable(),
  starCount: z.number().nullable(),
  tokenCount: z.number().nullable(),
})

export type ChubCardSummary = z.infer<typeof ChubCardSummarySchema>

export interface ChubSearchResult {
  items: ChubCardSummary[]
  page: number
  hasMore: boolean
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

/**
 * 别人的卡缺格、类型不对是常态 —— 与文件导入一样当空值（⛔ 不因一格坏了整卡拒收）；
 * 但**超长一律拒**：这张卡是浏览器递上来的，当用户输入看。
 */
function chubText(max: number) {
  return z.preprocess(
    (value) => (typeof value === 'string' ? value : ''),
    z.string().max(max),
  )
}

/** 一串字：整串都是字才收，否则当空（与 `TavernCardFieldsSchema` 的 `.catch([])` 同宽）。 */
function chubTextList(maxItems: number, maxChars: number) {
  return z.preprocess(
    (value) => (isStringList(value) ? value : []),
    z.array(z.string().max(maxChars)).max(maxItems),
  )
}

const LONG_TEXT = TAVERN_CARD.MAX_FILE_BYTES

/**
 * chub 一张卡的 `definition`（`/api/characters/<作者>/<卡名>?full=true` 的 `node.definition`），
 * 只留落格要的几格（其余键在解析时丢掉，递给服务端的也只有这些）。
 */
export const ChubCardDefinitionSchema = z.object({
  name: chubText(CHUB_LIBRARY.NODE_LIMITS.NAME),
  personality: chubText(LONG_TEXT),
  tavern_personality: chubText(LONG_TEXT),
  scenario: chubText(LONG_TEXT),
  first_message: chubText(LONG_TEXT),
  example_dialogs: chubText(LONG_TEXT),
  description: chubText(LONG_TEXT),
  system_prompt: chubText(LONG_TEXT),
  post_history_instructions: chubText(LONG_TEXT),
  alternate_greetings: chubTextList(
    CHUB_LIBRARY.NODE_LIMITS.LIST_ITEMS,
    LONG_TEXT,
  ),
  /** 世界书：原样存（与文件导入的 `character_book` 一样），大小归整张卡的上限管。 */
  embedded_lorebook: z.unknown().optional(),
})

/** chub 一张卡的 `node`（浏览器取来、原样递给 `POST /api/character-cards/chub/import`）。 */
export const ChubCharacterNodeSchema = z.object({
  name: chubText(CHUB_LIBRARY.NODE_LIMITS.NAME),
  topics: chubTextList(
    CHUB_LIBRARY.NODE_LIMITS.LIST_ITEMS,
    CHUB_LIBRARY.NODE_LIMITS.TOPIC,
  ),
  max_res_url: z.preprocess(
    (value) => (typeof value === 'string' ? value : null),
    z.string().max(CHUB_LIBRARY.NODE_LIMITS.URL).nullable(),
  ),
  definition: ChubCardDefinitionSchema,
})

export type ChubCharacterNode = z.infer<typeof ChubCharacterNodeSchema>

/** 整张卡序列化后不超过文件导入的上限（`TAVERN_CARD.MAX_FILE_BYTES`，按字节）。 */
export function isChubNodeWithinLimit(node: ChubCharacterNode): boolean {
  return (
    new TextEncoder().encode(JSON.stringify(node)).byteLength <=
    TAVERN_CARD.MAX_FILE_BYTES
  )
}

/**
 * POST `/api/character-cards/chub/import`：路径 + 浏览器从 chub 取到的那张卡。服务端
 * 把 `node` 当拖进来的卡文件看（校验形状、各格上限、整张卡大小），⛔ 再去问 chub。
 */
export const ImportChubCardSchema = z.object({
  fullPath: ChubFullPathSchema,
  node: ChubCharacterNodeSchema.refine(isChubNodeWithinLimit, {
    message: 'Card is larger than the import limit',
  }),
})

export type ImportChubCardRequest = z.infer<typeof ImportChubCardSchema>
