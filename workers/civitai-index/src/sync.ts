import { mapFullHit, mapLightHit, type IndexRow, type LightRow } from './rows'
import { FULL_BATCH_SIZE, LIGHT_PAGE_SIZE, type Upstream } from './upstream'

/**
 * 每日同步：按 id 升序把整个目录扫一遍（轻量字段），逐页与本地对账——
 *
 * - 本地没有、或指纹变了（名字 / 分级 / 标签 / 出了新版本）→ 拉完整数据写入；
 * - 只是下载量 / 点赞变了 → 只更新这两列（不碰全文索引）；
 * - 本地有、上游这一段里没有 → 上游删了或下架了，删掉。
 *
 * 没变的行一行都不写，D1 的写入量只跟「当天变了多少」有关，跟目录总量无关。
 * 首次运行时本地是空的，整个目录都会走「拉完整数据」那一支，就是首灌。
 */

/** 一个 workflow step 处理几页（每页一千条）。首灌时一页要拉四批完整数据。 */
export const PAGES_PER_STEP = 5

/**
 * 删除的护栏：一页里「本地有、上游没有」的行超过这个数且超过这个比例，多半是
 * 上游这一页不完整，而不是真的一下删了这么多——这一段先不删，下次同步再对。
 */
const PAGE_DELETE_GUARD_MIN = 50
const PAGE_DELETE_GUARD_RATIO = 0.2
/** 扫到头时比上游最后一个 id 还大的本地行（尾部删除）的护栏。 */
const TAIL_DELETE_GUARD = 1000
/** 一页里读不懂的 hit 超过这个比例 = 上游改了字段形状，停下而不是静默跳过。 */
const UNREADABLE_ABORT_RATIO = 0.5
/** 每条写入 SQL 带多少行（整批作为一个 JSON 参数，压在 D1 单值 2 MB 之下）。 */
const WRITE_CHUNK_SIZE = 200

export interface SyncProgress {
  cursor: number
  done: boolean
  scanned: number
  refreshed: number
  metricsUpdated: number
  deleted: number
  deletesSkipped: number
  unreadable: number
}

const UPSERT_SQL = `
INSERT INTO lora (
  model_id, version_id, version_name, name, creator, creator_image, model_type,
  nsfw, nsfw_level_min, nsfw_level_max, base_model, tags, trained_words,
  hash_autov3, download_count, thumbs_up_count, images, permissions,
  created_at, last_version_at, light_fp, refreshed_at
)
SELECT
  json_extract(value, '$.modelId'),
  json_extract(value, '$.versionId'),
  json_extract(value, '$.versionName'),
  json_extract(value, '$.name'),
  json_extract(value, '$.creator'),
  json_extract(value, '$.creatorImage'),
  json_extract(value, '$.modelType'),
  json_extract(value, '$.nsfw'),
  json_extract(value, '$.nsfwLevelMin'),
  json_extract(value, '$.nsfwLevelMax'),
  json_extract(value, '$.baseModel'),
  json_extract(value, '$.tags'),
  json_extract(value, '$.trainedWords'),
  json_extract(value, '$.hashAutoV3'),
  json_extract(value, '$.downloadCount'),
  json_extract(value, '$.thumbsUpCount'),
  json_extract(value, '$.images'),
  json_extract(value, '$.permissions'),
  json_extract(value, '$.createdAt'),
  json_extract(value, '$.lastVersionAt'),
  json_extract(value, '$.lightFp'),
  json_extract(value, '$.refreshedAt')
FROM json_each(?1)
WHERE true
ON CONFLICT (model_id) DO UPDATE SET
  version_id = excluded.version_id,
  version_name = excluded.version_name,
  name = excluded.name,
  creator = excluded.creator,
  creator_image = excluded.creator_image,
  model_type = excluded.model_type,
  nsfw = excluded.nsfw,
  nsfw_level_min = excluded.nsfw_level_min,
  nsfw_level_max = excluded.nsfw_level_max,
  base_model = excluded.base_model,
  tags = excluded.tags,
  trained_words = excluded.trained_words,
  hash_autov3 = excluded.hash_autov3,
  download_count = excluded.download_count,
  thumbs_up_count = excluded.thumbs_up_count,
  images = excluded.images,
  permissions = excluded.permissions,
  created_at = excluded.created_at,
  last_version_at = excluded.last_version_at,
  light_fp = excluded.light_fp,
  refreshed_at = excluded.refreshed_at`

