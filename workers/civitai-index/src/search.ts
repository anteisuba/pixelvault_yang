import { z } from 'zod'

import type { IndexImage, IndexPermissions, IndexVersion } from './rows'

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
  /** 数到 TOTAL_CAP 为止 */
  total: number
  /** 真实命中比 total 多（界面写「1 万+」） */
  totalCapped: boolean
  /** 索引最近一次完整同步的时刻（unix ms），从没同步完是 null */
  syncedAt: number | null
}

/** trigram 分词至少要 3 个字；更短的词查 lora_term 的整词（见 rows.ts 的 indexTerms）。 */
const TRIGRAM_MIN_CHARS = 3

/**
 * 命中数不少于它时，让规划器沿排序索引走、边走边过滤、够一页就停（过滤列前面
 * 加一元 `+`，它们就不能当索引用）；少于它时按过滤条件取出再排序。热门底模
 * 第 11 页 0.55 s → 34 ms，而冷门底模反过来 1 ms → 0.9 s，所以按总数切换。
 */
const WALK_ORDER_INDEX_MIN_TOTAL = 2000
const MAX_QUERY_TERMS = 8
/**
 * 总数数到这里为止，界面写「1 万+」。常见词（girl 命中 17 万行）照实数要把整个
 * 命中集读一遍，冷的时候 5–11 秒；数到上限就停只读一万多行（30 ms 上下）。
 */
export const TOTAL_CAP = 10_000
/**
 * 相关度排序且命中多（≥ 切换线）时，只在下载量最高的这么多条里按相关度排，其后
 * 照下载量接着排——整体排序要把十几万行全读一遍。
 */
const RELEVANCE_POOL_SIZE = 1000
/**
 * 按 model_id 只含筛选列的覆盖索引（迁移 0006）。从全文命中往外接 lora 时指定
 * 走它：筛选只看底模与分级，不用把一行 1.3 KB 的大行（图片、版本 JSON）读进来。
 * 回表时「girl + Illustrious」冷的计数 4 秒以上（应用侧 8 秒超时，LoRA 库刷新
 * 不出来）。⚠ buildSearchQuery 的 WHERE 只能引用这几列，加筛选列要一起加进索引。
 */
const FILTER_INDEX = 'lora_filter'

/**
 * 有搜索词时筛选从哪儿读：长词从全文命中往外接覆盖索引，只有短词时按 lora_term
 * 的 model_id 查覆盖索引。没有搜索词返回 null——那时按底模 / 分级索引取更省，
 * 强制走它反倒要扫整份索引。
 */
function filterSource(input: SearchInput, joinsFts: boolean): string | null {
  if (joinsFts) {
    return `lora_fts JOIN lora INDEXED BY ${FILTER_INDEX} ON lora.model_id = lora_fts.rowid`
  }
  return input.q ? `lora INDEXED BY ${FILTER_INDEX}` : null
}

function charLength(text: string): number {
  return [...text].length
}

