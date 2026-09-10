import 'server-only'

import { randomUUID } from 'node:crypto'

import { db } from '@/lib/db'
import type { Prisma } from '@/lib/generated/prisma/client'
import { logger } from '@/lib/logger'
import {
  CACHE_TAGS,
  cacheableFn,
  invalidatePublicGalleryCache,
} from '@/lib/cache-tags'
import { buildGenerationDisplayName } from '@/lib/generation-name'
import { normalizeReferenceImages } from '@/lib/reference-image-compat'
import type {
  AssetSectionCounts,
  GenerationRecord,
  GallerySortOption,
  GalleryTimeRange,
  GenerationSourceSurface,
  OutputType,
  OutputTypeValue,
} from '@/types'
import { PAGINATION } from '@/constants/config'
import {
  GENERATION_REVIEW_STATES,
  GENERATION_REVIEW_STATE_IDS,
  type GenerationReviewState,
} from '@/constants/assistant-operator'
import { USER_UPLOAD_PROVIDER } from '@/constants/uploads'
import { updatePreferenceOnDeleted } from '@/services/user-preference.service'

// ─── Input Types ──────────────────────────────────────────────────

/**
 * ⚠ 带上 `$queryRaw` 是因为**取号必须走原生 SQL**：Prisma 没有「锁一行」的
 * API，而取号的正确性全靠那把锁（见 `allocateGenerationSeq`）。
 */
type GenerationMutationClient = Pick<
  typeof db,
  'generation' | 'generationCharacterCard' | '$queryRaw'
>

interface GenerationStorageKeyFields {
  storageKey: string | null
  thumbnailStorageKey?: string | null
  previewStorageKey?: string | null
  modelStorageKey?: string | null
}

function getGenerationStorageKeys(
  generation: GenerationStorageKeyFields,
): string[] {
  return Array.from(
    new Set(
      [
        generation.storageKey,
        generation.thumbnailStorageKey,
        generation.previewStorageKey,
        generation.modelStorageKey,
      ].filter((key): key is string => typeof key === 'string' && key !== ''),
    ),
  )
}

export interface CreateGenerationInput {
  url: string
  storageKey: string
  mimeType: string
  thumbnailUrl?: string
  thumbnailStorageKey?: string
  previewUrl?: string
  previewStorageKey?: string
  width: number
  height: number
  duration?: number
  referenceImageUrl?: string
  /** GLB file URL for MODEL_3D outputs (null for other types) */
  modelUrl?: string
  /** R2 storage key for the GLB file */
  modelStorageKey?: string
  prompt: string
  negativePrompt?: string
  model: string
  provider: string
  requestCount: number
  outputType?: OutputType
  isFreeGeneration?: boolean
  isPublic?: boolean
  isPromptPublic?: boolean
  userId?: string
  /** Character card IDs to link via join table (multi-card) */
  characterCardIds?: string[]
  /** Project ID to associate this generation with */
  projectId?: string
  /** B0: Full input parameter snapshot (JSON) */
  snapshot?: Prisma.InputJsonValue
  /** Prompt template / card recipe lineage snapshot (JSON) */
  recipeSnapshot?: Prisma.InputJsonValue
  /** B0: Seed for reproducibility */
  seed?: bigint
  /** B0: Run group ID for compare/variant */
  runGroupId?: string
  /** B0: Run group type */
  runGroupType?: string
  /** B0: Position within run group */
  runGroupIndex?: number
  /** 产物来源 surface（缺省 IMAGE_STUDIO）。 */
  sourceSurface?: GenerationSourceSurface
  /**
   * 助手给这条产物起的名字（切片 N1）——覆盖名字里的**摘要**那一段
   * （`图_012·主视觉`），⛔ 覆盖不了身份段（那一段只由 id 决定）。
   * 不给就取提示词头几个字。
   */
  displayLabel?: string
}

export interface ListGenerationsOptions {
  page?: number
  limit?: number
}

export interface GalleryQueryOptions {
  includeTotal?: boolean
  page?: number
  limit?: number
  cursor?: string
  search?: string
  model?: string[]
  sort?: GallerySortOption
  type?: OutputTypeValue[]
  timeRange?: GalleryTimeRange
  /** When set, query this user's own generations (including private) */
  userId?: string
  /** When set, only return generations liked by this user */
  likedByUserId?: string
  published?: boolean
  /** When set, include isLiked for this viewer */
  viewerUserId?: string
  /**
   * Optional project filter:
   * - undefined  → no project filter (all projects)
   * - "none"     → only generations with projectId = null
   * - "<uuid>"   → only generations belonging to that project
   */
  projectId?: string
  /**
   * Filter by Generation.provider. Used by the asset browser's "Local
   * assets" sidebar entry to scope to `USER_UPLOAD_PROVIDER` rows.
   */
  provider?: string
}

