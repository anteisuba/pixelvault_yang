import 'server-only'

import { z } from 'zod'

import {
  CIVITAI_MIRROR_BACKFILL_LIMIT,
  CIVITAI_MIRROR_FETCH_BATCH,
  CIVITAI_MIRROR_FETCH_TIMEOUT_MS,
  CIVITAI_MIRROR_PRUNE_MAX_STALE_RATIO,
  CIVITAI_MIRROR_SYNC_STATE_ID,
  CIVITAI_MIRROR_SYNC_TIME_BUDGET_MS,
  isNsfwNamedModel,
} from '@/constants/lora'
import { db } from '@/lib/db'
import type { Prisma } from '@/lib/generated/prisma/client'
import { logger } from '@/lib/logger'
import { fetchCivitaiSearchPayload } from '@/services/civitai-lora.service'

/**
 * L3 本地目录镜像的唯一同步管线：把 Civitai 按下载量排序的前 N 条整轮重扫
 * 一遍，upsert，收尾时删掉本轮没扫到的行。
 *
 * 为什么是一条而不是「增量 + 指标 + 对账」三条：**指标刷新绕不开全量扫
 * 描**。下载量和点赞数不会更新 lastVersionAtUnix，Civitai 那个白送的
 * changed-since 信号照不到它们，而它们正是排序依据和 top-N 截断线的依据。
 * 既然最贵的那条省不掉，合成一条反而更省，也不会出现三条管线各自推进到
 * 不同进度的中间态。
 *
 * 一轮约 100 个上游请求，远超单次 cron 的执行上限，所以按 cursor 分片续
 * 跑：每次 cron 推进若干批，扫到头才收尾。
 */

const MIRROR_INDEX_UID = 'models_v9'

// 只取落库真正用得到的字段。完整 hit 平均 22.9 KB（热门模型带 15.3 张图的
// 全量元数据），裁掉之后单批传输量降一个数量级。
const MIRROR_ATTRIBUTES = [
  'id',
  'name',
  'user',
  'category',
  'nsfwLevel',
  'tags',
  'createdAt',
  'lastVersionAtUnix',
  'metrics',
  'version',
  'versions',
  'images',
] as const

/** 一条 mirror 行最多存几张图——与 CIVITAI_ITEM_MAX_IMAGES 对齐。 */
const MIRROR_MAX_IMAGES = 6

const MirrorHitSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    user: z
      .object({ username: z.string().nullable().optional() })
      .nullable()
      .optional(),
    category: z
      .object({ name: z.string().nullable().optional() })
      .nullable()
      .optional(),
    // 上游对「没有值」写 null 而不是省略字段，所以每一层都要放行 null。
    nsfwLevel: z
      .union([z.array(z.number()), z.number()])
      .nullable()
      .optional(),
    tags: z
      .array(z.object({ name: z.string() }).passthrough())
      .nullable()
      .optional(),
    createdAt: z.string().nullable().optional(),
    lastVersionAtUnix: z.number().nullable().optional(),
    metrics: z
      .object({
        downloadCount: z.number().nullable().optional(),
        thumbsUpCount: z.number().nullable().optional(),
        collectedCount: z.number().nullable().optional(),
        commentCount: z.number().nullable().optional(),
      })
      .nullable()
      .optional(),
    version: MirrorVersionSchemaLazy(),
    versions: z.array(MirrorVersionSchemaLazy()).nullable().optional(),
    images: z
      .array(
        z
          .object({
            id: z.number(),
            url: z.string(),
            type: z.string().nullable().optional(),
            nsfwLevel: z.number().nullable().optional(),
          })
          .passthrough(),
      )
      .nullable()
      .optional(),
  })
  .passthrough()

function MirrorVersionSchemaLazy() {
  return z
    .object({
      id: z.number(),
      name: z.string().nullable().optional(),
      baseModel: z.string().nullable().optional(),
      trainedWords: z.array(z.string()).nullable().optional(),
      hashData: z
        .array(z.object({ hash: z.string(), type: z.string() }).passthrough())
        .nullable()
        .optional(),
    })
    .passthrough()
    .nullable()
    .optional()
}

/**
 * ⚠ 这里**故意不写 `.default([])`**。
 *
 * 「hits 为空」在下游是「目录扫到头」的信号，会直接触发整轮剪枝。而
 * `.default([])` 会把**读不懂的 HTTP 200**（公钥轮换后的错误体、
 * `MIRROR_INDEX_UID` 被上游 bump、filter 属性改名）翻译成零命中——上游降级
 * 于是会从这条路径把镜像自己删空，而这套镜像存在的全部理由就是防上游降级。
 *
 * 形状不对就让 Zod 抛错，走 catch 保住进度，别伪装成空目录。
 */