const METRICS_SQL = `
UPDATE lora SET
  download_count = json_extract(j.value, '$.downloadCount'),
  thumbs_up_count = json_extract(j.value, '$.thumbsUpCount')
FROM json_each(?1) AS j
WHERE lora.model_id = json_extract(j.value, '$.modelId')`

const DELETE_SQL = `DELETE FROM lora WHERE model_id IN (SELECT value FROM json_each(?1))`

// 中日韩短词索引跟着完整数据一起重写：先删掉这批的旧词，再写有词的那些。
const CJK_DELETE_SQL = `DELETE FROM lora_cjk WHERE rowid IN (SELECT value FROM json_each(?1))`
const CJK_INSERT_SQL = `
INSERT INTO lora_cjk (rowid, grams)
SELECT json_extract(value, '$.modelId'), json_extract(value, '$.grams')
FROM json_each(?1)`

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

/** 数组列存成 JSON 文本：json_extract 取出来就是 TEXT，原样落库。 */
function toWritableRow(row: IndexRow) {
  return {
    ...row,
    cjkGrams: undefined,
    nsfw: row.nsfw ? 1 : 0,
    tags: JSON.stringify(row.tags),
    trainedWords: JSON.stringify(row.trainedWords),
    images: JSON.stringify(row.images),
    permissions: JSON.stringify(row.permissions),
  }
}

function hitId(hit: unknown): number | null {
  const id = (hit as { id?: unknown } | null)?.id
  return typeof id === 'number' && Number.isInteger(id) ? id : null
}

interface LocalRow {
  model_id: number
  light_fp: string
  download_count: number
  thumbs_up_count: number
}

async function syncOnePage(
  db: D1Database,
  upstream: Upstream,
  afterId: number,
  now: number,
  progress: SyncProgress,
): Promise<{ lastId: number; exhausted: boolean }> {
  const hits = await upstream.lightPage(afterId)
  if (hits.length === 0) return { lastId: afterId, exhausted: true }

  const seenIds = new Set<number>()
  const lightRows: LightRow[] = []
  let unreadable = 0
  for (const hit of hits) {
    const id = hitId(hit)
    if (id !== null) seenIds.add(id)
    const light = mapLightHit(hit)
    if (light) lightRows.push(light)
    else unreadable += 1
  }
  if (unreadable > hits.length * UNREADABLE_ABORT_RATIO || seenIds.size === 0) {
    throw new Error(
      `Civitai light page after ${afterId} is mostly unreadable (${unreadable}/${hits.length})`,
    )
  }
  progress.scanned += hits.length
  progress.unreadable += unreadable

  const lastId = Math.max(...seenIds)
  const { results: localRows } = await db
    .prepare(
      `SELECT model_id, light_fp, download_count, thumbs_up_count
       FROM lora WHERE model_id > ?1 AND model_id <= ?2`,
    )
    .bind(afterId, lastId)
    .all<LocalRow>()
  const local = new Map(localRows.map((row) => [row.model_id, row]))

  const needFull: number[] = []
  const metrics: LightRow[] = []
  for (const row of lightRows) {
    const existing = local.get(row.modelId)
    if (!existing || existing.light_fp !== row.lightFp) {
      needFull.push(row.modelId)
    } else if (
      existing.download_count !== row.downloadCount ||
      existing.thumbs_up_count !== row.thumbsUpCount
    ) {
      metrics.push(row)
    }
  }

  const fullRows: IndexRow[] = []
  const unusable: number[] = []
  for (const ids of chunk(needFull, FULL_BATCH_SIZE)) {
    const fetched = new Map<number, IndexRow | null>()
    for (const hit of await upstream.fullHits(ids)) {
      const id = hitId(hit)
      if (id !== null) fetched.set(id, mapFullHit(hit, now))
    }
    for (const id of ids) {
      const row = fetched.get(id)
      if (row) fullRows.push(row)
      // 上游给了、但没有可用版本：挂不上，本地有就当下架删掉。
      else if (row === null && local.has(id)) unusable.push(id)
      // 两次请求之间上游删了它：留给明天的扫描去对，不在这里猜。
    }
  }

  let toDelete = localRows
    .map((row) => row.model_id)
    .filter((id) => !seenIds.has(id))
  if (
    toDelete.length > PAGE_DELETE_GUARD_MIN &&
    toDelete.length > localRows.length * PAGE_DELETE_GUARD_RATIO
  ) {
    progress.deletesSkipped += toDelete.length
    toDelete = []
  }
  toDelete.push(...unusable)

  const gramRows = fullRows
    .filter((row) => row.cjkGrams)
    .map((row) => ({ modelId: row.modelId, grams: row.cjkGrams }))
  const statements: D1PreparedStatement[] = [
    ...chunk(fullRows.map(toWritableRow), WRITE_CHUNK_SIZE).map((rows) =>
      db.prepare(UPSERT_SQL).bind(JSON.stringify(rows)),
    ),
    ...chunk(
      fullRows.map((row) => row.modelId),
      WRITE_CHUNK_SIZE,
    ).map((ids) => db.prepare(CJK_DELETE_SQL).bind(JSON.stringify(ids))),
    ...chunk(gramRows, WRITE_CHUNK_SIZE).map((rows) =>
      db.prepare(CJK_INSERT_SQL).bind(JSON.stringify(rows)),
    ),
    ...chunk(metrics, WRITE_CHUNK_SIZE).map((rows) =>
      db.prepare(METRICS_SQL).bind(JSON.stringify(rows)),
    ),
    ...chunk(toDelete, WRITE_CHUNK_SIZE).map((ids) =>
      db.prepare(DELETE_SQL).bind(JSON.stringify(ids)),
    ),
  ]
  if (statements.length > 0) await db.batch(statements)

  progress.refreshed += fullRows.length
  progress.metricsUpdated += metrics.length
  progress.deleted += toDelete.length

  return { lastId, exhausted: hits.length < LIGHT_PAGE_SIZE }
}

