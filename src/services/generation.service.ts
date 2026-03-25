import 'server-only'

import { db } from '@/lib/db'
import type {
  GenerationRecord,
  GallerySortOption,
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
  isPublic?: boolean
  userId?: string
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
  /** When set, query this user's own generations (including private) */
  userId?: string
}

// ─── Helpers ──────────────────────────────────────────────────────

function outputTypeToEnum(type?: OutputTypeFilter): OutputType | undefined {
  if (type === 'image') return 'IMAGE'
  if (type === 'video') return 'VIDEO'
  return undefined
}

function buildGalleryWhere(options: {
  search?: string
  model?: string
  type?: OutputTypeFilter
  userId?: string
}) {
  const where: Record<string, unknown> = {}

  if (options.userId) {
    where.userId = options.userId
  } else {
    where.isPublic = true
  }

  if (options.search) {
    where.prompt = { contains: options.search, mode: 'insensitive' }
  }
  if (options.model) {
    where.model = options.model
  }
  const outputType = outputTypeToEnum(options.type)
  if (outputType) {
    where.outputType = outputType
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
  return db.generation.create({
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
      isPublic: input.isPublic ?? false,
      userId: input.userId,
    },
  })
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
  userId,
}: GalleryQueryOptions = {}): Promise<GenerationRecord[]> {
  return db.generation.findMany({
    where: buildGalleryWhere({ search, model, type, userId }),
    orderBy: { createdAt: sort === 'newest' ? 'desc' : 'asc' },
    skip: (page - 1) * limit,
    take: limit,
  })
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

/**
 * Toggle the isPublic flag on a generation that belongs to the given user.
 * Returns the updated record, or null if not found / not owned.
 */
export async function toggleGenerationVisibility(
  id: string,
  userId: string,
): Promise<Pick<GenerationRecord, 'id' | 'isPublic'> | null> {
  const generation = await db.generation.findUnique({
    where: { id },
    select: { id: true, userId: true, isPublic: true },
  })

  if (!generation || generation.userId !== userId) {
    return null
  }

  const updated = await db.generation.update({
    where: { id },
    data: { isPublic: !generation.isPublic },
    select: { id: true, isPublic: true },
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
    'search' | 'model' | 'type' | 'userId'
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