const MirrorSearchResponseSchema = z.object({
  results: z.array(z.object({ hits: z.array(z.unknown()) }).passthrough()),
})

export interface CivitaiMirrorRow {
  modelId: number
  versionId: number
  versionName: string | null
  name: string
  creator: string | null
  category: string | null
  nsfwLevelMax: number
  nsfwNamed: boolean
  baseModel: string | null
  tags: string[]
  trainedWords: string[]
  hashAutoV3: string | null
  downloadCount: number
  thumbsUpCount: number
  collectedCount: number
  commentCount: number
  images: unknown[]
  createdAt: string
  lastVersionAt: string
}

/**
 * meilisearch hit → mirror 行。返回 null = 这条不该入库（没有可用版本）。
 *
 * nsfwLevel 在上游是「该模型所有图片等级的数组」，本地压成最大值：三态过
 * 滤的语义本来就是存在性的（任意一张超标就算超标），存最大值等价且可索引。
 */
export function mapHitToMirrorRow(hit: unknown): CivitaiMirrorRow | null {
  const parsed = MirrorHitSchema.safeParse(hit)
  if (!parsed.success) return null
  const data = parsed.data

  const version = data.version ?? data.versions?.[0]
  if (!version) return null

  const levels = Array.isArray(data.nsfwLevel)
    ? data.nsfwLevel
    : typeof data.nsfwLevel === 'number'
      ? [data.nsfwLevel]
      : []
  const lastVersionAt = data.lastVersionAtUnix
    ? new Date(data.lastVersionAtUnix)
    : data.createdAt
      ? new Date(data.createdAt)
      : new Date(0)

  return {
    modelId: data.id,
    versionId: version.id,
    versionName: version.name ?? null,
    name: data.name,
    creator: data.user?.username ?? null,
    category: data.category?.name ?? null,
    nsfwLevelMax: levels.length > 0 ? Math.max(...levels) : 0,
    nsfwNamed: isNsfwNamedModel(data.name),
    baseModel: version.baseModel ?? null,
    tags: (data.tags ?? []).map((tag) => tag.name),
    trainedWords: version.trainedWords ?? [],
    hashAutoV3:
      version.hashData?.find((entry) => entry.type.toUpperCase() === 'AUTOV3')
        ?.hash ?? null,
    downloadCount: data.metrics?.downloadCount ?? 0,
    thumbsUpCount: data.metrics?.thumbsUpCount ?? 0,
    collectedCount: data.metrics?.collectedCount ?? 0,
    commentCount: data.metrics?.commentCount ?? 0,
    images: (data.images ?? []).slice(0, MIRROR_MAX_IMAGES).map((image) => ({
      id: image.id,
      url: image.url,
      type: image.type ?? undefined,
      nsfwLevel: image.nsfwLevel ?? undefined,
    })),
    createdAt: (data.createdAt
      ? new Date(data.createdAt)
      : lastVersionAt
    ).toISOString(),
    lastVersionAt: lastVersionAt.toISOString(),
  }
}

/**
 * 批量 upsert。Prisma 没有批量 upsert，逐条 upsert 打 Neon 一批 1000 条会
 * 直接超时（实测 2 分钟没跑完）——所以走一条 jsonb_to_recordset 的原生
 * INSERT ... ON CONFLICT，一个参数搞定整批。
 *
 * ⚠ `syncedAt` 写的是 `(NOW() AT TIME ZONE 'UTC')`，不是裸 `NOW()`。
 * `syncedAt` 与 `passStartedAt` 都是 `TIMESTAMP(3)`（**无时区**列），而裸
 * `NOW()` 返回 timestamptz，赋给无时区列时按**会话 TimeZone** 折算成墙钟；
 * `passStartedAt` 那一侧是 Prisma 以 UTC 送进去的。两边口径必须同源，否则
 * 剪枝谓词 `syncedAt < passStartedAt` 会整体偏移——会话 TZ 若是 UTC−8，本轮
 * 刚扫过的那 15,000 行会被判成「没扫到」，而且 30% 恰好从比例闸下面钻过去，
 * 删掉的正是排名最靠前的那批。显式折算 UTC 让它不再依赖会话设置。
 */
