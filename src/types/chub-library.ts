import { z } from 'zod'

import {
  CHUB_LIBRARY,
  CHUB_LIBRARY_SORT_KEYS,
} from '@/constants/cards/chub-library'

/** GET `/api/character-cards/chub` 的查询参数。 */
export const ChubSearchQuerySchema = z.object({
  q: z.string().trim().max(CHUB_LIBRARY.QUERY_MAX_LENGTH).catch(''),
  page: z.coerce
    .number()
    .int()
    .min(1)
    .max(CHUB_LIBRARY.MAX_PAGE)
    .catch(1),
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

/** POST `/api/character-cards/chub/import`。 */
export const ImportChubCardSchema = z.object({ fullPath: ChubFullPathSchema })

export type ImportChubCardRequest = z.infer<typeof ImportChubCardSchema>
