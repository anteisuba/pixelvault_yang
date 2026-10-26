/**
 * LoRA 按意思搜：每个 LoRA 的「名字 + 标签 + 触发词 + 底模」经 semantic-index（Workers AI
 * 转向量 + Vectorize）存一份，搜索时把字面没搜到、意思接近的接在字面结果后面（owner
 * 2026-10-25 定：字面在前，意思接后）。向量库只存 model_id，展示的数据照旧从 D1 读，
 * 筛选也照旧——向量库里多出来的旧行（上游删了的 LoRA）回 D1 时自然对不上，不用专门删。
 */

/** 与 semantic-index 的 SemanticIndex 入口（service binding RPC）对应的那一小片。 */
export interface SemanticIndexBinding {
  query(input: {
    namespace: string
    text: string
    kind: string
    topK: number
  }): Promise<{ key: string; score: number }[]>
  upsert(input: {
    namespace: string
    items: { kind: string; key: string; text: string }[]
  }): Promise<number>
}

export const LORA_KIND = 'civitai-lora'
export const PUBLIC_NAMESPACE = 'public'
/** 一个 workflow step 算多少行（≈ 160 次模型调用，十几秒）。 */
export const EMBED_ROWS_PER_STEP = 5000
/** semantic-index 一次最多收 1000 条。 */
const UPSERT_CHUNK_SIZE = 1000
const MAX_TEXT_CHARS = 600
const MAX_TAGS = 12
const MAX_TRIGGER_WORDS = 5
const MAX_TRIGGER_WORD_CHARS = 60

/** 每次搜索最多接多少条「意思接近」的（Vectorize 带元数据返回时 topK 上限 50）。 */
export const SEMANTIC_TOP_K = 50
/**
 * 低于它不算「意思接近」。2026-10-25 首灌后线上实测（13 句中日英）：真命中 0.53–0.71（水彩风 0.71、
 * 厚涂 0.65、猫耳少女 0.54），乱打的字最高 0.45。LoRA 存的字长，分数整体比 Danbooru 标签（0.55）低。
 */
export const SEMANTIC_MIN_SCORE = 0.5

export function loraMeaningText(row: {
  modelId: number
  name: string
  tags: readonly string[]
  trainedWords: readonly string[]
  baseModel: string | null
}): string {
  const parts = [row.name.trim() || `LoRA ${row.modelId}`]
  const tags = row.tags.slice(0, MAX_TAGS)
  if (tags.length > 0) parts.push(`tags: ${tags.join(', ')}`)
  const triggers = row.trainedWords
    .map((word) => word.trim().slice(0, MAX_TRIGGER_WORD_CHARS))
    .filter(Boolean)
    .slice(0, MAX_TRIGGER_WORDS)
  if (triggers.length > 0) parts.push(`triggers: ${triggers.join(', ')}`)
  if (row.baseModel) parts.push(`base: ${row.baseModel}`)
  return parts.join(' / ').slice(0, MAX_TEXT_CHARS)
}

function parseStrings(text: string): string[] {
  try {
    const value: unknown = JSON.parse(text)
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : []
  } catch {
    return []
  }
}

interface PendingRow {
  model_id: number
  name: string
  tags: string
  trained_words: string
  base_model: string | null
  light_fp: string
}

// ⚠ WHERE 必须与迁移 0007 的部分索引条件一字不差，规划器才走那份索引。
const PENDING_SQL = `SELECT model_id, name, tags, trained_words, base_model, light_fp
  FROM lora INDEXED BY lora_embed_pending WHERE embedded_fp IS NOT light_fp
  ORDER BY model_id LIMIT ?1`

// 记的是读出来时的指纹：算的途中这行被同步改了，指纹对不上，下一轮再算。
const MARK_SQL = `UPDATE lora SET embedded_fp = json_extract(j.value, '$.fp')
  FROM json_each(?1) AS j
  WHERE lora.model_id = json_extract(j.value, '$.id')`

/** 算一批没算过（或变过）的行。done = 没有剩下的了。 */
export async function embedPending(
  db: D1Database,
  semantic: SemanticIndexBinding,
  limit = EMBED_ROWS_PER_STEP,
): Promise<{ embedded: number; done: boolean }> {
  const { results } = await db
    .prepare(PENDING_SQL)
    .bind(limit)
    .all<PendingRow>()
  for (let index = 0; index < results.length; index += UPSERT_CHUNK_SIZE) {
    const rows = results.slice(index, index + UPSERT_CHUNK_SIZE)
    await semantic.upsert({
      namespace: PUBLIC_NAMESPACE,
      items: rows.map((row) => ({
        kind: LORA_KIND,
        key: String(row.model_id),
        text: loraMeaningText({
          modelId: row.model_id,
          name: row.name,
          tags: parseStrings(row.tags),
          trainedWords: parseStrings(row.trained_words),
          baseModel: row.base_model,
        }),
      })),
    })
    await db
      .prepare(MARK_SQL)
      .bind(
        JSON.stringify(
          rows.map((row) => ({ id: row.model_id, fp: row.light_fp })),
        ),
      )
      .run()
  }
  return { embedded: results.length, done: results.length < limit }
}

/**
 * 同一句话翻页、改筛选时不再算一次（每个 isolate 各记一份，最多这么多句）。记的是还在算的
 * 那个 promise：这一次没等它（见 search.ts 的限时），下一页直接接着用。
 */
const QUERY_CACHE_SIZE = 200
const QUERY_CACHE_TTL_MS = 10 * 60 * 1000
const queryCache = new Map<string, { at: number; ids: Promise<number[]> }>()

async function queryLoras(
  semantic: SemanticIndexBinding,
  text: string,
): Promise<number[]> {
  try {
    const matches = await semantic.query({
      namespace: PUBLIC_NAMESPACE,
      text,
      kind: LORA_KIND,
      topK: SEMANTIC_TOP_K,
    })
    return matches
      .filter((match) => match.score >= SEMANTIC_MIN_SCORE)
      .map((match) => Number(match.key))
      .filter((id) => Number.isSafeInteger(id))
  } catch (error) {
    // 出错的不记：下一次再问。
    queryCache.delete(text)
    console.log(
      JSON.stringify({
        event: 'semantic_query_failed',
        message: error instanceof Error ? error.message : 'Unknown',
      }),
    )
    return []
  }
}

/**
 * 意思接近的 model_id，按相似度从高到低。⭐ 这是锦上添花：语义那边出任何错都只当没有，
 * 字面结果照常返回。
 */
export function findLorasByMeaning(
  semantic: SemanticIndexBinding | undefined,
  q: string,
): Promise<number[]> {
  const text = q.trim().toLowerCase()
  if (!semantic || !text) return Promise.resolve([])
  const cached = queryCache.get(text)
  if (cached && Date.now() - cached.at < QUERY_CACHE_TTL_MS) return cached.ids
  const ids = queryLoras(semantic, text)
  queryCache.delete(text)
  queryCache.set(text, { at: Date.now(), ids })
  if (queryCache.size > QUERY_CACHE_SIZE) {
    queryCache.delete(queryCache.keys().next().value as string)
  }
  return ids
}

/** 测试用：清掉上一条用例记下的查询。 */
export function clearMeaningCache(): void {
  queryCache.clear()
}
