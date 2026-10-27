import { z } from 'zod'

import { findLorasByMeaning, type SemanticIndexBinding } from './meaning'
import type { IndexImage, IndexPermissions, IndexVersion } from './rows'
import { writeLiveHits } from './sync'
import { correctQuery } from './words'

/**
 * 搜索与浏览的唯一入口。业务口径（安全档的分级线、家族对应哪些 baseModel、
 * 内容类型对应哪些标签）都由应用侧算好传进来，这里只把结构化条件翻成 SQL——
 * 白名单拼接，用户输入一律走参数。
 */
export const SearchInputSchema = z.object({
  /** 进来先规整（normalizeQuery），计数缓存、按意思找、排序都用规整后的这一份 */
  q: z.string().max(200).default('').transform(normalizeQuery),
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
  /** 数到 TOTAL_CAP 为止的字面命中，再加上接在后面的「意思接近」 */
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
 * 搜索词里这些字当空格：`arknights_endfield` 只有 6 个、带空格是 353 个（2026-10-22
 * 线上实测）。索引的整词本来就按字母数字切（rows.ts 的 indexTerms），这里对齐。
 * ⚠ 保留 `@`：触发词常带它（`@anima_tag`）。
 */
const QUERY_SEPARATORS =
  /[\s_\-/\\.,;:!?()[\]{}"'`|+*~#&^=<>·、，。：；！？（）【】「」『』《》〈〉“”‘’…—～]+/gu
/**
 * 通用词：不要求一定出现，只参与排序。助手和人都爱在词后面加 `lora` / `style`，
 * `endfield style lora` 原来只有 4 个、`endfield` 是 367 个（owner 2026-10-22 定）。
 * 整句只剩这些词时照常当条件（搜 `style` 就是要找名字里有 style 的）。
 */
const GENERIC_QUERY_WORDS = new Set([
  'lora',
  'loras',
  'lycoris',
  'locon',
  'loha',
  'style',
  'model',
  '模型',
  '风格',
  '画风',
])
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

/** 全角转半角、小写、分隔符当空格（见 QUERY_SEPARATORS）。 */
export function normalizeQuery(query: string): string {
  return query
    .normalize('NFKC')
    .toLowerCase()
    .replace(QUERY_SEPARATORS, ' ')
    .trim()
}

/**
 * `terms` 是必须命中的词（去掉了通用词）；`rankTerms` 是整句的词，只用来排序。
 */
function queryTerms(query: string): {
  terms: string[]
  longTerms: string[]
  rankTerms: string[]
} {
  const rankTerms = [...new Set(query.split(/\s+/).filter(Boolean))].slice(
    0,
    MAX_QUERY_TERMS,
  )
  const specific = rankTerms.filter((term) => !GENERIC_QUERY_WORDS.has(term))
  const terms = specific.length > 0 ? specific : rankTerms
  return {
    terms,
    longTerms: terms.filter((term) => charLength(term) >= TRIGRAM_MIN_CHARS),
    rankTerms,
  }
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

  const query = input.q
  const { terms, longTerms, rankTerms } = queryTerms(query)
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
    // 名字完全相同 → 名字以它开头 → 名字含整句 → 名字含每个必须的词（还含通用词
    // 的在前）→ 只在标签 / 作者 / 触发词里命中；同一档里按下载量。
    const exact = param(query)
    const prefix = param(`${escapeLike(query)}%`)
    const inName = (term: string) =>
      `instr(lower(lora.name), ${param(term)}) > 0`
    const everyTerm = terms.map(inName).join(' AND ')
    const generic = rankTerms.filter((term) => !terms.includes(term))
    const nameTiers =
      generic.length > 0
        ? `WHEN ${everyTerm} AND (${generic.map(inName).join(' OR ')}) THEN 3
      WHEN ${everyTerm} THEN 4`
        : `WHEN ${everyTerm} THEN 3`
    tierExpr = `CASE
      WHEN lower(lora.name) = ${exact} THEN 0
      WHEN lower(lora.name) LIKE ${prefix} ESCAPE '\\' THEN 1
      WHEN instr(lower(lora.name), ${exact}) > 0 THEN 2
      ${nameTiers}
      ELSE 5
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

/** 字面结果排得满这一页时，按意思找最多等这么久。 */
const MEANING_BUDGET_MS = 300

/** 限时等：到点没回来就给 fallback，那件事挪到响应之后接着跑完。 */
async function withinBudget<T>(
  work: Promise<T>,
  budgetMs: number,
  fallback: T,
  defer?: Defer,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = Symbol('late')
  const result = await Promise.race([
    work,
    new Promise<typeof late>((resolve) => {
      timer = setTimeout(() => resolve(late), budgetMs)
    }),
  ])
  clearTimeout(timer)
  if (result !== late) return result
  defer?.(work)
  return fallback
}

/** 各段耗时（毫秒），给 Server-Timing 与慢查询日志（见 index.ts）。 */
export interface SearchTimings {
  countMs: number
  pageMs: number
  /** 从开始到拿到（或不再等）意思接近的那些，与计数同时跑 */
  meaningMs: number
}

/**
 * 这一行字面上命中搜索词没有（与 buildSearchQuery 的词条件同一口径），逐行关联着查：
 * ⛔ 不用 `IN (SELECT rowid FROM lora_fts …)`——那样要把常见词的整个命中集（girl 17 万）
 * 先取出来，这里只需要看 50 行。
 */
function literalTextCheck(q: string): { where: string; params: unknown[] } {
  const { terms, longTerms } = queryTerms(q)
  const params: unknown[] = []
  const param = (value: unknown) => {
    params.push(value)
    return `?${params.length}`
  }
  const where: string[] = []
  if (longTerms.length > 0) {
    where.push(
      `EXISTS (SELECT 1 FROM lora_fts WHERE lora_fts MATCH ${param(
        longTerms.map(ftsString).join(' '),
      )} AND lora_fts.rowid = lora.model_id)`,
    )
  }
  for (const term of terms) {
    if (charLength(term) < TRIGRAM_MIN_CHARS) {
      where.push(
        `EXISTS (SELECT 1 FROM lora_term WHERE term = ${param(`w:${term}`)} AND lora_term.model_id = lora.model_id)`,
      )
    }
  }
  return { where: where.length > 0 ? where.join(' AND ') : '1 = 1', params }
}

type SqlCondition = { where: string; params: unknown[] }

/** 只按某几项筛选（q 清空）拼出来的条件。 */
function filterCondition(input: SearchInput): SqlCondition {
  const built = buildSearchQuery({ ...input, q: '' })
  return {
    where: built.where,
    params: built.params.slice(0, built.whereParamCount),
  }
}

/** 这几个 id 里满足条件的那些。 */
function idsMatching(
  db: D1Database,
  ids: readonly number[],
  { where, params }: SqlCondition,
): D1PreparedStatement {
  return db
    .prepare(
      `SELECT lora.model_id AS id FROM lora
       WHERE lora.model_id IN (SELECT value FROM json_each(?${params.length + 1}))
         AND ${where}`,
    )
    .bind(...params, JSON.stringify(ids))
}

/**
 * 「意思接近」里能接到前面几段后面的那些：同样过底模 / 分级 / 内容类型的筛选，
 * 去掉前面字面（含纠正后的词）已经命中的与 `exclude` 里的，顺序照相似度。
 */
async function readMeaningExtras(
  db: D1Database,
  input: SearchInput,
  ids: readonly number[],
  literalQueries: readonly string[],
  exclude: ReadonlySet<number>,
): Promise<number[]> {
  const candidates = ids.filter((id) => !exclude.has(id))
  if (candidates.length === 0) return []
  const [filtered, ...literal] = await db.batch<{ id: number }>([
    idsMatching(db, candidates, filterCondition(input)),
    ...literalQueries.map((q) =>
      idsMatching(db, candidates, literalTextCheck(q)),
    ),
  ])
  const passes = new Set(filtered!.results.map((row) => row.id))
  const literalHits = new Set(
    literal.flatMap((result) => result.results.map((row) => row.id)),
  )
  return candidates.filter((id) => passes.has(id) && !literalHits.has(id))
}

async function readRowsById(
  db: D1Database,
  ids: readonly number[],
): Promise<RawRow[]> {
  if (ids.length === 0) return []
  const { results } = await db
    .prepare(
      `SELECT ${ROW_COLUMNS} FROM lora
       WHERE model_id IN (SELECT value FROM json_each(?1))`,
    )
    .bind(JSON.stringify(ids))
    .all<RawRow>()
  const byId = new Map(results.map((row) => [row.model_id, row]))
  return ids.flatMap((id) => byId.get(id) ?? [])
}

/** 字面命中里的这一页（offset 在字面总数之内）。 */
async function readLiteralPage(
  db: D1Database,
  input: SearchInput,
  offset: number,
  total: number,
): Promise<RawRow[]> {
  if (offset >= total) return []
  if (total < WALK_ORDER_INDEX_MIN_TOTAL) {
    return readFilteredPage(db, input, offset)
  }
  if (input.sort === 'relevance' && input.q) {
    return readRelevancePage(db, input, offset)
  }
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
  return results
}

/** 现查上游最多要几个（一页的量）。 */
const LIVE_LIMIT = 24
export type SearchFallback =
  /** 打错字：按纠正后的词搜到的 */
  | { kind: 'corrected'; query: string; total: number }
  /** 本地一个都没有，现查 Civitai 拿到的（已写回索引） */
  | { kind: 'live'; total: number }

export interface SearchSegments {
  /** 排在最前的这么多条是字面命中 */
  literalTotal: number
  /** 字面一个都没有时接在前面的那一段，没有就是 null */
  fallback: SearchFallback | null
}

/** 现查上游、写回索引，回过了筛选的那些 id（顺序照上游）。出错就当没有。 */
async function readLiveIds(
  db: D1Database,
  input: SearchInput,
  live: LiveSearch,
): Promise<number[]> {
  try {
    const hits = await live(input.q, LIVE_LIMIT)
    const ids = await writeLiveHits(db, hits, Date.now())
    if (ids.length === 0) return []
    const { results } = await idsMatching(db, ids, filterCondition(input)).all<{
      id: number
    }>()
    const passes = new Set(results.map((row) => row.id))
    return ids.filter((id) => passes.has(id))
  } catch {
    return []
  }
}

/** 按文字现查上游（upstream.ts 的 searchCivitaiLive）。 */
export type LiveSearch = (q: string, limit: number) => Promise<unknown[]>

interface Segment {
  total: number
  read(offset: number, limit: number): Promise<RawRow[]>
}

/** 几段首尾相接，取总列表里 [offset, offset + limit) 的那些行。 */
async function readSegments(
  segments: readonly Segment[],
  offset: number,
  limit: number,
): Promise<RawRow[]> {
  const rows: RawRow[] = []
  let start = 0
  for (const segment of segments) {
    const end = start + segment.total
    const from = Math.max(offset + rows.length, start)
    if (rows.length < limit && from < end) {
      rows.push(
        ...(await segment.read(
          from - start,
          Math.min(limit - rows.length, end - from),
        )),
      )
    }
    start = end
  }
  return rows
}

export async function searchIndex(
  db: D1Database,
  input: SearchInput,
  options: {
    timings?: SearchTimings
    defer?: Defer
    /** 没给（或语义那边出错）就只有字面结果 */
    semantic?: SemanticIndexBinding
    /** 没给就不现查上游（测试、或上游不可用） */
    live?: LiveSearch
  } = {},
): Promise<SearchResult & SearchSegments> {
  const { timings, defer, semantic, live } = options
  // 先数，按总数决定取这一页时走哪条路；按意思找同时跑。
  const startedAt = Date.now()
  const meaningIds = findLorasByMeaning(semantic, input.q).catch(
    () => [] as number[],
  )
  const offset = (input.page - 1) * input.pageSize
  const {
    total: literalTotal,
    totalCapped,
    syncedAt,
  } = await countMatches(db, input, defer)
  if (timings) timings.countMs = Date.now() - startedAt

  // 字面一个都没有：先试纠正打错的词，还没有再现查上游（owner 10-22 定：只在前面
  // 都空时才查 Civitai）。
  let fallback: SearchFallback | null = null
  let fallbackSegment: Segment | null = null
  const literalQueries = input.q ? [input.q] : []
  const excludeFromMeaning = new Set<number>()
  if (input.q && literalTotal === 0) {
    const corrected = await correctQuery(db, input.q).catch(() => null)
    if (corrected) {
      const correctedInput = { ...input, q: corrected }
      const count = await countMatches(db, correctedInput, defer)
      if (count.total > 0) {
        fallback = { kind: 'corrected', query: corrected, total: count.total }
        literalQueries.push(corrected)
        fallbackSegment = {
          total: count.total,
          read: (from, limit) =>
            readLiteralPage(
              db,
              { ...correctedInput, pageSize: limit },
              from,
              count.total,
            ),
        }
      }
    }
    if (!fallback && live) {
      const ids = await readLiveIds(db, input, live)
      if (ids.length > 0) {
        fallback = { kind: 'live', total: ids.length }
        for (const id of ids) excludeFromMeaning.add(id)
        fallbackSegment = {
          total: ids.length,
          read: (from, limit) =>
            readRowsById(db, ids.slice(from, from + limit)),
        }
      }
    }
  }
  const headTotal = literalTotal + (fallback?.total ?? 0)

  // 这一页前面几段就排得满：意思那边（转向量要 0.5–4.5 秒，2026-10-26 实测）只等一小会儿，
  // 没回来就先出前面的、总数先不算它们；它照样算完记进缓存，下一页接着用。
  // 不够一页时照等：那时意思接近的就是要给用户看的东西。⚠ 用 `<`：排到前面最后一条
  // 的那一页也照等，它回的总数是真的，界面才知道后面还有意思接近的可翻。
  const meaning = meaningIds.then((ids) =>
    readMeaningExtras(db, input, ids, literalQueries, excludeFromMeaning).catch(
      () => [] as number[],
    ),
  )
  const headFillsPage = offset + input.pageSize < headTotal
  const extras = headFillsPage
    ? await withinBudget(meaning, MEANING_BUDGET_MS, [], defer)
    : await meaning
  if (timings) timings.meaningMs = Date.now() - startedAt
  const pageStartedAt = Date.now()
  const total = headTotal + extras.length

  const segments: Segment[] = [
    {
      total: literalTotal,
      read: (from, limit) =>
        readLiteralPage(db, { ...input, pageSize: limit }, from, literalTotal),
    },
    ...(fallbackSegment ? [fallbackSegment] : []),
    {
      total: extras.length,
      read: (from, limit) => readRowsById(db, extras.slice(from, from + limit)),
    },
  ]
  const rows =
    offset >= total ? [] : await readSegments(segments, offset, input.pageSize)
  if (timings) timings.pageMs = Date.now() - pageStartedAt
  return {
    rows: rows.map((row) => toSearchRow(row, input)),
    total,
    totalCapped,
    syncedAt,
    literalTotal,
    fallback,
  }
}
