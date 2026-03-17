import 'server-only'

import { db } from '@/lib/db'
import type { GenerationRecord, OutputType } from '@/types'
import { PAGINATION } from '@/constants/config'

// ─── Input Types ──────────────────────────────────────────────────

export interface CreateGenerationInput {
  url: string
  storageKey: string
  mimeType: string
  width: number
  height: number
  duration?: number
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
      prompt: input.prompt,
      negativePrompt: input.negativePrompt,
      model: input.model,
      provider: input.provider,
      requestCount: input.requestCount,
      outputType: input.outputType ?? 'IMAGE',
      isPublic: input.isPublic ?? true,
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
 * Get public generations for the gallery, newest first.
 */
export async function getPublicGenerations({
  page = PAGINATION.DEFAULT_PAGE,
  limit = PAGINATION.DEFAULT_LIMIT,
}: ListGenerationsOptions = {}): Promise<GenerationRecord[]> {
  return db.generation.findMany({
    where: { isPublic: true },
    orderBy: { createdAt: 'desc' },
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
 */
export async function countPublicGenerations(): Promise<number> {
  return db.generation.count({
    where: { isPublic: true },
  })
}
