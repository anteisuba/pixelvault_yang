import 'server-only'

import { z } from 'zod'

import { SEMANTIC_SEARCH, type SemanticKind } from '@/constants/semantic-search'
import { logger } from '@/lib/logger'

/**
 * 按意思搜（`workers/semantic-index`）：各个库共用的一个接头。
 *
 * ⭐ 查是锦上添花：没配置 / 超时 / Worker 出错一律回空，⛔ 让调用方的字面搜索跟着失败。
 * ⭐ 写（导入脚本、同步）照常抛错：漏写了要让跑的人看见。
 */

const MatchSchema = z.object({
  key: z.string(),
  score: z.number(),
  meta: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
})
const QueryResponseSchema = z.object({ matches: z.array(MatchSchema) })

export type SemanticMatch = z.infer<typeof MatchSchema>

export interface SemanticItem {
  kind: SemanticKind
  key: string
  text: string
  meta?: Record<string, string | number | boolean>
}

function endpoint(): { baseUrl: string; token: string } | null {
  const baseUrl = process.env.SEMANTIC_INDEX_URL
  const token = process.env.SEMANTIC_INDEX_TOKEN
  return baseUrl && token ? { baseUrl, token } : null
}

async function callIndex(
  path: string,
  body: unknown,
  timeoutMs: number,
): Promise<unknown> {
  const target = endpoint()
  if (!target) {
    throw new Error(
      'SEMANTIC_INDEX_URL / SEMANTIC_INDEX_TOKEN are not configured',
    )
  }
  const response = await fetch(new URL(path, target.baseUrl), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${target.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!response.ok) {
    throw new Error(`Semantic index responded ${response.status}`)
  }
  return response.json()
}

export interface SearchByMeaningInput {
  kind: SemanticKind
  text: string
  /** Danbooru 类别号；不给 = 不筛。 */
  categories?: readonly number[]
  topK: number
  namespace?: string
}

/** 意思最近的几条（已按 `MIN_SCORE` 去掉对不上的），从近到远。 */
export async function searchByMeaning(
  input: SearchByMeaningInput,
): Promise<SemanticMatch[]> {
  const text = input.text.trim()
  if (!text || !endpoint()) return []
  try {
    const { matches } = QueryResponseSchema.parse(
      await callIndex(
        '/query',
        {
          namespace: input.namespace ?? SEMANTIC_SEARCH.PUBLIC_NAMESPACE,
          kind: input.kind,
          text,
          categories: input.categories?.length
            ? [...input.categories]
            : undefined,
          topK: input.topK,
        },
        SEMANTIC_SEARCH.QUERY_TIMEOUT_MS,
      ),
    )
    return matches.filter((match) => match.score >= SEMANTIC_SEARCH.MIN_SCORE)
  } catch (error) {
    logger.warn('semantic search unavailable', {
      kind: input.kind,
      error: error instanceof Error ? error.message : String(error),
    })
    return []
  }
}

/** 存进去（同 kind + key 覆盖），分批写；回写入条数。 */
export async function storeByMeaning(
  items: readonly SemanticItem[],
  namespace: string = SEMANTIC_SEARCH.PUBLIC_NAMESPACE,
): Promise<number> {
  let stored = 0
  for (
    let index = 0;
    index < items.length;
    index += SEMANTIC_SEARCH.UPSERT_BATCH
  ) {
    const batch = items.slice(index, index + SEMANTIC_SEARCH.UPSERT_BATCH)
    await callIndex(
      '/upsert',
      { namespace, items: batch.map((item) => ({ meta: {}, ...item })) },
      SEMANTIC_SEARCH.UPSERT_TIMEOUT_MS,
    )
    stored += batch.length
  }
  return stored
}

/** 删掉这些（同 kind + key），分批删。删不掉照常抛错：漏删了要让调用方知道。 */
export async function forgetByMeaning(
  items: readonly { kind: SemanticKind; key: string }[],
  namespace: string,
): Promise<void> {
  for (
    let index = 0;
    index < items.length;
    index += SEMANTIC_SEARCH.UPSERT_BATCH
  ) {
    await callIndex(
      '/delete',
      {
        namespace,
        items: items.slice(index, index + SEMANTIC_SEARCH.UPSERT_BATCH),
      },
      SEMANTIC_SEARCH.UPSERT_TIMEOUT_MS,
    )
  }
}