export interface GalleryGenerationPage {
  generations: GenerationRecord[]
  total: number | null
  hasMore: boolean
  nextCursor: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────

/**
 * Fields included in list-style queries. Deliberately excludes the
 * heavy JSON columns (`snapshot`, `recipeSnapshot`, `evaluation`) — a
 * single generation row can be 7 MB when the user uploaded base64
 * dataURL reference images, so a 24-item page balloons to 30 MB+.
 * Detail-style queries (`getOwnedGenerationWithSnapshot`, studio remix)
 * still load the full row.
 */
export const LIST_GENERATION_SELECT = {
  id: true,
  createdAt: true,
  outputType: true,
  status: true,
  url: true,
  storageKey: true,
  mimeType: true,
  thumbnailUrl: true,
  thumbnailStorageKey: true,
  previewUrl: true,
  previewStorageKey: true,
  width: true,
  height: true,
  duration: true,
  referenceImageUrl: true,
  modelUrl: true,
  modelStorageKey: true,
  prompt: true,
  negativePrompt: true,
  model: true,
  provider: true,
  requestCount: true,
  isFreeGeneration: true,
  isPublic: true,
  isPromptPublic: true,
  isFeatured: true,
  userId: true,
  projectId: true,
  characterCardId: true,
  cardRecipeId: true,
  runGroupId: true,
  runGroupType: true,
  runGroupIndex: true,
  isWinner: true,
  seed: true,
  /**
   * 产物序号（切片 N1 改真计数器）。⭐ 它**能**进列表口正是因为它是一个 Int：
   * 名字过去只能从 id 派生，就是因为唯一存得下计数器的地方是那份 7 MB 的
   * `snapshot`，而列表口拉不起它。一列整数把这条约束解掉了。
   */
  seq: true,
} as const satisfies Prisma.GenerationSelect

const OUTPUT_TYPE_ENUM_BY_VALUE: Record<OutputTypeValue, OutputType> = {
  image: 'IMAGE',
  video: 'VIDEO',
  audio: 'AUDIO',
  model_3d: 'MODEL_3D',
}

/** 空数组 = 不限类型（分面「不选就是全部」）。 */
function outputTypesToEnums(types?: OutputTypeValue[]): OutputType[] {
  if (!types?.length) return []
  return types.map((type) => OUTPUT_TYPE_ENUM_BY_VALUE[type])
}

/**
 * 时间分面 → 起点。契约 §3.1 的四档：今天 / 7 天 / 30 天 / 今年。
 * 「今年」是自然年（1 月 1 日起），不是「过去 365 天」。
 */
function getTimeRangeStart(timeRange?: GalleryTimeRange): Date | null {
  if (!timeRange || timeRange === 'all') return null
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  if (timeRange === 'today') return start
  if (timeRange === 'week') {
    start.setDate(start.getDate() - 7)
    return start
  }
  if (timeRange === 'month') {
    start.setDate(start.getDate() - 30)
    return start
  }
  start.setMonth(0, 1)
  return start
}

/** Redact prompt fields for generations where isPromptPublic is false. */
function redactPrompts(generations: GenerationRecord[]): GenerationRecord[] {
  return generations.map((g) =>
    g.isPromptPublic ? g : { ...g, prompt: '', negativePrompt: null },
  )
}

function buildGalleryWhere(options: {
  search?: string
  model?: string[]
  type?: OutputTypeValue[]
  timeRange?: GalleryTimeRange
  userId?: string
  likedByUserId?: string
  published?: boolean
  projectId?: string
  provider?: string
}) {
  const where: Record<string, unknown> = {}

  if (options.userId) {
    where.userId = options.userId
  } else {
    where.isPublic = true
  }

  if (options.published) {
    where.isPublic = true
  }

  // Project scoping: caller passes either a UUID, the literal "none" for
  // unassigned generations, or omits to disable the filter.
  if (options.projectId === 'none') {
    where.projectId = null
  } else if (options.projectId) {
    where.projectId = options.projectId
  }

  if (options.search) {
    if (options.userId) {
      // Owner can search all their own prompts
      where.prompt = { contains: options.search, mode: 'insensitive' }
    } else {
      // Public gallery: only search prompt-public generations
      where.AND = [
        { isPromptPublic: true },
        { prompt: { contains: options.search, mode: 'insensitive' } },
      ]
    }
  }
  // 模型 / 类型都是可叠加分面：多选 = 组内 OR（`in`），空 = 不限。
  if (options.model?.length) {
    where.model = { in: options.model }
  }
  if (options.provider) {
    where.provider = options.provider
  }
  const outputTypes = outputTypesToEnums(options.type)
  if (outputTypes.length) {
    where.outputType = { in: outputTypes }
  }

  // Time range filter
  const since = getTimeRangeStart(options.timeRange)
  if (since) {
    where.createdAt = { gte: since }
  }

  // Liked-by filter
  if (options.likedByUserId) {
    where.likes = { some: { userId: options.likedByUserId } }
  }

  return where
}

function getGalleryOrderBy(
  sort: GallerySortOption = 'newest',
): Prisma.GenerationOrderByWithRelationInput[] {
  const direction = sort === 'newest' ? 'desc' : 'asc'
  return [{ createdAt: direction }, { id: direction }]
}

interface DecodedGalleryCursor {
  id: string
  createdAt: Date
}

function encodeGalleryCursor(row: Pick<GenerationRecord, 'id' | 'createdAt'>) {
  const createdAt =
    row.createdAt instanceof Date
      ? row.createdAt.toISOString()
      : new Date(row.createdAt).toISOString()
  return Buffer.from(JSON.stringify({ id: row.id, createdAt })).toString(
    'base64url',
  )
}

function decodeGalleryCursor(cursor?: string): DecodedGalleryCursor | null {
  if (!cursor) return null

  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    ) as unknown
    if (!isRecord(parsed)) return null
    if (typeof parsed.id !== 'string') return null
    if (typeof parsed.createdAt !== 'string') return null

    const createdAt = new Date(parsed.createdAt)
    if (Number.isNaN(createdAt.getTime())) return null

    return { id: parsed.id, createdAt }
  } catch {
    return null
  }
}