async function upsertMirrorRows(rows: CivitaiMirrorRow[]): Promise<number> {
  if (rows.length === 0) return 0
  return db.$executeRaw`
    INSERT INTO "CivitaiLoraMirror" (
      "modelId", "versionId", "versionName", "name", "creator", "category",
      "nsfwLevelMax", "nsfwNamed", "baseModel", "tags", "trainedWords",
      "hashAutoV3", "downloadCount", "thumbsUpCount", "collectedCount",
      "commentCount", "images", "createdAt", "lastVersionAt", "syncedAt"
    )
    SELECT
      x."modelId", x."versionId", x."versionName", x."name", x."creator",
      x."category", x."nsfwLevelMax", x."nsfwNamed", x."baseModel", x."tags",
      x."trainedWords", x."hashAutoV3", x."downloadCount", x."thumbsUpCount",
      x."collectedCount", x."commentCount", x."images", x."createdAt",
      x."lastVersionAt", (NOW() AT TIME ZONE 'UTC')
    FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS x(
      "modelId" int, "versionId" int, "versionName" text, "name" text,
      "creator" text, "category" text, "nsfwLevelMax" int, "nsfwNamed" boolean,
      "baseModel" text, "tags" text[], "trainedWords" text[],
      "hashAutoV3" text, "downloadCount" int, "thumbsUpCount" int,
      "collectedCount" int, "commentCount" int, "images" jsonb,
      "createdAt" timestamptz, "lastVersionAt" timestamptz
    )
    ON CONFLICT ("modelId") DO UPDATE SET
      "versionId" = EXCLUDED."versionId",
      "versionName" = EXCLUDED."versionName",
      "name" = EXCLUDED."name",
      "creator" = EXCLUDED."creator",
      "category" = EXCLUDED."category",
      "nsfwLevelMax" = EXCLUDED."nsfwLevelMax",
      "nsfwNamed" = EXCLUDED."nsfwNamed",
      "baseModel" = EXCLUDED."baseModel",
      "tags" = EXCLUDED."tags",
      "trainedWords" = EXCLUDED."trainedWords",
      "hashAutoV3" = EXCLUDED."hashAutoV3",
      "downloadCount" = EXCLUDED."downloadCount",
      "thumbsUpCount" = EXCLUDED."thumbsUpCount",
      "collectedCount" = EXCLUDED."collectedCount",
      "commentCount" = EXCLUDED."commentCount",
      "images" = EXCLUDED."images",
      "createdAt" = EXCLUDED."createdAt",
      "lastVersionAt" = EXCLUDED."lastVersionAt",
      "syncedAt" = (NOW() AT TIME ZONE 'UTC')
  `
}

async function fetchMirrorPage(offset: number): Promise<unknown[]> {
  const payload = await fetchCivitaiSearchPayload(
    [
      {
        indexUid: MIRROR_INDEX_UID,
        q: '',
        limit: CIVITAI_MIRROR_FETCH_BATCH,
        offset,
        filter: ['type = LoRA'],
        // 截断线就是这个排序——镜像的定义是「按下载量的前 N」。
        sort: ['metrics.downloadCount:desc'],
        attributesToRetrieve: [...MIRROR_ATTRIBUTES],
      },
    ],
    'civitai.mirrorSync',
    // 后台任务的预算：没人在等，慢一点远好过失败重来一整批。
    // ⚠ 这是两级**顺序**尝试（先 fast，超时才 patient），所以单批最坏耗时是
    // 30 + 60 = 90 秒，不是 30 秒。时间预算必须按 90 算，见 constants/lora.ts
    // 的 CIVITAI_MIRROR_SYNC_TIME_BUDGET_MS。
    {
      fastMs: CIVITAI_MIRROR_FETCH_TIMEOUT_MS,
      patientMs: CIVITAI_MIRROR_FETCH_TIMEOUT_MS * 2,
    },
  )
  const parsed = MirrorSearchResponseSchema.parse(payload)
  const first = parsed.results[0]
  // 同上：没有结果集 = 响应形状不对。抛错走 catch 保住进度，别当成空目录。
  if (!first) {
    throw new Error('Civitai mirror search returned no result set')
  }
  return first.hits
}

