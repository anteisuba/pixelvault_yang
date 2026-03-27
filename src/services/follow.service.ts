import 'server-only'

import { db } from '@/lib/db'

/**
 * Toggle follow on a user. Returns new state + follower count.
 */
export async function toggleFollow(
  followerId: string,
  followingId: string,
): Promise<{ following: boolean; followerCount: number }> {
  if (followerId === followingId) {
    throw new Error('Cannot follow yourself')
  }

  // Verify target user exists
  const targetUser = await db.user.findUnique({
    where: { id: followingId },
    select: { id: true, isPublic: true },
  })

  if (!targetUser) {
    throw new Error('User not found')
  }

  // Check existing follow
  const existing = await db.userFollow.findUnique({
    where: {
      followerId_followingId: { followerId, followingId },
    },
  })

  if (existing) {
    // Unfollow
    await db.userFollow.delete({ where: { id: existing.id } })
  } else {
    // Follow
    await db.userFollow.create({
      data: { followerId, followingId },
    })
  }

  const followerCount = await db.userFollow.count({
    where: { followingId },
  })

  return { following: !existing, followerCount }
}
