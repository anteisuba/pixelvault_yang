import 'server-only'

import { db } from '@/lib/db'

/**
 * Toggle like on a generation. Returns new state + count.
 */
export async function toggleLike(
  userId: string,
  generationId: string,
): Promise<{ liked: boolean; likeCount: number }> {
  // Verify generation exists and is public
  const generation = await db.generation.findUnique({
    where: { id: generationId },
    select: { id: true, isPublic: true },
  })

  if (!generation) {
    throw new Error('Generation not found')
  }

  if (!generation.isPublic) {
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