/** FTS5 字符串：双引号包起来，内部双引号写两遍。 */
function ftsString(text: string): string {
  return `"${text.replaceAll('"', '""')}"`
}

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`)
}

interface BuiltQuery {
  where: string
  orderBy: string
  /** 相关度那一档的分档表达式（只有相关度排序才有） */
  tierExpr: string | null
  /** 先是 WHERE 的参数（共 whereParamCount 个），再是排序的 */
  params: unknown[]
  whereParamCount: number
  /** WHERE 里直接写了 `lora_fts MATCH`，FROM 要接上 lora_fts（见 driveFromFts） */
  joinsFts: boolean
}

export function buildSearchQuery(
  input: SearchInput,
  {
    walkOrderIndex = false,
    driveFromFts = false,
  }: {
    walkOrderIndex?: boolean
    /**
     * 计数与取候选用：从全文索引的命中流往外接 lora（经覆盖索引，见 filterSource），
     * 数够上限就停，不先把命中集整个取出来。
     */
    driveFromFts?: boolean
  } = {},
): BuiltQuery {
  const params: unknown[] = []
  const param = (value: unknown) => {
    params.push(value)
    return `?${params.length}`
  }
  const col = (name: string) =>
    walkOrderIndex ? `+lora.${name}` : `lora.${name}`
  const inTerms = (terms: readonly string[]) =>
    `${col('model_id')} IN (SELECT model_id FROM lora_term WHERE term IN (${terms
      .map(param)
      .join(', ')}))`
  const where: string[] = []
  let joinsFts = false

  if (input.nsfw.someImageAtMost !== undefined) {
    where.push(
      `${col('nsfw_level_min')} <= ${param(input.nsfw.someImageAtMost)}`,
    )
  }
  if (input.nsfw.someImageAbove !== undefined) {
    where.push(`${col('nsfw_level_max')} > ${param(input.nsfw.someImageAbove)}`)
  }

  // 底模看任一版本：默认版在 base_model 列，其余版本是 lora_term 里的 `b:`。
  if (input.baseModels.length > 0) {
    where.push(
      `(${col('base_model')} IN (${input.baseModels.map(param).join(', ')}) OR ${inTerms(
        input.baseModels.map((baseModel) => `b:${baseModel}`),
      )})`,
    )
  }
  if (input.excludeBaseModels.length > 0) {
    where.push(
      `(lora.base_model IS NULL OR ${col('base_model')} NOT IN (${input.excludeBaseModels
        .map(param)
        .join(', ')}) OR ${col('model_id')} IN (SELECT model_id FROM lora_term
        WHERE term > 'b:' AND term < 'b;' AND term NOT IN (${input.excludeBaseModels
          .map((baseModel) => param(`b:${baseModel}`))
          .join(', ')})))`,
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
  if (longTerms.length > 0) {
    const match = param(longTerms.map(ftsString).join(' '))
    if (driveFromFts) {
      where.push(`lora_fts MATCH ${match}`)
      joinsFts = true
    } else {
      where.push(
        `${col('model_id')} IN (SELECT rowid FROM lora_fts WHERE lora_fts MATCH ${match})`,
      )
    }
  }
  // 「鸣潮」「oc」这类不到 3 个字的词按整词（中日韩是单字 / 相邻两字）。
  for (const term of terms) {
    if (charLength(term) < TRIGRAM_MIN_CHARS) where.push(inTerms([`w:${term}`]))
  }

  if (input.contentType) {
    const keywords = input.contentType.nameKeywords.map((keyword) =>
      keyword.toLowerCase(),
    )
    // 标签精确匹配；「oc」这类短关键词按整词，免得命中 rococo；长关键词按
    // 「名字里有词以它开头」（characters、charactersheet 都算）。⛔ 走 trigram
    // 名字列：character 的三字组太常见，单这一项冷热都要 0.4 s 上下。
    const exactTerms = [
      ...input.contentType.tags.map((tag) => `t:${tag.toLowerCase()}`),
      ...keywords
        .filter((keyword) => charLength(keyword) < TRIGRAM_MIN_CHARS)
        .map((keyword) => `w:${keyword}`),
    ]
    const prefixRanges = keywords
      .filter((keyword) => charLength(keyword) >= TRIGRAM_MIN_CHARS)
      .map(
        (keyword) =>
          `(term >= ${param(`w:${keyword}`)} AND term < ${param(`w:${keyword}\u{10ffff}`)})`,
      )
    const anyOf: string[] = []
    if (exactTerms.length > 0) anyOf.push(inTerms(exactTerms))
    if (prefixRanges.length > 0) {
      anyOf.push(
        `${col('model_id')} IN (SELECT model_id FROM lora_term WHERE ${prefixRanges.join(' OR ')})`,
      )
    }
    if (anyOf.length > 0) where.push(`(${anyOf.join(' OR ')})`)
  }

  const whereParamCount = params.length
  const sort = input.sort === 'relevance' && !query ? 'thumbs' : input.sort
  let orderBy: string
  let tierExpr: string | null = null
  if (sort === 'relevance') {
    // 名字完全相同 → 名字以它开头 → 名字含整句 → 名字含每个词 → 只在标签 /
    // 作者 / 触发词里命中；同一档里按下载量。
    const exact = param(query)
    const prefix = param(`${escapeLike(query)}%`)
    const everyTerm = terms
      .map((term) => `instr(lower(lora.name), ${param(term)}) > 0`)
      .join(' AND ')
    tierExpr = `CASE
      WHEN lower(lora.name) = ${exact} THEN 0
      WHEN lower(lora.name) LIKE ${prefix} ESCAPE '\\' THEN 1
      WHEN instr(lower(lora.name), ${exact}) > 0 THEN 2
      WHEN ${everyTerm} THEN 3
      ELSE 4
    END`
    orderBy = `${tierExpr}, download_count DESC, model_id`
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
    tierExpr,
    params,
    whereParamCount,
    joinsFts,
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
  versions: string
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

/**
 * 这一行展示哪个版本：默认那一版；底模筛选下默认版不符合（模型是凭别的版本
 * 进来的）时，换成第一个符合的版本——卡片上挂的就是用户筛的那个底模。
 */
function pickVersion(row: RawRow, input: SearchInput): IndexVersion {
  const versions = parseJsonArray<IndexVersion>(row.versions)
  const current = versions.find((entry) => entry.id === row.version_id) ?? {
    // 还没按新格式重写过的行没有版本清单。
    id: row.version_id,
    name: row.version_name,
    baseModel: row.base_model,
    trainedWords: parseJsonArray<string>(row.trained_words),
    hashAutoV3: row.hash_autov3,
  }
  const fits = (baseModel: string | null) =>
    (input.baseModels.length === 0 ||
      (baseModel !== null && input.baseModels.includes(baseModel))) &&
    (baseModel === null || !input.excludeBaseModels.includes(baseModel))
  if (fits(current.baseModel)) return current
  return versions.find((entry) => fits(entry.baseModel)) ?? current
}

function toSearchRow(row: RawRow, input: SearchInput): SearchRow {
  const version = pickVersion(row, input)
  return {
    modelId: row.model_id,
    versionId: version.id,
    versionName: version.name,
    name: row.name,
    creator: row.creator,
    creatorImage: row.creator_image,
    modelType: row.model_type,
    nsfw: row.nsfw === 1,
    baseModel: version.baseModel,
    tags: parseJsonArray<string>(row.tags),
    trainedWords: version.trainedWords,
    hashAutoV3: version.hashAutoV3,
    downloadCount: row.download_count,
    thumbsUpCount: row.thumbs_up_count,
    images: parseJsonArray<IndexImage>(row.images),
    permissions: parsePermissions(row.permissions),
    createdAt: row.created_at,
  }
}

const ROW_COLUMNS = `model_id, version_id, version_name, name, creator,
  creator_image, model_type, nsfw, base_model, tags, trained_words, hash_autov3,
  download_count, thumbs_up_count, versions, images, permissions, created_at`

interface CountResult {
  total: number
  totalCapped: boolean
  syncedAt: number | null
}

/** 数到 TOTAL_CAP 为止的计数语句。 */
function countStatement(
  db: D1Database,
  from: string,
  where: string,
  params: unknown[],
): D1PreparedStatement {
  return db
    .prepare(
      `SELECT count(*) AS count FROM (
         SELECT 1 FROM ${from} WHERE ${where} LIMIT ${TOTAL_CAP + 1}
       )`,
    )
    .bind(...params)
}

function readCount(result: D1Result | undefined): number {
  return Number(
    (result?.results[0] as { count?: number } | undefined)?.count ?? 0,
  )
}

/** 重数一个浏览总数并写回缓存（key 即 `[where, params]`，见 countMatches）。 */
async function refreshBrowseCount(
  db: D1Database,
  key: string,
  syncedAt: number,
): Promise<number> {
  const [where, params] = JSON.parse(key) as [string, unknown[]]
  const count = readCount(
    (await db.batch([countStatement(db, 'lora', where, params)]))[0],
  )
  await db
    .prepare(
      'INSERT OR REPLACE INTO count_cache (key, synced_at, total) VALUES (?1, ?2, ?3)',
    )
    .bind(key, syncedAt, count)
    .run()
  return count
}

/** 把耗时的活挪到响应之后（Worker 里是 ctx.waitUntil）。 */
export type Defer = (work: Promise<unknown>) => void

/**
 * 总数（数到 TOTAL_CAP 为止）。没有搜索词的条件组合一天内几乎不变，按「条件 +
 * 算出它时的同步时刻」缓存；有搜索词的照算（词千变万化，缓存不划算）。
 *
 * 缓存过期（又同步过一轮）时先用旧数、后台重数：D1 冷的时候这一步要十几到二十
 * 几秒（2026-10-23 线上 16–24 s，结果页本身只要 26 ms），用户等不起；隔一天的
 * 总数差几十条，对翻页和选查询路线都无关紧要。每轮同步后 warmBrowseCounts 会把
 * 见过的组合先重数一遍，这条后台路只兜同步刚完、还没数到的那一会儿。
 * 没给 defer（测试）就当场重数。
 */
async function countMatches(
  db: D1Database,
  input: SearchInput,
  defer?: Defer,
): Promise<CountResult> {
  const counting = buildSearchQuery(input, { driveFromFts: true })
  const whereParams = counting.params.slice(0, counting.whereParamCount)
  const stateStatement = db.prepare(
    'SELECT last_completed_at FROM sync_state WHERE id = 1',
  )
  const readSyncedAt = (result: D1Result | undefined) =>
    (result?.results[0] as { last_completed_at?: number | null } | undefined)
      ?.last_completed_at ?? null
  const capped = (count: number, syncedAt: number | null): CountResult => ({
    total: Math.min(count, TOTAL_CAP),
    totalCapped: count > TOTAL_CAP,
    syncedAt,
  })

  // 有搜索词：不缓存，同步时刻与总数一趟取回（每少一趟往返，离 D1 远时就省 0.15 s）。
  if (input.q) {
    const from = filterSource(input, counting.joinsFts) ?? 'lora'
    const [state, count] = await db.batch([
      stateStatement,
      countStatement(db, from, counting.where, whereParams),
    ])
    return capped(readCount(count), readSyncedAt(state))
  }

  const cacheKey = JSON.stringify([counting.where, whereParams])
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
  if (syncedAt === null) {
    return capped(
      readCount(
        (
          await db.batch([
            countStatement(db, 'lora', counting.where, whereParams),
          ])
        )[0],
      ),
      null,
    )
  }
  if (!hit)
    return capped(await refreshBrowseCount(db, cacheKey, syncedAt), syncedAt)
  if (hit.synced_at !== syncedAt) {
    const refresh = refreshBrowseCount(db, cacheKey, syncedAt)
    if (!defer) return capped(await refresh, syncedAt)
    defer(refresh)
  }
  return capped(hit.total, syncedAt)
}

/**
 * 同步完成后把缓存里所有浏览组合按新数据重数一遍（用户见过的组合就是要热的
 * 那些），第一个打开 LoRA 库的人不用替大家等冷计数。返回重数了几个。
 */
export async function warmBrowseCounts(db: D1Database): Promise<number> {
  const state = await db
    .prepare('SELECT last_completed_at FROM sync_state WHERE id = 1')
    .first<{ last_completed_at: number | null }>()
  const syncedAt = state?.last_completed_at
  if (syncedAt == null) return 0
  const { results } = await db
    .prepare('SELECT key FROM count_cache WHERE synced_at <> ?1')
    .bind(syncedAt)
    .all<{ key: string }>()
  for (const { key } of results) {
    await refreshBrowseCount(db, key, syncedAt)
  }
  return results.length
}

/**
 * 相关度排序、命中又多：下载量最高的 RELEVANCE_POOL_SIZE 条里按相关度分档排，
 * 其后照下载量接着排（两段不重叠）。跨两段的那一页两条查询一趟发出去。
 */
async function readRelevancePage(
  db: D1Database,
  input: SearchInput,
  offset: number,
): Promise<RawRow[]> {
  const { where, tierExpr, params, whereParamCount } = buildSearchQuery(input, {
    walkOrderIndex: true,
  })
  const end = offset + input.pageSize
  const statements: D1PreparedStatement[] = []
  if (offset < RELEVANCE_POOL_SIZE) {
    const next = params.length + 1
    statements.push(
      db
        .prepare(
          `WITH pool AS (
             SELECT lora.model_id AS pid, lora.download_count AS dc, ${tierExpr} AS tier
             FROM lora WHERE ${where}
             ORDER BY download_count DESC, model_id LIMIT ${RELEVANCE_POOL_SIZE}
           ), page AS (
             SELECT pid, dc, tier FROM pool ORDER BY tier, dc DESC, pid
             LIMIT ?${next} OFFSET ?${next + 1}
           )
           SELECT ${ROW_COLUMNS} FROM page JOIN lora ON lora.model_id = page.pid
           ORDER BY page.tier, page.dc DESC, page.pid`,
        )
        .bind(...params, Math.min(end, RELEVANCE_POOL_SIZE) - offset, offset),
    )
  }
  if (end > RELEVANCE_POOL_SIZE) {
    const start = Math.max(offset, RELEVANCE_POOL_SIZE)
    const next = whereParamCount + 1
    statements.push(
      db
        .prepare(
          `SELECT ${ROW_COLUMNS} FROM lora WHERE ${where}
           ORDER BY download_count DESC, model_id LIMIT ?${next} OFFSET ?${next + 1}`,
        )
        .bind(...params.slice(0, whereParamCount), end - start, start),
    )
  }
  const results = await db.batch<RawRow>(statements)
  return results.flatMap((result) => result.results)
}

/**
 * 命中少于切换线时取这一页：按过滤条件取出再排序。有搜索词时先经覆盖索引筛出
 * 候选（少于切换线，几千条以内），只有候选才回表读大行排序——直接在 lora 上按
 * 条件取，规划器会沿底模索引把几十万行逐条回表（0.5 秒上下）。
 */
async function readFilteredPage(
  db: D1Database,
  input: SearchInput,
  offset: number,
): Promise<RawRow[]> {
  const { where, orderBy, params, joinsFts } = buildSearchQuery(input, {
    driveFromFts: true,
  })
  const source = filterSource(input, joinsFts)
  const candidates = source
    ? `lora.model_id IN (SELECT lora.model_id FROM ${source} WHERE ${where})`
    : where
  const pageParam = params.length + 1
  const { results } = await db
    .prepare(
      `SELECT ${ROW_COLUMNS} FROM lora WHERE ${candidates}
       ORDER BY ${orderBy} LIMIT ?${pageParam} OFFSET ?${pageParam + 1}`,
    )
    .bind(...params, input.pageSize, offset)
    .all<RawRow>()
  return results
}

/** 各段耗时（毫秒），给 Server-Timing 与慢查询日志（见 index.ts）。 */
export interface SearchTimings {
  countMs: number
  pageMs: number
}

export async function searchIndex(
  db: D1Database,
  input: SearchInput,
  options: { timings?: SearchTimings; defer?: Defer } = {},
): Promise<SearchResult> {
  const { timings, defer } = options
  // 先数，按总数决定取这一页时走哪条路。
  const countStartedAt = Date.now()
  const { total, totalCapped, syncedAt } = await countMatches(db, input, defer)
  const pageStartedAt = Date.now()
  if (timings) timings.countMs = pageStartedAt - countStartedAt
  const offset = (input.page - 1) * input.pageSize
  if (offset >= total) return { rows: [], total, totalCapped, syncedAt }

  const large = total >= WALK_ORDER_INDEX_MIN_TOTAL
  let rows: RawRow[]
  if (!large) {
    rows = await readFilteredPage(db, input, offset)
  } else if (input.sort === 'relevance' && input.q) {
    rows = await readRelevancePage(db, input, offset)
  } else {
    const { where, orderBy, params } = buildSearchQuery(input, {
      walkOrderIndex: true,
    })
    const pageParam = params.length + 1
    const { results } = await db
      .prepare(
        `SELECT ${ROW_COLUMNS} FROM lora WHERE ${where}
         ORDER BY ${orderBy} LIMIT ?${pageParam} OFFSET ?${pageParam + 1}`,
      )
      .bind(...params, input.pageSize, offset)
      .all<RawRow>()
    rows = results
  }
  if (timings) timings.pageMs = Date.now() - pageStartedAt
  return {
    rows: rows.map((row) => toSearchRow(row, input)),
    total,
    totalCapped,
    syncedAt,
  }
}
