import { z } from 'zod'

import type { IndexImage, IndexPermissions } from './rows'

/**
 * 搜索与浏览的唯一入口。业务口径（安全档的分级线、家族对应哪些 baseModel、
 * 内容类型对应哪些标签）都由应用侧算好传进来，这里只把结构化条件翻成 SQL——
 * 白名单拼接，用户输入一律走参数。
 */
export const SearchInputSchema = z.object({
  q: z.string().trim().max(200).default(''),
  /** 精确的 base_model 取值；空 = 不限 */
  baseModels: z.array(z.string().min(1).max(100)).max(40).default([]),
  /** 「其他」桶：排除这些 base_model（没有 base_model 的也算其他） */
  excludeBaseModels: z.array(z.string().min(1).max(100)).max(40).default([]),
  nsfw: z
    .object({
      /** 至少有一张图的分级 ≤ 它（安全档） */
      someImageAtMost: z.number().int().optional(),
      /** 至少有一张图的分级 > 它（仅 NSFW 档） */
      someImageAbove: z.number().int().optional(),
    })
    .default({}),
  /** 内容类型：命中任一标签（精确）或名字含任一关键词 */
  contentType: z
    .object({
      tags: z.array(z.string().min(1).max(60)).max(20),
      nameKeywords: z.array(z.string().min(1).max(60)).max(20),
    })
    .nullable()
    .default(null),
  /** relevance 需要 q；没有 q 时按 thumbs 排 */
  sort: z.enum(['relevance', 'thumbs', 'downloads', 'newest']),
  page: z.number().int().min(1).max(10_000).default(1),
  pageSize: z.number().int().min(1).max(100).default(12),
})

export type SearchInput = z.infer<typeof SearchInputSchema>

export interface SearchRow {
  modelId: number
  versionId: number
  versionName: string | null
  name: string
  creator: string | null
  creatorImage: string | null
  modelType: string
  nsfw: boolean
  baseModel: string | null
  tags: string[]
  trainedWords: string[]
  hashAutoV3: string | null
  downloadCount: number
  thumbsUpCount: number
  images: IndexImage[]
  permissions: IndexPermissions
  createdAt: number
}

export interface SearchResult {
  rows: SearchRow[]
  total: number
  /** 索引最近一次完整同步的时刻（unix ms），从没同步完是 null */
  syncedAt: number | null
}

/** trigram 分词至少要 3 个字；更短的中日韩词查 lora_cjk，其余退回 LIKE。 */
const TRIGRAM_MIN_CHARS = 3
const CJK_ONLY =
  /^[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]+$/

/**
 * 命中数不少于它时，让规划器沿排序索引走、边走边过滤、够一页就停（过滤列前面
 * 加一元 `+`，它们就不能当索引用）；少于它时按过滤条件取出再排序。热门底模
 * 第 11 页 0.55 s → 34 ms，而冷门底模反过来 1 ms → 0.9 s，所以按总数切换。
 */
const WALK_ORDER_INDEX_MIN_TOTAL = 2000
const MAX_QUERY_TERMS = 8

function charLength(text: string): number {
  return [...text].length
}

/** FTS5 字符串：双引号包起来，内部双引号写两遍。 */
function ftsString(text: string): string {
  return `"${text.replaceAll('"', '""')}"`
}

/**
 * 标签列存的是 JSON 文本（`["anime","style"]`），把引号也算进短语里，
 * `"style"` 就只命中整个标签 style，不会命中 lifestyle。
 */
