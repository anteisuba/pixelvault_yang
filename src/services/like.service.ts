import 'server-only'

import { db } from '@/lib/db'

/**
 * Toggle like on a generation. Returns new state + count.
 */
export async function toggleLike(
  userId: string,
  generationId: string,
): Promise<{ liked: boolean; likeCount: number }> {
  // Verify generation exists; allow owner to like their own private generations
  const generation = await db.generation.findUnique({
    where: { id: generationId },
    select: { id: true, isPublic: true, userId: true },
  })

  if (!generation) {
    throw new Error('Generation not found')
  }

  if (!generation.isPublic && generation.userId !== userId) {
    throw new Error('Cannot like a private generation')
  }

  // Check existing like
  const existing = await db.userLike.findUnique({
    where: {
      userId_generationId: { userId, generationId },
    },
  })

  if (existing) {
    // Unlike
    await db.userLike.delete({ where: { id: existing.id } })
  } else {
    // Like
    await db.userLike.create({
      data: { userId, generationId },
    })
  }

  const likeCount = await db.userLike.count({
    where: { generationId },
  })

  return { liked: !existing, likeCount }
}

/**
 * Check if a user has liked specific generations.
 */
export async function getUserLikes(
  userId: string,
  generationIds: string[],
): Promise<Set<string>> {
  const likes = await db.userLike.findMany({
    where: {
      userId,
      generationId: { in: generationIds },
    },
    select: { generationId: true },
  })

  return new Set(likes.map((l) => l.generationId))
}

/**
 * Bulk add or remove likes for the current user across many generations.
 * Mirrors `batchUpdateVisibility` / `batchDeleteGenerations` — callers
 * pass the ids they've selected in the asset browser plus the desired
 * end state, and the service makes the DB match.
 *
 * Returns the number of rows actually inserted (liked=true) or removed
 * (liked=false). Generations the user can't reach (private + not owner)
 * are silently skipped so a stale selection set can't 500 the whole call.
 */
export async function batchSetLike(
  userId: string,
  generationIds: string[],
  liked: boolean,
): Promise<{ updatedCount: number }> {
  if (generationIds.length === 0) return { updatedCount: 0 }

  // Only operate on generations the user is allowed to like — their own
  // (regardless of visibility) plus anything already public. Matches the
  // permission check in toggleLike, just expressed as a set query.
  const allowed = await db.generation.findMany({
    where: {
      id: { in: generationIds },
      OR: [{ userId }, { isPublic: true }],
    },
    select: { id: true },
  })
  const allowedIds = allowed.map((g) => g.id)
  if (allowedIds.length === 0) return { updatedCount: 0 }

  if (liked) {
    // createMany + skipDuplicates because the unique constraint on
    // (userId, generationId) means already-liked rows are no-ops.
    const result = await db.userLike.createMany({
      data: allowedIds.map((generationId) => ({ userId, generationId })),
      skipDuplicates: true,
    })
    return { updatedCount: result.count }
  }

  const result = await db.userLike.deleteMany({
    where: {
      userId,
      generationId: { in: allowedIds },
    },
  })
  return { updatedCount: result.count }
}