function buildGalleryCursorWhere(
  cursor: DecodedGalleryCursor | null,
  sort: GallerySortOption,
): Record<string, unknown> | null {
  if (!cursor) return null

  const direction = sort === 'newest' ? 'lt' : 'gt'

  return {
    OR: [
      { createdAt: { [direction]: cursor.createdAt } },
      {
        AND: [
          { createdAt: cursor.createdAt },
          { id: { [direction]: cursor.id } },
        ],
      },
    ],
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getSnapshotReferenceImages(snapshot: unknown): unknown {
  if (!isRecord(snapshot)) {
    return null
  }

  return snapshot.referenceAssets ?? snapshot.referenceImages ?? null
}

function normalizeGenerationReferenceImages(
  generation: GenerationRecord,
): GenerationRecord {
  const snapshotReferenceImages = getSnapshotReferenceImages(
    generation.snapshot,
  )
  const fallbackReferenceImages = generation.referenceImageUrl
    ? [generation.referenceImageUrl]
    : null
  const rawReferenceImages = snapshotReferenceImages ?? fallbackReferenceImages

  return {
    ...generation,
    referenceImages: normalizeReferenceImages(rawReferenceImages),
  }
}

// ─── Service Functions ────────────────────────────────────────────

/**
 * 这个用户的**下一个产物序号**（切片 N1）。
 *
 * ── 判据：为什么并发下不撞号 ──────────────────────────────────────
 * 撞号只有一个窗口：两个事务都读到同一个 `max(seq)`，然后各写各的。所以先对
 * **`User` 那一行**加 `FOR UPDATE`：
 *   · 行锁把**同一个用户**的取号串行化 —— 第二个事务卡在 `SELECT ... FOR UPDATE`
 *     上，直到第一个提交；那时它读 `max(seq)` 已经看得见第一个插进去的行。
 *   · 锁到**事务提交**才释放，而插入与取号在同一个事务里（`createGeneration`
 *     整个包在 `$transaction` 中），中间不存在「号发了但行还没进去」的缝。
 *   · 锁的是用户自己那一行，**不同用户互不阻塞** —— ⛔ 没有全表锁。
 * ⚠ 之所以不锁 `Generation` 的行：`SELECT ... FOR UPDATE` 锁不住**还不存在的
 * 行**（幻读），两个事务在一个空用户上会同时拿到 0。锁父行才是那把真锁。
 *
 * ⚠ 匿名行（`userId` 缺席）不取号：没有「谁的第几件」这回事，返回 `undefined`，
 * 名字退化成只有摘要（见 `lib/generation-name.ts`）。
 * ⚠ `User` 那一行不存在时锁不到任何东西 —— 但那种输入本来就会在插入时被外键
 * 打回，⛔ 不在这里额外造一个报错。
 */
async function allocateGenerationSeq(
  client: GenerationMutationClient,
  userId: string | null | undefined,
): Promise<number | undefined> {
  if (!userId) return undefined
  await client.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`
  const rows = await client.$queryRaw<{ next: number }[]>`
    SELECT COALESCE(MAX("seq"), 0) + 1 AS "next"
    FROM "Generation"
    WHERE "userId" = ${userId}
  `
  return Number(rows[0]?.next ?? 1)
}

/**
 * 落库前把**产物名**塞进 snapshot（切片 N1）。
 *
 * ── 为什么还要存一份 ──────────────────────────────────────────────
 * 序号本身已经是列（`seq`），列表口读得到，名字随时现算得出。存这一份只为
 * **摘要**：助手给的 `label` 只在写入这一跳有，之后任何列表口都读不回来。
 *
 * ⚠ 存下来的这份⛔ 不是唯一事实：没存到的路径按同一条纯函数现算，身份段一定
 * 相同（都只看 `seq` + `outputType`，见 `lib/generation-name.ts` 头注）。
 *
 * ⚠ snapshot 不是对象时（历史上有调用方塞过数组/标量）**不动它** —— 名字照旧
 * 现算，⛔ 不把一份别人的数据结构改形状。
 */
function withGenerationDisplayName(
  seq: number | undefined,
  input: CreateGenerationInput,
): Prisma.InputJsonValue {
  const displayName = buildGenerationDisplayName({
    seq,
    outputType: input.outputType ?? 'IMAGE',
    prompt: input.prompt,
    label: input.displayLabel,
  })
  const snapshot = input.snapshot
  if (snapshot === undefined || snapshot === null) return { displayName }
  if (typeof snapshot !== 'object' || Array.isArray(snapshot)) return snapshot
  return { ...(snapshot as Record<string, unknown>), displayName }
}

/**
 * Persist a completed generation to the database.
 * Called after the AI provider returns a result and R2 upload completes.
 *
 * ⭐ **取号与插入必须同一个事务**（切片 N1）：`seq` 是「这个用户的第几件」，
 * 中间断开就等于把号发出去而行还没落地，下一个取号会拿到同一个数。所以
 * 调用方没给事务客户端时，这里**自己开一个**。
 * ⚠ 调用方给了 `client` 就当它已经在事务里（`execution-callback.service` /
 * `generate-audio.service` 都是这么调的）—— ⛔ 不在事务里再开一个事务。
 */
export async function createGeneration(
  input: CreateGenerationInput,
  client?: GenerationMutationClient,
): Promise<GenerationRecord> {
  if (!client) {
    return db.$transaction((tx) => createGenerationWithin(input, tx))
  }
  return createGenerationWithin(input, client)
}

async function createGenerationWithin(
  input: CreateGenerationInput,
  client: GenerationMutationClient,
): Promise<GenerationRecord> {
  const seq = await allocateGenerationSeq(client, input.userId)
  /**
   * ⭐ id 在这里现取而不是交给 `@default(uuid())`：名字要在插入的同一次写里
   * 落进 snapshot，插入之后再回写一次就是两次写、两个可以不一致的状态。
   */
  const id = randomUUID()
  const generation = await client.generation.create({
    data: {
      id,
      seq,
      snapshot: withGenerationDisplayName(seq, input),
      url: input.url,
      storageKey: input.storageKey,
      mimeType: input.mimeType,
      thumbnailUrl: input.thumbnailUrl,
      thumbnailStorageKey: input.thumbnailStorageKey,
      previewUrl: input.previewUrl,
      previewStorageKey: input.previewStorageKey,
      width: input.width,
      height: input.height,
      duration: input.duration,
      referenceImageUrl: input.referenceImageUrl,
      modelUrl: input.modelUrl,
      modelStorageKey: input.modelStorageKey,
      prompt: input.prompt,
      negativePrompt: input.negativePrompt,
      model: input.model,
      provider: input.provider,
      requestCount: input.requestCount,
      outputType: input.outputType ?? 'IMAGE',
      isFreeGeneration: input.isFreeGeneration ?? false,
      isPublic: input.isPublic ?? false,
      isPromptPublic: input.isPromptPublic ?? false,
      userId: input.userId,
      projectId: input.projectId,
      recipeSnapshot: input.recipeSnapshot,
      seed: input.seed,
      runGroupId: input.runGroupId,
      runGroupType: input.runGroupType ?? 'single',
      runGroupIndex: input.runGroupIndex ?? 0,
      sourceSurface: input.sourceSurface ?? 'IMAGE_STUDIO',
    },
  })

  // Link character cards via join table (multi-card support)
  if (input.characterCardIds && input.characterCardIds.length > 0) {
    await client.generationCharacterCard.createMany({
      data: input.characterCardIds.map((cardId) => ({
        generationId: generation.id,
        characterCardId: cardId,
      })),
    })
  }

  if (input.isPublic) {
    invalidatePublicGalleryCache()
  }

  return generation
}

/**
 * 这条来源地址**是不是已经在这个用户的库里了**（联网导入的幂等键，2026-09-07）。
 *
 * ── 为什么需要它 ──────────────────────────────────────────────────
 * 同一张候选图有**两条**导入路：用户按候选行上的「选用 / 挂上 N 张」，以及助手
 * 拿着 `import_user_url` 自己挂（两者 2026-09-06 同一轮落地）。两条路各自调一次
 * `POST /api/studio/web-image-import`，谁都不知道对方 —— 用户库里于是长出**成对**
 * 的重复。⭐ 幂等只能落在服务端：那是两条路唯一的交汇点。
 *
 * ── 判据为什么是 snapshot 而不是新字段 ────────────────────────────
 * 来源已经写在 `Generation.snapshot` 里（策略 C，`imageUrl` = 真正取到字节的地址、
 * `pageUrl` = 那一页）。⛔ 不加列、不写迁移：一条可空列换不到任何这里没有的东西，
 * 而 `snapshot` 里那两条**存量行也有**，于是历史导入立刻就能被复用。
 * ⚠ 两条都比：用户递来的可能是网页（那时它落在 `pageUrl`），也可能是原图直链。
 *
 * ⚠ `provider` 收窄到本地素材那一档 —— 真正的生成不走这条链，别让一次 generation
 * 的 snapshot 里碰巧同名的字段把导入去重带偏。
 */
export async function findImportedGenerationBySourceUrl(
  userId: string,
  sourceUrls: readonly string[],
): Promise<GenerationRecord | null> {
  const urls = [...new Set(sourceUrls.filter((url) => url.length > 0))]
  if (urls.length === 0) return null
  return db.generation.findFirst({
    where: {
      userId,
      provider: USER_UPLOAD_PROVIDER,
      OR: urls.flatMap((url) => [
        { snapshot: { path: ['imageUrl'], equals: url } },
        { snapshot: { path: ['pageUrl'], equals: url } },
      ]),
    },
    // 重复里**留最早的那条**：后来那些是这个 bug 造出来的。
    orderBy: { createdAt: 'asc' },
  })
}

/**
 * Count how many free tier generations a user has made today (UTC).
 */
export async function getFreeGenerationCountToday(
  userId: string,
): Promise<number> {
  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)

  return db.generation.count({
    where: {
      userId,
      isFreeGeneration: true,
      createdAt: { gte: todayStart },
    },
  })
}

/**
 * Platform-wide free tier usage stats for admin monitoring.
 */
export async function getFreeTierStats(): Promise<{
  today: number
  last7Days: number
  last30Days: number
  uniqueUsersToday: number
}> {
  const now = new Date()
  const todayStart = new Date(now)
  todayStart.setUTCHours(0, 0, 0, 0)

  const sevenDaysAgo = new Date(now)
  sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7)

  const thirtyDaysAgo = new Date(now)
  thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30)

  const [today, last7Days, last30Days, uniqueUsers] = await Promise.all([
    db.generation.count({
      where: { isFreeGeneration: true, createdAt: { gte: todayStart } },
    }),
    db.generation.count({
      where: { isFreeGeneration: true, createdAt: { gte: sevenDaysAgo } },
    }),
    db.generation.count({
      where: { isFreeGeneration: true, createdAt: { gte: thirtyDaysAgo } },
    }),
    db.generation.findMany({
      where: {
        isFreeGeneration: true,
        createdAt: { gte: todayStart },
        userId: { not: null },
      },
      select: { userId: true },
      distinct: ['userId'],
    }),
  ])

  return {
    today,
    last7Days,
    last30Days,
    uniqueUsersToday: uniqueUsers.length,
  }
}

/**
 * Get all generations belonging to a specific user, newest first.
 */
export async function getUserGenerations(
  userId: string,
  {
    page = PAGINATION.DEFAULT_PAGE,
    limit = PAGINATION.DEFAULT_LIMIT,
  }: ListGenerationsOptions = {},
): Promise<GenerationRecord[]> {
  const generations = await db.generation.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * limit,
    take: limit,
    select: LIST_GENERATION_SELECT,
  })

  return generations as GenerationRecord[]
}

export async function countUserGenerations(userId: string): Promise<number> {
  return db.generation.count({
    where: { userId },
  })
}

export async function countUserPublicGenerations(
  userId: string,
): Promise<number> {
  return db.generation.count({
    where: {
      userId,
      isPublic: true,
    },
  })
}

async function getPublicGenerationSlice({
  page = PAGINATION.DEFAULT_PAGE,
  limit = PAGINATION.DEFAULT_LIMIT,
  cursor,
  search,
  model,
  sort = 'newest',
  type,
  timeRange,
  userId,
  likedByUserId,
  published,
  viewerUserId,
  projectId,
  provider,
}: GalleryQueryOptions = {}): Promise<
  Pick<GalleryGenerationPage, 'generations' | 'hasMore' | 'nextCursor'>
> {
  // Owner-scoped queries (mine=1, /assets) don't render like badges, so
  // we skip the join + aggregate. Public/community queries still need
  // _count.likes for the heart counter and the optional viewer.likes
  // probe to mark isLiked.
  const isOwnerView = !!userId
  const creatorSelect = {
    user: {
      select: {
        username: true,
        displayName: true,
        avatarUrl: true,
      },
    },
  } as const

  const select = isOwnerView
    ? { ...LIST_GENERATION_SELECT, ...creatorSelect }
    : {
        ...LIST_GENERATION_SELECT,
        ...creatorSelect,
        _count: { select: { likes: true } },
        ...(viewerUserId
          ? { likes: { where: { userId: viewerUserId }, take: 1 } }
          : {}),
      }

  const baseWhere = buildGalleryWhere({
    search,
    model,
    type,
    timeRange,
    userId,
    likedByUserId,
    published,
    projectId,
    provider,
  })
  const decodedCursor = decodeGalleryCursor(cursor)
  const cursorWhere = buildGalleryCursorWhere(decodedCursor, sort)
  const where = cursorWhere ? { AND: [baseWhere, cursorWhere] } : baseWhere

  const results = await db.generation.findMany({
    where,
    orderBy: getGalleryOrderBy(sort),
    ...(decodedCursor ? {} : { skip: (page - 1) * limit }),
    take: limit + 1,
    select,
  })

  const hasMore = results.length > limit
  const pageResults = hasMore ? results.slice(0, limit) : results
  const lastPageResult = pageResults[pageResults.length - 1]
  const nextCursor =
    hasMore && lastPageResult ? encodeGalleryCursor(lastPageResult) : null

  // Map creator info + like data onto records
  const mapped: GenerationRecord[] = pageResults.map((r) => {
    const { user, _count, likes, ...rest } = r as typeof r & {
      _count?: { likes: number }
      likes?: { id: string }[]
    }
    return {
      ...rest,
      creator: user?.username
        ? {
            username: user.username,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
          }
        : null,
      likeCount: _count?.likes ?? 0,
      isLiked: viewerUserId ? (likes?.length ?? 0) > 0 : undefined,
    }
  })

  // Owner sees full data; public viewers get redacted prompts.
  // No referenceImage normalization in list paths — that's derived from
  // the (intentionally excluded) snapshot column. Detail views still go
  // through getOwnedGenerationWithSnapshot which keeps the full row.
  const generations = userId ? mapped : redactPrompts(mapped)

  return {
    generations,
    hasMore,
    nextCursor,
  }
}

/**
 * Get public generations for the gallery with optional search/filter.
 * When userId is provided, returns that user's own generations (including private).
 */
export async function getPublicGenerations(
  options: GalleryQueryOptions = {},
): Promise<GenerationRecord[]> {
  const page = await getPublicGenerationSlice(options)
  return page.generations
}

export async function getPublicGenerationPage(
  options: GalleryQueryOptions = {},
): Promise<GalleryGenerationPage> {
  const shouldFetchTotal =
    options.includeTotal !== false && !decodeGalleryCursor(options.cursor)
  const [page, total] = await Promise.all([
    getPublicGenerationSlice(options),
    shouldFetchTotal
      ? countPublicGenerations({
          search: options.search,
          model: options.model,
          type: options.type,
          timeRange: options.timeRange,
          userId: options.userId,
          likedByUserId: options.likedByUserId,
          published: options.published,
          projectId: options.projectId,
          provider: options.provider,
        })
      : Promise.resolve(null),
  ])

  return {
    ...page,
    total,
  }
}

/**
 * Owner-scoped fetch of the **full** generation row, heavy JSON columns
 * (`snapshot`, `recipeSnapshot`, `evaluation`) included.
 *
 * The snapshot is what the Studio remix flow rebuilds the original preset
 * from, so this is the one detail query that can't use
 * `LIST_GENERATION_SELECT`. Ownership is part of the query — there is
 * deliberately no unscoped `findUnique({ where: { id } })` variant to
 * reach for, because every caller that had one ended up re-checking
 * `userId` / `isPublic` by hand afterwards. Public reads go through
 * `getPublicGenerationById`.
 */
export async function getOwnedGenerationWithSnapshot(
  id: string,
  userId: string,
): Promise<GenerationRecord | null> {
  const generation = await db.generation.findFirst({
    where: { id, userId },
  })

  return generation ? normalizeGenerationReferenceImages(generation) : null
}

export async function getGenerationByIdForUser(
  id: string,
  userId: string,
): Promise<GenerationRecord | null> {
  const generation = await db.generation.findFirst({
    where: { id, userId },
    select: {
      ...LIST_GENERATION_SELECT,
      user: {
        select: {
          username: true,
          displayName: true,
          avatarUrl: true,
        },
      },
      _count: { select: { likes: true } },
      likes: { where: { userId }, take: 1, select: { id: true } },
    },
  })

  if (!generation) return null

  const { user, _count, likes, ...rest } = generation
  return {
    ...rest,
    creator: user?.username
      ? {
          username: user.username,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
        }
      : null,
    likeCount: _count.likes,
    isLiked: likes.length > 0,
  }
}

/**
 * Slim, public-facing detail fetch for the gallery detail page.
 *
 * Skips the heavy JSON columns (`snapshot`, `recipeSnapshot`, `evaluation`) —
 * a single Generation row can be 7 MB when the original snapshot included
 * base64 reference images, which dominates server response time on the
 * `/gallery/[id]` route. The detail page only needs the columns covered by
 * `LIST_GENERATION_SELECT` plus `referenceImageUrl` (already in the list
 * select) — it does not read `referenceImages` from the snapshot.
 *
 * Returns null when the row doesn't exist OR it isn't public, so callers
 * can short-circuit straight to `notFound()` without re-checking visibility.
 */
export async function getPublicGenerationById(
  id: string,
): Promise<GenerationRecord | null> {
  const generation = await db.generation.findFirst({
    where: { id, isPublic: true },
    select: LIST_GENERATION_SELECT,
  })

  if (!generation) return null

  // No snapshot column was loaded — `normalizeGenerationReferenceImages`
  // would just fall back to `referenceImageUrl`. Apply the prompt-redaction
  // path that the public list query uses so private prompts stay hidden in
  // detail view too.
  const normalized = normalizeGenerationReferenceImages(
    generation as unknown as GenerationRecord,
  )
  return normalized.isPromptPublic
    ? normalized
    : { ...normalized, prompt: '', negativePrompt: null }
}

/** Fields that can be toggled on a generation */
export type ToggleableField = 'isPublic' | 'isPromptPublic' | 'isFeatured'
export type VisibilityFieldValues = Partial<Record<ToggleableField, boolean>>

/** Maximum number of featured generations per user */
const MAX_FEATURED_PER_USER = 9

/**
 * Toggle a boolean flag on a generation that belongs to the given user.
 * Supports isPublic, isPromptPublic, and isFeatured.
 * Returns the updated record, or null if not found / not owned.
 * Returns an error string if the featured limit is exceeded.
 */
export async function toggleGenerationVisibility(
  id: string,
  userId: string,
  field: ToggleableField = 'isPublic',
  value?: boolean,
): Promise<
  | (Pick<GenerationRecord, 'id' | 'isPublic' | 'isPromptPublic'> & {
      isFeatured?: boolean
    })
  | { error: string }
  | null
> {
  const generation = await db.generation.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      isPublic: true,
      isPromptPublic: true,
      isFeatured: true,
    },
  })

  if (!generation || generation.userId !== userId) {
    return null
  }

  const nextValue = value ?? !generation[field]

  // Enforce featured limit when turning ON
  if (field === 'isFeatured' && nextValue && !generation.isFeatured) {
    const featuredCount = await db.generation.count({
      where: { userId, isFeatured: true },
    })
    if (featuredCount >= MAX_FEATURED_PER_USER) {
      return { error: `MAX_FEATURED_EXCEEDED` }
    }
  }

  const updated = await db.generation.update({
    where: { id },
    data: { [field]: nextValue },
    select: {
      id: true,
      isPublic: true,
      isPromptPublic: true,
      isFeatured: true,
    },
  })

  if (field === 'isPublic' || field === 'isPromptPublic') {
    invalidatePublicGalleryCache()
  }

  return updated
}

export async function setGenerationVisibility(
  id: string,
  userId: string,
  values: VisibilityFieldValues,
): Promise<
  | (Pick<GenerationRecord, 'id' | 'isPublic' | 'isPromptPublic'> & {
      isFeatured?: boolean
    })
  | { error: string }
  | null
> {
  const generation = await db.generation.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      isFeatured: true,
    },
  })

  if (!generation || generation.userId !== userId) {
    return null
  }

  if (values.isFeatured === true && !generation.isFeatured) {
    const featuredCount = await db.generation.count({
      where: { userId, isFeatured: true },
    })
    if (featuredCount >= MAX_FEATURED_PER_USER) {
      return { error: `MAX_FEATURED_EXCEEDED` }
    }
  }

  const data = Object.fromEntries(
    Object.entries(values).filter(([, value]) => typeof value === 'boolean'),
  ) as VisibilityFieldValues

  if (Object.keys(data).length === 0) {
    return null
  }

  const updated = await db.generation.update({
    where: { id },
    data,
    select: {
      id: true,
      isPublic: true,
      isPromptPublic: true,
      isFeatured: true,
    },
  })

  if ('isPublic' in data || 'isPromptPublic' in data) {
    invalidatePublicGalleryCache()
  }

  return updated
}

/**
 * Set (or replace) the cover image of an AUDIO asset. The cover is stored in
 * the existing `previewUrl` column — audio rows don't otherwise use it, and the
 * asset browser already reads `previewUrl` as the audio preview/cover (see
 * `getAudioPreviewCandidates`). Ownership-checked; only AUDIO generations are
 * eligible. Returns null when the row is missing, not owned, or not audio so
 * the route surfaces a not-found.
 */
export async function setAudioCoverImage(
  id: string,
  userId: string,
  coverImageUrl: string,
): Promise<Pick<GenerationRecord, 'id' | 'previewUrl'> | null> {
  const generation = await db.generation.findUnique({
    where: { id },
    select: { id: true, userId: true, outputType: true },
  })

  if (
    !generation ||
    generation.userId !== userId ||
    generation.outputType !== 'AUDIO'
  ) {
    return null
  }

  const updated = await db.generation.update({
    where: { id },
    // The cover is an external R2/image URL, so there is no paired storage key.
    data: { previewUrl: coverImageUrl, previewStorageKey: null },
    select: { id: true, previewUrl: true },
  })

  return updated
}

// ─── 审核态（切片 X · `Generation.snapshot.reviewState`）─────────────

/**
 * 一批产物**此刻的审核态**，按 id 索引。
 *
 * ── 为什么是一条裸 SQL，而不是在 select 里多带一个字段 ────────────
 * 列表口（`LIST_GENERATION_SELECT`）**故意不带 `snapshot`** —— 单行快照能到 7 MB，
 * 一页 24 条就是 30 MB+（那段头注写在上面）。而审核态住在 snapshot 里（零迁移，
 * 判据同产物名）。Prisma 的 `select` 取不出 JSON 里的一个标量，于是这里只能
 * **单独取那一格**：`snapshot->>'reviewState'` 出来的是一个短字符串，整份 JSON
 * 一个字节都没过网。
 * ⛔ 别改成「顺手把 snapshot 也 select 出来反正只有几条」：`search_assets` 一次
 * 最多 12 条，12 × 7 MB 是同一个事故的十二分之一，不是一个不同的事故。
 *
 * ⚠ 按 `userId` 收敛：这是**别人的库读不到**那道闸，不是一次性能优化。
 * ⚠ 查不到的 id 就是不在结果里（缺席 = `pending`，⛔ 不回落成任何别的值）。
 */
export async function readGenerationReviewStates(
  userId: string,
  ids: readonly string[],
): Promise<Map<string, GenerationReviewState>> {
  const states = new Map<string, GenerationReviewState>()
  if (ids.length === 0) return states

  const rows = await db.$queryRaw<
    { id: string; reviewState: string | null }[]
  >`SELECT "id", "snapshot"->>'reviewState' AS "reviewState"
      FROM "Generation"
     WHERE "userId" = ${userId} AND "id" = ANY(${[...ids]})`

  for (const row of rows) {
    const value = row.reviewState
    if (
      value &&
      (GENERATION_REVIEW_STATES as readonly string[]).includes(value)
    ) {
      states.set(row.id, value as GenerationReviewState)
    }
  }
  return states
}

/**
 * 标一张产物的审核态（切片 X）—— owner 的「禁止用失败的旧图」的落点。
 *
 * ⚠ **零迁移**：写的是 `snapshot` 里的两格（`reviewState` / `reviewReason`），
 * 判据与产物名（`withGenerationDisplayName`）逐字同源。
 * ⚠ 写法是 `snapshot || patch` 的**浅合并**，⛔ 不是读出来改完写回去：后者要把
 * 整份 7 MB 快照拉进 Node 再推回去，而且两次并发写会互相抹掉。合并发生在库里，
 * 一次 UPDATE。
 * ⚠ `jsonb_typeof = 'object'` 那道守卫是有意的：历史上有调用方往 snapshot 里塞过
 * 数组 / 标量，`||` 碰上数组会**追加一个元素**而不是合并 —— 那是在改别人的数据
 * 结构。这种行改不动，返回 `false`，⛔ 不悄悄把它重写成对象。
 * ⚠ 返回**旧值**（缺席时是 `pending`）：`set_review_state` 的 `inverse` 要它，
 * 撤销 = 写回去。
 *
 * ⛔ 这条路径不建 generation、不扣 credit、不调 provider —— 它写的是用户自己对
 * 自己产物的一句判断。
 */
export async function setGenerationReviewState(
  userId: string,
  id: string,
  state: GenerationReviewState,
  reason?: string,
): Promise<{
  id: string
  state: GenerationReviewState
  previous: GenerationReviewState
} | null> {
  /**
   * ⚠ 先问归属：下面那条读按 userId 收敛，于是「不是他的」与「是他的但没标过」
   * 读出来长得一样 —— 而前者该是 404，后者该是 `pending`。这一问只取两个标量列，
   * ⛔ 不碰 snapshot。
   */
  const owned = await db.generation.findUnique({
    where: { id },
    select: { id: true, userId: true },
  })
  if (!owned || owned.userId !== userId) return null

  const existing = await readGenerationReviewStates(userId, [id])

  const patch: Record<string, string | null> = {
    reviewState: state,
    // ⚠ 没给理由就**清掉旧理由**，⛔ 不留着上一次的：一条说着「手指糊了」的
    //    理由挂在一张刚被改成 approved 的图上，比没有理由坏得多。
    reviewReason: reason?.trim() ? reason.trim() : null,
  }

  const updated = await db.$executeRaw`
    UPDATE "Generation"
       SET "snapshot" = COALESCE("snapshot", '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb
     WHERE "id" = ${id}
       AND "userId" = ${userId}
       AND jsonb_typeof(COALESCE("snapshot", '{}'::jsonb)) = 'object'`

  if (updated === 0) return null

  return {
    id,
    state,
    previous: existing.get(id) ?? GENERATION_REVIEW_STATE_IDS.pending,
  }
}

/**
 * Count total public generations (for pagination hasMore calculation)
 * When userId is provided, counts that user's own generations.
 */
export async function countPublicGenerations(
  options: Pick<
    GalleryQueryOptions,
    | 'search'
    | 'model'
    | 'type'
    | 'timeRange'
    | 'userId'
    | 'likedByUserId'
    | 'published'
    | 'projectId'
    | 'provider'
  > = {},
): Promise<number> {
  return db.generation.count({
    where: buildGalleryWhere(options),
  })
}

/**
 * Cached variant for the **anonymous public gallery only**. Routes must call
 * this only when there is no viewer/owner/liked-by filter (i.e. the response
 * is identical for every anonymous visitor). On any user-scoped path, call
 * the un-cached `getPublicGenerationPage` directly.
 *
 * Tagged with CACHE_TAGS.galleryPublic so it invalidates when a new public
 * generation is created or visibility is toggled.
 */
type PublicGalleryCacheKey = {
  page: number
  limit: number
  cursor?: string
  search?: string
  model?: string[]
  sort: GallerySortOption
  type?: OutputTypeValue[]
  timeRange?: GalleryTimeRange
  published?: boolean
  projectId?: string
}

const fetchAnonymousPublicGalleryUncached = async (
  key: PublicGalleryCacheKey,
): Promise<GalleryGenerationPage> => {
  return getPublicGenerationPage(key)
}

const cachedAnonymousPublicGallery = cacheableFn(
  fetchAnonymousPublicGalleryUncached,
  ['gallery:public:anon:v1'],
  { tags: [CACHE_TAGS.galleryPublic], revalidate: 30 },
)

export async function getAnonymousPublicGalleryPage(
  key: PublicGalleryCacheKey,
): Promise<GalleryGenerationPage> {
  return cachedAnonymousPublicGallery(key)
}

/**
 * Count user generations by output type.
 */
export async function countUserGenerationsByType(
  userId: string,
): Promise<{ images: number; videos: number }> {
  const [images, videos] = await Promise.all([
    db.generation.count({ where: { userId, outputType: 'IMAGE' } }),
    db.generation.count({ where: { userId, outputType: 'VIDEO' } }),
  ])
  return { images, videos }
}

/**
 * Aggregate counts powering the /assets right-sidebar with one grouped
 * dimension query and one favorites count.
 *
 * `byProject` is keyed by project UUID; `unassigned` is the projectId=null
 * bucket pulled out of the same groupBy.
 */
export async function getAssetSectionCounts(
  userId: string,
  type?: OutputTypeValue[],
): Promise<AssetSectionCounts> {
  // The grid is filtered by the active type facet, so the view + folder badges
  // must be scoped to the same types or they over-count (e.g. "Favorites 3"
  // while the image grid shows 2 because one favorite is a video). byType
  // stays unscoped — it powers the type facet's own per-type counts.
  const outputTypes = outputTypesToEnums(type)
  const typeScope: { outputType?: { in: OutputType[] } } = outputTypes.length
    ? { outputType: { in: outputTypes } }
    : {}

  const [groups, favorites] = await Promise.all([
    db.generation.groupBy({
      by: ['outputType', 'projectId', 'model', 'isPublic'],
      where: { userId },
      _count: { _all: true },
    }),
    db.generation.count({
      where: { userId, likes: { some: { userId } }, ...typeScope },
    }),
  ])

  const counts: AssetSectionCounts = {
    all: 0,
    favorites,
    published: 0,
    image: 0,
    video: 0,
    audio: 0,
    model_3d: 0,
    unassigned: 0,
    byProject: {},
    byModel: {},
  }

  for (const row of groups) {
    const n = row._count._all
    if (row.outputType === 'IMAGE') counts.image += n
    else if (row.outputType === 'VIDEO') counts.video += n
    else if (row.outputType === 'AUDIO') counts.audio += n
    else if (row.outputType === 'MODEL_3D')
      counts.model_3d = (counts.model_3d ?? 0) + n

    if (outputTypes.length && !outputTypes.includes(row.outputType)) continue
    counts.all += n
    if (row.isPublic) counts.published += n
    if (row.projectId === null) counts.unassigned += n
    else
      counts.byProject[row.projectId] =
        (counts.byProject[row.projectId] ?? 0) + n
    if (row.model)
      counts.byModel[row.model] = (counts.byModel[row.model] ?? 0) + n
  }

  return counts
}

/**
 * Hard-delete a generation: remove from DB and return storage keys for R2 cleanup.
 * Returns null if not found or not owned by the user.
 */
export async function deleteGeneration(
  id: string,
  userId: string,
): Promise<{ storageKeys: string[] } | null> {
  const generation = await db.generation.findUnique({
    where: { id },
  })

  if (!generation || generation.userId !== userId) {
    return null
  }

  updatePreferenceOnDeleted(userId, generation).catch((error) => {
    logger.warn('Generation deletion preference update failed', {
      generationId: generation.id,
      userId,
      error: error instanceof Error ? error.message : String(error),
    })
  })

  await db.generation.delete({ where: { id } })

  if (generation.isPublic) {
    invalidatePublicGalleryCache()
  }

  return { storageKeys: getGenerationStorageKeys(generation) }
}

/**
 * Batch delete generations owned by the user.
 * Returns storage keys for R2 cleanup.
 */
export async function batchDeleteGenerations(
  ids: string[],
  userId: string,
): Promise<{ deletedCount: number; storageKeys: string[] }> {
  const generations = await db.generation.findMany({
    where: { id: { in: ids }, userId },
    select: {
      id: true,
      storageKey: true,
      thumbnailStorageKey: true,
      previewStorageKey: true,
      modelStorageKey: true,
    },
  })

  if (generations.length === 0) return { deletedCount: 0, storageKeys: [] }

  const ownedIds = generations.map((g) => g.id)
  await db.generation.deleteMany({ where: { id: { in: ownedIds } } })

  invalidatePublicGalleryCache()

  return {
    deletedCount: generations.length,
    storageKeys: generations.flatMap(getGenerationStorageKeys),
  }
}

/**
 * Batch update visibility for generations owned by the user.
 */
export async function batchUpdateVisibility(
  ids: string[],
  userId: string,
  field: 'isPublic' | 'isPromptPublic',
  value: boolean,
): Promise<number> {
  const result = await db.generation.updateMany({
    where: { id: { in: ids }, userId },
    data: { [field]: value },
  })
  if (field === 'isPublic' && result.count > 0) {
    invalidatePublicGalleryCache()
  }
  return result.count
}

export async function batchAssignProject(
  ids: string[],
  userId: string,
  projectId: string | null,
): Promise<number | null> {
  if (projectId !== null) {
    const project = await db.project.findFirst({
      where: { id: projectId, userId, isDeleted: false },
      select: { id: true },
    })
    if (!project) return null
  }

  const result = await db.generation.updateMany({
    where: { id: { in: ids }, userId },
    data: { projectId },
  })
  return result.count
}

// ─── Character Card Gallery Queries ──────────────────────────────

export interface CharacterCardGalleryOptions {
  page?: number
  limit?: number
  cursor?: string
}

export interface CharacterCardGenerationPage {
  generations: GenerationRecord[]
  total: number | null
  hasMore: boolean
  nextCursor: string | null
}

/**
 * Get all generations linked to a single character card (via join table).
 */
export async function getGenerationsByCharacterCard(
  characterCardId: string,
  userId: string,
  { page = 1, limit = 20, cursor }: CharacterCardGalleryOptions = {},
): Promise<CharacterCardGenerationPage> {
  const baseWhere = {
    characterCards: { some: { characterCardId } },
    userId,
  }
  const decodedCursor = decodeGalleryCursor(cursor)
  const cursorWhere = buildGalleryCursorWhere(decodedCursor, 'newest')
  const where = cursorWhere ? { AND: [baseWhere, cursorWhere] } : baseWhere

  const [results, total] = await Promise.all([
    db.generation.findMany({
      where,
      orderBy: getGalleryOrderBy('newest'),
      ...(decodedCursor ? {} : { skip: (page - 1) * limit }),
      take: limit + 1,
      select: LIST_GENERATION_SELECT,
    }),
    decodedCursor ? Promise.resolve(null) : db.generation.count({ where }),
  ])
  const hasMore = results.length > limit
  const generations = hasMore ? results.slice(0, limit) : results
  const lastGeneration = generations[generations.length - 1]
  const nextCursor =
    hasMore && lastGeneration ? encodeGalleryCursor(lastGeneration) : null

  return {
    generations: generations as GenerationRecord[],
    total,
    hasMore,
    nextCursor,
  }
}

/**
 * Get generations linked to ALL of the given character card IDs (intersection).
 * Used for "Character A + Character B" combination filtering.
 */
export async function getGenerationsByCharacterCombination(
  characterCardIds: string[],
  userId: string,
  { page = 1, limit = 20, cursor }: CharacterCardGalleryOptions = {},
): Promise<CharacterCardGenerationPage> {
  if (characterCardIds.length === 0) {
    return { generations: [], total: 0, hasMore: false, nextCursor: null }
  }

  if (characterCardIds.length === 1) {
    return getGenerationsByCharacterCard(characterCardIds[0], userId, {
      page,
      limit,
      cursor,
    })
  }

  // Find generations that have ALL specified character cards
  // by intersecting: each card must appear in the join table for that generation
  const baseWhere = {
    userId,
    AND: characterCardIds.map((cardId) => ({
      characterCards: { some: { characterCardId: cardId } },
    })),
  }
  const decodedCursor = decodeGalleryCursor(cursor)
  const cursorWhere = buildGalleryCursorWhere(decodedCursor, 'newest')
  const where = cursorWhere ? { AND: [baseWhere, cursorWhere] } : baseWhere

  const [results, total] = await Promise.all([
    db.generation.findMany({
      where,
      orderBy: getGalleryOrderBy('newest'),
      ...(decodedCursor ? {} : { skip: (page - 1) * limit }),
      take: limit + 1,
      select: LIST_GENERATION_SELECT,
    }),
    decodedCursor ? Promise.resolve(null) : db.generation.count({ where }),
  ])
  const hasMore = results.length > limit
  const generations = hasMore ? results.slice(0, limit) : results
  const lastGeneration = generations[generations.length - 1]
  const nextCursor =
    hasMore && lastGeneration ? encodeGalleryCursor(lastGeneration) : null

  return {
    generations: generations as GenerationRecord[],
    total,
    hasMore,
    nextCursor,
  }
}

// ── B5: Variant Winner Selection ──────────────────────────────────

export async function selectVariantWinner(
  userId: string,
  runGroupId: string,
  generationId: string,
): Promise<void> {
  await db.$transaction(async (tx) => {
    const target = await tx.generation.findFirst({
      where: { id: generationId, userId, runGroupId },
      select: { id: true },
    })
    if (!target) {
      throw new Error('Generation not found or not part of this run group')
    }

    await tx.generation.updateMany({
      where: { runGroupId, userId },
      data: { isWinner: false },
    })

    await tx.generation.update({
      where: { id: generationId },
      data: { isWinner: true },
    })
  })
}