/** 扫到头之后：比上游最后一个 id 还大的本地行 = 上游已经没有了。 */
async function deleteTail(
  db: D1Database,
  lastId: number,
  progress: SyncProgress,
): Promise<void> {
  const tail = await db
    .prepare('SELECT count(*) AS count FROM lora WHERE model_id > ?1')
    .bind(lastId)
    .first<{ count: number }>()
  const count = tail?.count ?? 0
  if (count === 0) return
  if (count > TAIL_DELETE_GUARD) {
    progress.deletesSkipped += count
    return
  }
  await db.prepare('DELETE FROM lora WHERE model_id > ?1').bind(lastId).run()
  progress.deleted += count
}

/** 从 `cursor`（上一段最后一个 id）往后推进最多 `pages` 页。 */
export async function syncPages(
  db: D1Database,
  upstream: Upstream,
  cursor: number,
  pages: number,
  now: number,
): Promise<SyncProgress> {
  const progress: SyncProgress = {
    cursor,
    done: false,
    scanned: 0,
    refreshed: 0,
    metricsUpdated: 0,
    deleted: 0,
    deletesSkipped: 0,
    unreadable: 0,
  }
  for (let page = 0; page < pages; page += 1) {
    const { lastId, exhausted } = await syncOnePage(
      db,
      upstream,
      progress.cursor,
      now,
      progress,
    )
    progress.cursor = lastId
    if (exhausted) {
      await deleteTail(db, lastId, progress)
      progress.done = true
      break
    }
  }
  return progress
}

export async function recordSyncCompleted(
  db: D1Database,
  now: number,
): Promise<number> {
  const total = await db
    .prepare('SELECT count(*) AS count FROM lora')
    .first<{ count: number }>()
  const rowCount = total?.count ?? 0
  await db
    .prepare(
      'UPDATE sync_state SET last_completed_at = ?1, last_error = NULL, row_count = ?2 WHERE id = 1',
    )
    .bind(now, rowCount)
    .run()
  await db
    .prepare('DELETE FROM count_cache WHERE synced_at < ?1')
    .bind(now)
    .run()
  // 让规划器的统计跟上当天的数据（只在需要时重算，通常几百毫秒）。
  await db.prepare('PRAGMA optimize').run()
  return rowCount
}

export async function recordSyncError(
  db: D1Database,
  message: string,
): Promise<void> {
  await db
    .prepare('UPDATE sync_state SET last_error = ?1 WHERE id = 1')
    .bind(message.slice(0, 1000))
    .run()
}
