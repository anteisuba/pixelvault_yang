import 'server-only'

import { db } from '@/lib/db'
import type { Prisma } from '@/lib/generated/prisma/client'
import type {
  GenerationRecord,
  GallerySortOption,
  GalleryTimeRange,
  OutputType,
  OutputTypeFilter,
} from '@/types'
import { PAGINATION } from '@/constants/config'

// ─── Input Types ──────────────────────────────────────────────────

export interface CreateGenerationInput {
  url: string
  storageKey: string
  mimeType: string
  width: number
  height: number
  duration?: number
  referenceImageUrl?: string
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
}

// ─── Helpers ──────────────────────────────────────────────────────

function outputTypeToEnum(type?: OutputTypeFilter): OutputType | undefined {
  if (type === 'image') return 'IMAGE'
  if (type === 'video') return 'VIDEO'
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
}) {
  const where: Record<string, unknown> = {}

  if (options.userId) {
    where.userId = options.userId
  } else {
    where.isPublic = true
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

// ─── Service Functions ────────────────────────────────────────────

/**
 * Persist a completed generation to the database.
 * Called after the AI provider returns a result and R2 upload completes.
 */
export async function createGeneration(
  input: CreateGenerationInput,
): Promise<GenerationRecord> {
  const generation = await db.generation.create({
    data: {
      url: input.url,
      storageKey: input.storageKey,
      mimeType: input.mimeType,
      width: input.width,
      height: input.height,
      duration: input.duration,
      referenceImageUrl: input.referenceImageUrl,
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
    await db.generationCharacterCard.createMany({
      data: input.characterCardIds.map((cardId) => ({
        generationId: generation.id,
        characterCardId: cardId,
      })),
    })
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
  return db.generation.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * limit,
    take: limit,
  })
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
}: GalleryQueryOptions = {}): Promise<GenerationRecord[]> {
  const results = await db.generation.findMany({
    where: buildGalleryWhere({
      search,
      model,
      type,
      timeRange,
      userId,
      likedByUserId,
    }),
    orderBy: { createdAt: sort === 'newest' ? 'desc' : 'asc' },
    skip: (page - 1) * limit,
    take: limit,
    include: {
      user: {
        select: {
          username: true,
          displayName: true,
          avatarUrl: true,
        },
      },
      _count: { select: { likes: true } },
      ...(viewerUserId
        ? { likes: { where: { userId: viewerUserId }, take: 1 } }
        : {}),
    },
  })

  // Map creator info + like data onto records
  const mapped = results.map((r) => {
    const { user, _count, likes, ...rest } = r as typeof r & {
      _count: { likes: number }
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
      likeCount: _count.likes,
      isLiked: viewerUserId ? (likes?.length ?? 0) > 0 : undefined,
    }
  })

  // Owner sees full data; public viewers get redacted prompts
  return userId ? mapped : redactPrompts(mapped)
}

/**
 * Get a single generation by its ID.
 */
export async function getGenerationById(
  id: string,
): Promise<GenerationRecord | null> {
  return db.generation.findUnique({
    where: { id },
  })
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

  return updated
}

/**
 * Count total public generations (for pagination hasMore calculation)
 * When userId is provided, counts that user's own generations.
 */
export async function countPublicGenerations(
  options: Pick<
    GalleryQueryOptions,
    'search' | 'model' | 'type' | 'timeRange' | 'userId' | 'likedByUserId'
  > = {},
): Promise<number> {
  return db.generation.count({
    where: buildGalleryWhere(options),
  })
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
 * Hard-delete a generation: remove from DB and return storageKey for R2 cleanup.
 * Returns null if not found or not owned by the user.
 */
export async function deleteGeneration(
  id: string,
  userId: string,
): Promise<{ storageKey: string } | null> {
  const generation = await db.generation.findUnique({
    where: { id },
    select: { id: true, userId: true, storageKey: true },
  })

  if (!generation || generation.userId !== userId) {
    return null
  }

  await db.generation.delete({ where: { id } })

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
    }),
    db.generation.count({ where }),
  ])

  return { generations, total }
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
    }),
    db.generation.count({ where }),
  ])

  return { generations, total }
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