function ftsExactTag(tag: string): string {
  return ftsString(`"${tag}"`)
}

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`)
}

interface BuiltQuery {
  where: string
  orderBy: string
  /** 先是 WHERE 的参数（共 whereParamCount 个），再是 ORDER BY 的 */
  params: unknown[]
  whereParamCount: number
}

export function buildSearchQuery(
  input: SearchInput,
  { walkOrderIndex = false }: { walkOrderIndex?: boolean } = {},
): BuiltQuery {
  const params: unknown[] = []
  const param = (value: unknown) => {
    params.push(value)
    return `?${params.length}`
  }
  const col = (name: string) => (walkOrderIndex ? `+${name}` : name)
  const where: string[] = []

  if (input.nsfw.someImageAtMost !== undefined) {
    where.push(
      `${col('nsfw_level_min')} <= ${param(input.nsfw.someImageAtMost)}`,
    )
  }
  if (input.nsfw.someImageAbove !== undefined) {
    where.push(`${col('nsfw_level_max')} > ${param(input.nsfw.someImageAbove)}`)
  }

  if (input.baseModels.length > 0) {
    where.push(
      `${col('base_model')} IN (${input.baseModels.map(param).join(', ')})`,
    )
  }
  if (input.excludeBaseModels.length > 0) {
    where.push(
      `(base_model IS NULL OR ${col('base_model')} NOT IN (${input.excludeBaseModels
        .map(param)
        .join(', ')}))`,
    )
  }

  const query = input.q.toLowerCase()
  const terms = [...new Set(query.split(/\s+/).filter(Boolean))].slice(
    0,
    MAX_QUERY_TERMS,
  )
  const longTerms = terms.filter(
    (term) => charLength(term) >= TRIGRAM_MIN_CHARS,
  )
  const shortTerms = terms.filter(
    (term) => charLength(term) < TRIGRAM_MIN_CHARS,
  )
  if (longTerms.length > 0) {
    where.push(
      `${col('model_id')} IN (SELECT rowid FROM lora_fts WHERE lora_fts MATCH ${param(
        longTerms.map(ftsString).join(' '),
      )})`,
    )
  }
  for (const term of shortTerms) {
    where.push(
      CJK_ONLY.test(term)
        ? `${col('model_id')} IN (SELECT rowid FROM lora_cjk WHERE lora_cjk MATCH ${param(ftsString(term))})`
        : `lower(name) LIKE ${param(`%${escapeLike(term)}%`)} ESCAPE '\\'`,
    )
  }

  if (input.contentType) {
    const matchParts: string[] = []
    if (input.contentType.tags.length > 0) {
      matchParts.push(
        `tags : (${input.contentType.tags.map(ftsExactTag).join(' OR ')})`,
      )
    }
    const keywords = input.contentType.nameKeywords.map((keyword) =>
      keyword.toLowerCase(),
    )
    const longKeywords = keywords.filter(
      (keyword) => charLength(keyword) >= TRIGRAM_MIN_CHARS,
    )
    if (longKeywords.length > 0) {
      matchParts.push(`name : (${longKeywords.map(ftsString).join(' OR ')})`)
    }
    const anyOf: string[] = []
    if (matchParts.length > 0) {
      anyOf.push(
        `${col('model_id')} IN (SELECT rowid FROM lora_fts WHERE lora_fts MATCH ${param(
          matchParts.join(' OR '),
        )})`,
      )
    }
    // 「oc」这类两个字的关键词按整词匹配，免得命中 rococo。
    for (const keyword of keywords) {
      if (charLength(keyword) >= TRIGRAM_MIN_CHARS) continue
      anyOf.push(
        `(' ' || lower(name) || ' ') LIKE ${param(`% ${escapeLike(keyword)} %`)} ESCAPE '\\'`,
      )
    }
    if (anyOf.length > 0) where.push(`(${anyOf.join(' OR ')})`)
  }

  const whereParamCount = params.length
  const sort = input.sort === 'relevance' && !query ? 'thumbs' : input.sort
  let orderBy: string
  if (sort === 'relevance') {
    // 名字完全相同 → 名字以它开头 → 名字含整句 → 名字含每个词 → 只在标签 /
    // 作者 / 触发词里命中；同一档里按下载量。
    const exact = param(query)
    const prefix = param(`${escapeLike(query)}%`)
    const everyTerm = terms
      .map((term) => `instr(lower(name), ${param(term)}) > 0`)
      .join(' AND ')
    orderBy = `CASE
      WHEN lower(name) = ${exact} THEN 0
      WHEN lower(name) LIKE ${prefix} ESCAPE '\\' THEN 1
      WHEN instr(lower(name), ${exact}) > 0 THEN 2
      WHEN ${everyTerm} THEN 3
      ELSE 4
    END, download_count DESC, model_id`
    // ⚠ 下面三档必须与迁移里的排序索引逐列一致（model_id 升序 = 索引自带的
    // rowid 顺序），否则规划器只能整体排序。
  } else if (sort === 'downloads') {
    orderBy = 'download_count DESC, model_id'
  } else if (sort === 'newest') {
    orderBy = 'created_at DESC, model_id'
  } else {
    orderBy = 'thumbs_up_count DESC, download_count DESC, model_id'
  }

  return {
    where: where.length > 0 ? where.join(' AND ') : '1 = 1',
    orderBy,
    params,
    whereParamCount,
  }
}

interface RawRow {
  model_id: number
  version_id: number
  version_name: string | null
  name: string
  creator: string | null
  creator_image: string | null
  model_type: string
  nsfw: number
  base_model: string | null
  tags: string
  trained_words: string
  hash_autov3: string | null
  download_count: number
  thumbs_up_count: number
  images: string
  permissions: string
  created_at: number
}

function parseJsonArray<T>(text: string): T[] {
  try {
    const value: unknown = JSON.parse(text)
    return Array.isArray(value) ? (value as T[]) : []
  } catch {
    return []
  }
}

const DEFAULT_PERMISSIONS: IndexPermissions = {
  allowCommercialUse: [],
  allowDerivatives: false,
  allowNoCredit: true,
}

function parsePermissions(text: string): IndexPermissions {
  try {
    return { ...DEFAULT_PERMISSIONS, ...(JSON.parse(text) as object) }
  } catch {
    return DEFAULT_PERMISSIONS
  }
}

function toSearchRow(row: RawRow): SearchRow {
  return {
    modelId: row.model_id,
    versionId: row.version_id,
    versionName: row.version_name,
    name: row.name,
    creator: row.creator,
    creatorImage: row.creator_image,
    modelType: row.model_type,
    nsfw: row.nsfw === 1,
    baseModel: row.base_model,
    tags: parseJsonArray<string>(row.tags),
    trainedWords: parseJsonArray<string>(row.trained_words),
    hashAutoV3: row.hash_autov3,
    downloadCount: row.download_count,
    thumbsUpCount: row.thumbs_up_count,
    images: parseJsonArray<IndexImage>(row.images),
    permissions: parsePermissions(row.permissions),
    createdAt: row.created_at,
  }
}

const ROW_COLUMNS = `model_id, version_id, version_name, name, creator,
  creator_image, model_type, nsfw, base_model, tags, trained_words, hash_autov3,
  download_count, thumbs_up_count, images, permissions, created_at`

interface CountResult {
  total: number
  syncedAt: number | null
}

/**
 * 总数。没有搜索词的条件组合一天内不变，按「条件 + 最近一次同步完成时刻」缓存；
 * 有搜索词的照算（全文索引下本来就快，而且词千变万化，缓存不划算）。
 */
async function countMatches(
  db: D1Database,
  input: SearchInput,
  counting: BuiltQuery,
): Promise<CountResult> {
  const whereParams = counting.params.slice(0, counting.whereParamCount)
  const cacheKey = input.q
    ? null
    : JSON.stringify([counting.where, whereParams])
  // 「其他」底模是 NOT IN，规划器会回表读整张表（0.9 s）；只看底模与分级时
  // 指定覆盖索引（0.12 s）。
  const coveringOnly =
    input.excludeBaseModels.length > 0 && !input.q && !input.contentType
  const countStatement = db
    .prepare(
      `SELECT count(*) AS count FROM lora${
        coveringOnly ? ' INDEXED BY lora_base_levels' : ''
      } WHERE ${counting.where}`,
    )
    .bind(...whereParams)
  const stateStatement = db.prepare(
    'SELECT last_completed_at FROM sync_state WHERE id = 1',
  )
  const readSyncedAt = (result: D1Result | undefined) =>
    (result?.results[0] as { last_completed_at?: number | null } | undefined)
      ?.last_completed_at ?? null
  const readCount = (result: D1Result | undefined) =>
    Number((result?.results[0] as { count?: number } | undefined)?.count ?? 0)

  // 有搜索词：不缓存，同步时刻与总数一趟取回（每少一趟往返，离 D1 远时就省 0.15 s）。
  if (!cacheKey) {
    const [state, count] = await db.batch([stateStatement, countStatement])
    return { total: readCount(count), syncedAt: readSyncedAt(state) }
  }

  const [state, cached] = await db.batch([
    stateStatement,
    db
      .prepare('SELECT total, synced_at FROM count_cache WHERE key = ?1')
      .bind(cacheKey),
  ])
  const syncedAt = readSyncedAt(state)
  const hit = cached?.results[0] as
    | { total: number; synced_at: number }
    | undefined
  if (hit && syncedAt !== null && hit.synced_at === syncedAt) {
    return { total: hit.total, syncedAt }
  }
  const total = readCount((await db.batch([countStatement]))[0])
  if (syncedAt !== null) {
    await db
      .prepare(
        'INSERT OR REPLACE INTO count_cache (key, synced_at, total) VALUES (?1, ?2, ?3)',
      )
      .bind(cacheKey, syncedAt, total)
      .run()
  }
  return { total, syncedAt }
}

export async function searchIndex(
  db: D1Database,
  input: SearchInput,
): Promise<SearchResult> {
  // 先数，按总数决定取这一页时走哪条路。
  const { total, syncedAt } = await countMatches(
    db,
    input,
    buildSearchQuery(input),
  )
  const offset = (input.page - 1) * input.pageSize
  if (offset >= total) return { rows: [], total, syncedAt }

  const { where, orderBy, params } = buildSearchQuery(input, {
    walkOrderIndex:
      total >= WALK_ORDER_INDEX_MIN_TOTAL &&
      !(input.sort === 'relevance' && input.q),
  })
  const pageParam = params.length + 1
  const { results } = await db
    .prepare(
      `SELECT ${ROW_COLUMNS} FROM lora WHERE ${where}
       ORDER BY ${orderBy} LIMIT ?${pageParam} OFFSET ?${pageParam + 1}`,
    )
    .bind(...params, input.pageSize, offset)
    .all<RawRow>()
  return { rows: results.map(toSearchRow), total, syncedAt }
}
