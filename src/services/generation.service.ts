import 'server-only'

import { db } from '@/lib/db'
import type { Prisma } from '@/lib/generated/prisma/client'
import { logger } from '@/lib/logger'
import {
  CACHE_TAGS,
  cacheableFn,
  invalidatePublicGalleryCache,
} from '@/lib/cache-tags'
import { normalizeReferenceImages } from '@/lib/reference-image-compat'
import type {
  AssetSectionCounts,
  GenerationRecord,
  GallerySortOption,
  GalleryTimeRange,
  OutputType,
  OutputTypeFilter,
} from '@/types'
import { PAGINATION } from '@/constants/config'
import { updatePreferenceOnDeleted } from '@/services/user-preference.service'

// ─── Input Types ──────────────────────────────────────────────────

type GenerationMutationClient = Pick<
  typeof db,
  'generation' | 'generationCharacterCard'
>

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
  /** B0: Seed for reproducibility */
  seed?: bigint
  /** B0: Run group ID for compare/variant */
  runGroupId?: string
  /** B0: Run group type */
  runGroupType?: string
  /** B0: Position within run group */
  runGroupIndex?: number
}

export interface ListGenerationsOptions {
  page?: number
  limit?: number
}

export interface GalleryQueryOptions {
  page?: number
  limit?: number
  search?: string
  model?: string
  sort?: GallerySortOption
  type?: OutputTypeFilter
  timeRange?: GalleryTimeRange
  /** When set, query this user's own generations (including private) */
  userId?: string
  /** When set, only return generations liked by this user */
  likedByUserId?: string
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

// ─── Helpers ──────────────────────────────────────────────────────

/**
 * Fields included in list-style queries. Deliberately excludes the
 * heavy JSON columns (`snapshot`, `recipeSnapshot`, `evaluation`) — a
 * single generation row can be 7 MB when the user uploaded base64
 * dataURL reference images, so a 24-item page balloons to 30 MB+.
 * Detail-style queries (`getGenerationById`, studio remix) still load
 * the full row.
 */
const LIST_GENERATION_SELECT = {
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
} as const satisfies Prisma.GenerationSelect

function outputTypeToEnum(type?: OutputTypeFilter): OutputType | undefined {
  if (type === 'image') return 'IMAGE'
  if (type === 'video') return 'VIDEO'
  if (type === 'audio') return 'AUDIO'
  if (type === 'model_3d') return 'MODEL_3D'
  return undefined
}

/** Redact prompt fields for generations where isPromptPublic is false. */
function redactPrompts(generations: GenerationRecord[]): GenerationRecord[] {
  return generations.map((g) =>
    g.isPromptPublic ? g : { ...g, prompt: '', negativePrompt: null },
  )
}

function buildGalleryWhere(options: {
  search?: string
  model?: string
  type?: OutputTypeFilter
  timeRange?: GalleryTimeRange
  userId?: string
  likedByUserId?: string
  projectId?: string
  provider?: string
}) {
  const where: Record<string, unknown> = {}

  if (options.userId) {
    where.userId = options.userId
  } else {
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
  if (options.model) {
    where.model = options.model
  }
  if (options.provider) {
    where.provider = options.provider
  }
  const outputType = outputTypeToEnum(options.type)
  if (outputType) {
    where.outputType = outputType
  }

  // Time range filter
  if (options.timeRange === 'today') {
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    where.createdAt = { gte: startOfDay }
  } else if (options.timeRange === 'week') {
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)
    weekAgo.setHours(0, 0, 0, 0)
    where.createdAt = { gte: weekAgo }
  }

  // Liked-by filter
  if (options.likedByUserId) {
    where.likes = { some: { userId: options.likedByUserId } }
  }

  return where
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
 * Persist a completed generation to the database.
 * Called after the AI provider returns a result and R2 upload completes.
 */
export async function createGeneration(
  input: CreateGenerationInput,
  client: GenerationMutationClient = db,
): Promise<GenerationRecord> {
  const generation = await client.generation.create({
    data: {
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
      snapshot: input.snapshot,
      seed: input.seed,
      runGroupId: input.runGroupId,
      runGroupType: input.runGroupType ?? 'single',
      runGroupIndex: input.runGroupIndex ?? 0,
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

/**
 * Get public generations for the gallery with optional search/filter.
 * When userId is provided, returns that user's own generations (including private).
 */
export async function getPublicGenerations({
  page = PAGINATION.DEFAULT_PAGE,
  limit = PAGINATION.DEFAULT_LIMIT,
  search,
  model,
  sort = 'newest',
  type,
  timeRange,
  userId,
  likedByUserId,
  viewerUserId,
  projectId,
  provider,
}: GalleryQueryOptions = {}): Promise<GenerationRecord[]> {
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

  const results = await db.generation.findMany({
    where: buildGalleryWhere({
      search,
      model,
      type,
      timeRange,
      userId,
      likedByUserId,
      projectId,
      provider,
    }),
    orderBy: { createdAt: sort === 'newest' ? 'desc' : 'asc' },
    skip: (page - 1) * limit,
    take: limit,
    select,
  })

  // Map creator info + like data onto records
  const mapped: GenerationRecord[] = results.map((r) => {
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
  // through getGenerationById which keeps the full row.
  return userId ? mapped : redactPrompts(mapped)
}

/**
 * Get a single generation by its ID.
 */
export async function getGenerationById(
  id: string,
): Promise<GenerationRecord | null> {
  const generation = await db.generation.findUnique({
    where: { id },
  })

  return generation ? normalizeGenerationReferenceImages(generation) : null
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

  // Enforce featured limit when turning ON
  if (field === 'isFeatured' && !generation.isFeatured) {
    const featuredCount = await db.generation.count({
      where: { userId, isFeatured: true },
    })
    if (featuredCount >= MAX_FEATURED_PER_USER) {
      return { error: `MAX_FEATURED_EXCEEDED` }
    }
  }

  const updated = await db.generation.update({
    where: { id },
    data: { [field]: !generation[field] },
    select: {
      id: true,
      isPublic: true,
      isPromptPublic: true,
      isFeatured: true,
    },
  })

  if (field === 'isPublic') {
    invalidatePublicGalleryCache()
  }

  return updated
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
 * the un-cached `getPublicGenerations` / `countPublicGenerations` directly.
 *
 * Tagged with CACHE_TAGS.galleryPublic so it invalidates when a new public
 * generation is created or visibility is toggled.
 */
type PublicGalleryCacheKey = {
  page: number
  limit: number
  search?: string
  model?: string
  sort: GallerySortOption
  type?: OutputTypeFilter
  timeRange?: GalleryTimeRange
  projectId?: string
}

const fetchAnonymousPublicGalleryUncached = async (
  key: PublicGalleryCacheKey,
): Promise<{ generations: GenerationRecord[]; total: number }> => {
  const [generations, total] = await Promise.all([
    getPublicGenerations(key),
    countPublicGenerations({
      search: key.search,
      model: key.model,
      type: key.type,
      timeRange: key.timeRange,
      projectId: key.projectId,
    }),
  ])
  return { generations, total }
}

const cachedAnonymousPublicGallery = cacheableFn(
  fetchAnonymousPublicGalleryUncached,
  ['gallery:public:anon:v1'],
  { tags: [CACHE_TAGS.galleryPublic], revalidate: 30 },
)

export async function getAnonymousPublicGalleryPage(
  key: PublicGalleryCacheKey,
): Promise<{ generations: GenerationRecord[]; total: number }> {
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
 * Aggregate counts powering the /assets right-sidebar. One round-trip per
 * dimension (type, project, favorites) instead of one count per sidebar
 * item — keeps the sidebar honest at any scale.
 *
 * `byProject` is keyed by project UUID; `unassigned` is the projectId=null
 * bucket pulled out of the same groupBy.
 */
export async function getAssetSectionCounts(
  userId: string,
): Promise<AssetSectionCounts> {
  const [byType, byProject, favorites] = await Promise.all([
    db.generation.groupBy({
      by: ['outputType'],
      where: { userId },
      _count: { _all: true },
    }),
    db.generation.groupBy({
      by: ['projectId'],
      where: { userId },
      _count: { _all: true },
    }),
    db.generation.count({
      where: { userId, likes: { some: { userId } } },
    }),
  ])

  const counts: AssetSectionCounts = {
    all: 0,
    favorites,
    image: 0,
    video: 0,
    audio: 0,
    model_3d: 0,
    unassigned: 0,
    byProject: {},
  }

  for (const row of byType) {
    const n = row._count._all
    counts.all += n
    if (row.outputType === 'IMAGE') counts.image = n
    else if (row.outputType === 'VIDEO') counts.video = n
    else if (row.outputType === 'AUDIO') counts.audio = n
    else if (row.outputType === 'MODEL_3D') counts.model_3d = n
  }

  for (const row of byProject) {
    const n = row._count._all
    if (row.projectId === null) counts.unassigned = n
    else counts.byProject[row.projectId] = n
  }

  return counts
}

/**
 * Hard-delete a generation: remove from DB and return storageKey for R2 cleanup.
 * Returns null if not found or not owned by the user.
 */
export async function deleteGeneration(
  id: string,
  userId: string,
): Promise<{ storageKey: string } | null> {
  const generation = await db.generation.findUnique({
    where: { id },
  })

  if (!generation || generation.userId !== userId) {
    return null
  }

  try {
    await updatePreferenceOnDeleted(userId, generation)
  } catch (error) {
    logger.warn('Generation deletion preference update failed', {
      generationId: generation.id,
      userId,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  await db.generation.delete({ where: { id } })

  if (generation.isPublic) {
    invalidatePublicGalleryCache()
  }

  return { storageKey: generation.storageKey }
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
    select: { id: true, storageKey: true },
  })

  if (generations.length === 0) return { deletedCount: 0, storageKeys: [] }

  const ownedIds = generations.map((g) => g.id)
  await db.generation.deleteMany({ where: { id: { in: ownedIds } } })

  invalidatePublicGalleryCache()

  return {
    deletedCount: generations.length,
    storageKeys: generations.map((g) => g.storageKey),
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

// ─── Character Card Gallery Queries ──────────────────────────────

export interface CharacterCardGalleryOptions {
  page?: number
  limit?: number
}

/**
 * Get all generations linked to a single character card (via join table).
 */
export async function getGenerationsByCharacterCard(
  characterCardId: string,
  userId: string,
  { page = 1, limit = 20 }: CharacterCardGalleryOptions = {},
): Promise<{ generations: GenerationRecord[]; total: number }> {
  const where = {
    characterCards: { some: { characterCardId } },
    userId,
  }

  const [generations, total] = await Promise.all([
    db.generation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: LIST_GENERATION_SELECT,
    }),
    db.generation.count({ where }),
  ])

  return {
    generations: generations as GenerationRecord[],
    total,
  }
}

/**
 * Get generations linked to ALL of the given character card IDs (intersection).
 * Used for "Character A + Character B" combination filtering.
 */
export async function getGenerationsByCharacterCombination(
  characterCardIds: string[],
  userId: string,
  { page = 1, limit = 20 }: CharacterCardGalleryOptions = {},
): Promise<{ generations: GenerationRecord[]; total: number }> {
  if (characterCardIds.length === 0) {
    return { generations: [], total: 0 }
  }

  if (characterCardIds.length === 1) {
    return getGenerationsByCharacterCard(characterCardIds[0], userId, {
      page,
      limit,
    })
  }

  // Find generations that have ALL specified character cards
  // by intersecting: each card must appear in the join table for that generation
  const where = {
    userId,
    AND: characterCardIds.map((cardId) => ({
      characterCards: { some: { characterCardId: cardId } },
    })),
  }

  const [generations, total] = await Promise.all([
    db.generation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: LIST_GENERATION_SELECT,
    }),
    db.generation.count({ where }),
  ])

  return {
    generations: generations as GenerationRecord[],
    total,
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