export interface CivitaiMirrorSyncResult {
  scanned: number
  upserted: number
  skipped: number
  cursor: number
  completed: boolean
  pruned: number
  /**
   * 本次运行留下的错误说明（剪枝被比例闸挡下、或 CAS 没认领到）。
   *
   * 存在的理由：`lastError` 此前**全仓零读者**（`readCivitaiMirrorFreshness`
   * 只读 `lastCompletedAt`），schema 注释承诺的「失败要能看见而不是静静重试」
   * 没有兑现。剪枝被挡下如果也没人看得见，这个闸就等于没修——所以把它抬进
   * 路由返回体，cron 日志里直接可见。
   */
  notice: string | null
}

/**
 * 推进一片同步。`maxBatches` 由调用方按自己的执行时长预算给——一批约
 * 1–6 秒。
 */
export async function syncCivitaiMirrorChunk({
  maxBatches,
}: {
  maxBatches: number
}): Promise<CivitaiMirrorSyncResult> {
  const state = await db.civitaiMirrorSyncState.upsert({
    where: { id: CIVITAI_MIRROR_SYNC_STATE_ID },
    create: { id: CIVITAI_MIRROR_SYNC_STATE_ID },
    update: {},
  })

  let cursor = state.cursor

  // ⚠ `{cursor > 0, passStartedAt: null}` 是**状态损坏**，不是「该新开一轮」。
  //
  // 曾经这里对它取 `new Date()` 当整轮的剪枝边界，且因为落库被 `cursor === 0`
  // 挡着而不写回——于是本轮一旦走到 exhausted，剪枝会删掉「早于本次运行开始」
  // 的所有行，也就是除本次 upsert 的那 ~15,000 行之外的整张表，然后还把
  // lastCompletedAt 写成 now，freshness 向 UI 谎报「刚刚完整刷新过」。
  //
  // 正确处理是**当损坏态重开一轮**：cursor 归零，重新取边界。代价是重扫已扫过
  // 的一段（几天内自愈），换的是绝不拿一个「刚刚」的时间戳去删整张表。
  const passStateCorrupted = cursor > 0 && !state.passStartedAt
  if (passStateCorrupted) {
    logger.warn(
      'Civitai mirror sync state is inconsistent (cursor > 0 without passStartedAt) — restarting the pass',
      { cursor },
    )
    cursor = 0
  }

  // 本次运行认领的起点。所有状态写回都拿它做 CAS 条件，见 commitCursor()。
  const startCursor = cursor
  const isNewPass = cursor === 0
  const passStartedAt = isNewPass ? new Date() : state.passStartedAt
  if (!passStartedAt) {
    // 上面两个分支已经穷尽了 passStartedAt 为空的情况，这里只是让类型收窄。
    throw new Error('Civitai mirror sync could not resolve a pass boundary')
  }
  if (isNewPass) {
    // ⚠ cursor 一并写回：损坏态那条路径靠这一次写把 cursor 真正归零。
    //
    // ⚠ 这一次写也走 CAS，条件是「状态还是我读到的那个样子」。它写的是
    // `cursor: 0`——整个函数里最有破坏力的值——如果在上面那次读与这次写之间
    // 有并发运行推进了 cursor，无条件写会把它一把打回 0，正是这次改动要消灭
    // 的那类 bug。窗口极窄（日 cron），但没有理由给它留着。
    const { count } = await db.civitaiMirrorSyncState.updateMany({
      where: {
        id: CIVITAI_MIRROR_SYNC_STATE_ID,
        cursor: state.cursor,
        passStartedAt: state.passStartedAt,
      },
      data: { cursor: 0, passStartedAt, lastError: null },
    })
    if (count === 0) {
      logger.warn(
        'Civitai mirror sync lost the pass-start race — another run owns the state',
        { readCursor: state.cursor },
      )
      return {
        scanned: 0,
        upserted: 0,
        skipped: 0,
        cursor: state.cursor,
        completed: false,
        pruned: 0,
        notice: 'Skipped: another run started this pass first',
      }
    }
  }

  /**
   * 状态写回，带 CAS（compare-and-swap）。
   *
   * 这条管线没有互斥——两次 cron 重叠（Vercel 重试、手动打 `?batches=`、部署
   * 期重叠调用）会同时读到同一个 cursor 各跑各的。此前所有写回都是无条件
   * `update`，于是慢的那个会把快的那个的进度**回退**；被回退的那一段本轮再
   * 也扫不到，syncedAt 停在上一轮，收尾时被当成「已经不在了」删掉——表现为
   * 随机一批模型莫名从本地目录消失。
   *
   * ⚠ 为什么不用 advisory lock：`pg_advisory_xact_lock` 是事务作用域，而这条
   * 管线跨几分钟、多批次、每批各自落库，包不进一个事务；session 作用域的
   * `pg_try_advisory_lock` 在连接池（`DATABASE_POOL.MAX_CONNECTIONS`）下拿锁与
   * 解锁可能落在不同连接上，会漏锁。CAS 不需要新列、不需要锁，且正好挡住真正
   * 有害的那一半（状态被覆盖）。重复取数只是浪费，不会损坏。
   *
   * ⚠ 条件里**必须带上 `passStartedAt`**，只比 cursor 会有 ABA：一轮收尾会把
   * cursor 重置回 0，此时另一个并发运行的 `where: { cursor: 0 }` 会意外匹配
   * 上，拿着自己那份边界去剪枝。`passStartedAt` 本来就是轮次身份，用它把「这
   * 一轮」钉死，不必新加 epoch 列。
   *
   * @returns 是否写成功（false = 这一轮已经被别的运行推进或收尾，本次放弃写回）
   */
  async function commitCursor(
    data: Prisma.CivitaiMirrorSyncStateUpdateManyMutationInput,
  ): Promise<boolean> {
    const { count } = await db.civitaiMirrorSyncState.updateMany({
      where: {
        id: CIVITAI_MIRROR_SYNC_STATE_ID,
        cursor: startCursor,
        passStartedAt,
      },
      data,
    })
    if (count === 0) {
      logger.warn(
        'Civitai mirror sync lost a cursor race — discarding this run’s progress write',
        { startCursor, passStartedAt },
      )
    }
    return count > 0
  }

  let scanned = 0
  let upserted = 0
  let skipped = 0
  let exhausted = false
  const startedAt = Date.now()

  try {
    for (let batch = 0; batch < maxBatches; batch += 1) {
      if (cursor >= CIVITAI_MIRROR_BACKFILL_LIMIT) {
        exhausted = true
        break
      }
      // 时间预算才是真护栏：上游慢的时候单批可以到 30 秒，只按批数封顶会
      // 冲过函数执行时限，那时进度还没落库就被杀，下次从头重扫这一段。
      if (
        batch > 0 &&
        Date.now() - startedAt > CIVITAI_MIRROR_SYNC_TIME_BUDGET_MS
      ) {
        logger.info(
          'Civitai mirror sync hit its time budget — parking progress',
          {
            cursor,
            batches: batch,
            elapsedMs: Date.now() - startedAt,
          },
        )
        break
      }
      const hits = await fetchMirrorPage(cursor)
      scanned += hits.length
      if (hits.length === 0) {
        exhausted = true
        break
      }

      const rows = hits
        .map((hit) => mapHitToMirrorRow(hit))
        .filter((row): row is CivitaiMirrorRow => row !== null)
      skipped += hits.length - rows.length
      upserted += await upsertMirrorRows(rows)

      cursor += hits.length
      if (hits.length < CIVITAI_MIRROR_FETCH_BATCH) {
        exhausted = true
        break
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown'
    // 进度照样落库：下一次 cron 从断点续跑，不用把已经扫过的重扫一遍。
    await commitCursor({ cursor, lastError: message })
    logger.error('Civitai mirror sync chunk failed', { cursor, error: message })
    throw error
  }

  /**
   * 收尾之后的补记。此时状态已被认领成 `{cursor: 0, passStartedAt: null}`，
   * 所以条件就是「还没有人开新轮」——避免把本轮的 lastError / lastCompletedAt
   * 盖到别人的轮次上。
   */
  async function annotateCompletedPass(
    data: Prisma.CivitaiMirrorSyncStateUpdateManyMutationInput,
  ): Promise<void> {
    await db.civitaiMirrorSyncState.updateMany({
      where: {
        id: CIVITAI_MIRROR_SYNC_STATE_ID,
        cursor: 0,
        passStartedAt: null,
      },
      data,
    })
  }

  let pruned = 0
  let notice: string | null = null
  // 默认「什么都没写成」。CAS 输掉竞态时不能拿本地推进过的 cursor 当结果报出
  // 去——那是个从没落过库的游标，调用方会以为进度存下了。
  let persistedCursor = startCursor
  let passCompleted = false

  if (exhausted) {
    // 先用 CAS 认领「本轮收尾」再删。两个理由：
    //   · 没认领到 = 有并发运行推进过 cursor，本次算出的 passStartedAt 已经不
    //     代表这一轮的真实边界，照它删就是拿错边界删表；
    //   · 认领成功后即使剪枝失败/被执行时限掐断也无妨——下一轮会重新取边界，
    //     这些行仍然早于新边界，届时照样删得掉（自愈）。
    // ⚠ 不把认领和 deleteMany 包进 interactive transaction：Prisma 默认 5s 超
    // 时，而 5 万行 × 6 个索引（含两个 GIN）的删除很容易超。
    // ⚠ 这里**不写 lastCompletedAt**，见下面剪枝成功那一支。
    const claimed = await commitCursor({
      cursor: 0,
      passStartedAt: null,
      lastError: null,
    })

    if (!claimed) {
      notice = 'Prune skipped: a concurrent run already advanced the cursor'
      logger.warn(
        'Civitai mirror sync lost the pass-completion race — skipping prune',
        { startCursor },
      )
    } else {
      persistedCursor = 0
      passCompleted = true

      // 本轮没被扫到的行 = 本轮一次都没 upsert 到的行。整轮走完才敢删——中途
      // 删会把「还没扫到」误判成「已经不在了」。
      //
      // ⚠ 注意这不等于「掉出 top N 或已被上游删除」：排序键是 downloadCount
      // 降序，而游标在几天里单向推进，任何模型在被扫到之前**排名上升穿过游
      // 标**就会本轮漏扫——它还在 top N 里，却会被这一步删掉，下一轮再插回
      // 来。这是 offset 分页配可变排序键的固有缺陷，不是这段引入的。
      //
      // ⚠ 比例闸：要删的比例异常大，说明边界或这一轮的扫描本身出了问题——宁
      // 可不删留给下一轮（下一轮取新边界，该删的照样删得掉），也不要把这个兜
      // 底层削空。
      // 一条 `count(*) FILTER` 同时拿两个数，Postgres 只走一遍表。
      //
      // ⚠ 别拆回两条 `count()`：那是两次全表顺扫，而 `syncedAt` **没有索引**。
      // 也别为此去加索引——收尾几天才跑一次，而 `syncedAt` 每次 upsert 都变，
      // 索引会在最热的写路径上收永久的税，还会让那些指标没变的行失去 HOT
      // 更新资格（HOT 要求没有任何被索引的列发生变化）。为一次查询拖累每一
      // 次写，不划算。
      const [counts] = await db.$queryRaw<{ stale: bigint; total: bigint }[]>`
        SELECT
          count(*) FILTER (WHERE "syncedAt" < ${passStartedAt}) AS stale,
          count(*) AS total
        FROM "CivitaiLoraMirror"
      `
      const staleCount = Number(counts?.stale ?? 0)
      const totalCount = Number(counts?.total ?? 0)
      const staleRatio = totalCount === 0 ? 0 : staleCount / totalCount

      if (staleRatio > CIVITAI_MIRROR_PRUNE_MAX_STALE_RATIO) {
        const message = `Prune aborted: ${staleCount}/${totalCount} rows are stale (${Math.round(staleRatio * 100)}%), above the ${Math.round(CIVITAI_MIRROR_PRUNE_MAX_STALE_RATIO * 100)}% guard`
        notice = message
        logger.error('Civitai mirror prune tripped the ratio guard', {
          staleCount,
          totalCount,
        })
        await annotateCompletedPass({ lastError: message })
      } else {
        const { count } = await db.civitaiLoraMirror.deleteMany({
          where: { syncedAt: { lt: passStartedAt } },
        })
        pruned = count
        // ⚠ lastCompletedAt **只在剪枝真的做完之后**才写。它是
        // `readCivitaiMirrorFreshness` 唯一读的字段，也就是 UI 上「镜像新不
        // 新鲜」的唯一依据；闸门跳闸时照写就等于亲手制造上面那句注释警告的
        // 静默——一边挡下删除，一边告诉界面「刚刚完整刷新过」。
        await annotateCompletedPass({ lastCompletedAt: new Date() })
      }

      logger.info('Civitai mirror sync pass completed', {
        scanned,
        upserted,
        skipped,
        pruned,
      })
    }
  } else {
    // lastError 一并清掉：它此前只在开轮与整轮完成时清，于是一轮中间的一次
    // 瞬时失败会把错误粘在状态里 3-4 天，即便后续每天的分片全部成功。
    if (await commitCursor({ cursor, lastError: null })) {
      persistedCursor = cursor
    } else {
      notice =
        'Progress discarded: a concurrent run owns this pass (cursor unchanged)'
    }
  }

  return {
    scanned,
    upserted,
    skipped,
    cursor: persistedCursor,
    completed: passCompleted,
    pruned,
    notice,
  }
}
