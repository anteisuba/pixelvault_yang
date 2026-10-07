import { FULL_ATTRIBUTES, LIGHT_ATTRIBUTES } from './rows'

const SEARCH_URL = 'https://search-new.civitai.com/multi-search'
const SEARCH_INDEX = 'models_v9'
// civitai.com 自己的搜索页随前端下发的公开只读 key，不是私密凭证。
// 应用侧 `civitai-lora.service.ts` 里是同一个值。
const SEARCH_PUBLIC_KEY =
  '8c46eb2508e21db1e9828a97968d91ab1ca1caa5f70a00e88a2ba1e286603b61'
const TYPE_FILTER = 'type IN [LoRA, LoCon, DoRA]'
const REQUEST_TIMEOUT_MS = 30_000

/**
 * 上游 meilisearch 把 offset 翻页与总数都封顶在 1000（2026-10-07 实测），
 * 但 `id` 可过滤可排序：按 `id > 上一页最后一个` 续翻，每页都是 offset 0，
 * 封顶碰不到，整个目录都扫得到。
 */
export const LIGHT_PAGE_SIZE = 1000
/** 完整字段一千条约 7 MB；按 250 一批拉，单次响应压在 2 MB 上下。 */
export const FULL_BATCH_SIZE = 250

export interface Upstream {
  /** id 大于 `afterId` 的下一页轻量 hit，按 id 升序。 */
  lightPage(afterId: number): Promise<unknown[]>
  /** 指定 id 的完整 hit。 */
  fullHits(ids: readonly number[]): Promise<unknown[]>
}

async function search(query: Record<string, unknown>): Promise<unknown[]> {
  const response = await fetch(SEARCH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SEARCH_PUBLIC_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ queries: [{ indexUid: SEARCH_INDEX, ...query }] }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!response.ok) {
    throw new Error(`Civitai search responded ${response.status}`)
  }
  const payload = (await response.json()) as {
    results?: { hits?: unknown }[]
  }
  const hits = payload.results?.[0]?.hits
  // ⚠ 读不懂的 200（公钥轮换后的错误体、索引名被上游 bump）必须抛错，不能当
  // 成空页——空页在同步里是「目录扫到头」，会把尾部当成已删除清掉。
  if (!Array.isArray(hits)) {
    throw new Error('Civitai search returned an unreadable payload')
  }
  return hits
}

export const civitaiUpstream: Upstream = {
  lightPage: (afterId) =>
    search({
      q: '',
      limit: LIGHT_PAGE_SIZE,
      filter: [TYPE_FILTER, `id > ${afterId}`],
      sort: ['id:asc'],
      attributesToRetrieve: [...LIGHT_ATTRIBUTES],
    }),
  fullHits: (ids) =>
    ids.length === 0
      ? Promise.resolve([])
      : search({
          q: '',
          limit: ids.length,
          filter: [TYPE_FILTER, `id IN [${ids.join(', ')}]`],
          sort: ['id:asc'],
          attributesToRetrieve: [...FULL_ATTRIBUTES],
        }),
}
