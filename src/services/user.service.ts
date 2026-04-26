import 'server-only'

import { cache } from 'react'
import { randomBytes } from 'node:crypto'
import { clerkClient } from '@clerk/nextjs/server'

import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { PROFILE } from '@/constants/config'
import { fetchAsBuffer, uploadToR2, deleteFromR2 } from '@/services/storage/r2'
import type { User } from '@/lib/generated/prisma/client'
import type {
  CreatorProfileWithImages,
  UpdateProfileRequest,
  ViewerRelation,
} from '@/types'

export type { User }

// ─── Username Helpers ────────────────────────────────────────────

function isReservedUsername(username: string): boolean {
  return PROFILE.RESERVED_USERNAMES.includes(username.toLowerCase())
}

function isValidUsernameFormat(username: string): boolean {
  return (
    username.length >= PROFILE.USERNAME_MIN_LENGTH &&
    username.length <= PROFILE.USERNAME_MAX_LENGTH &&
    PROFILE.USERNAME_PATTERN.test(username)
  )
}

/**
 * Derive a username from Clerk data (username or email prefix).
 * Appends random 4-digit suffix on collision.
 */
async function deriveUsername(
  clerkUsername: string | null,
  email: string,
): Promise<string> {
  // Start with Clerk username or email prefix
  let base = (clerkUsername ?? email.split('@')[0])
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')

  // Ensure it starts with a letter
  if (!/^[a-z]/.test(base)) base = `u${base}`

  // Clamp length
  base = base.slice(0, PROFILE.USERNAME_MAX_LENGTH - 5) // leave room for suffix

  if (base.length < PROFILE.USERNAME_MIN_LENGTH) {
    base = base.padEnd(PROFILE.USERNAME_MIN_LENGTH, '0')
  }

  // Check reservation + uniqueness
  let candidate = base
  if (isReservedUsername(candidate)) {
    candidate = `${base}${Math.floor(1000 + Math.random() * 9000)}`
  }

  const existing = await db.user.findUnique({
    where: { username: candidate },
  })
  if (existing) {
    candidate = `${base}${Math.floor(1000 + Math.random() * 9000)}`
  }

  return candidate
}

// ─── Core User Functions ─────────────────────────────────────────

export async function getUserByClerkId(clerkId: string): Promise<User | null> {
  return db.user.findUnique({
    where: { clerkId },
  })
}

/**
 * Get or create a DB user for the given Clerk ID (JIT provisioning).
 * Now also syncs displayName, avatarUrl, and derives username on first visit.
 */
export const ensureUser = cache(async (clerkId: string): Promise<User> => {
  const existing = await db.user.findUnique({ where: { clerkId } })

  if (existing) {
    // If profile fields are already synced, return as-is
    if (existing.username && existing.displayName !== null) return existing

    // Sync missing fields from Clerk
    const client = await clerkClient()
    const clerkUser = await client.users.getUser(clerkId)

    const updates: Partial<
      Pick<User, 'username' | 'displayName' | 'avatarUrl'>
    > = {}

    if (!existing.username) {
      updates.username = await deriveUsername(
        clerkUser.username,
        existing.email,
      )
    }
    if (existing.displayName === null) {
      updates.displayName =
        clerkUser.fullName ?? clerkUser.firstName ?? clerkUser.username ?? null
    }
    if (!existing.avatarUrl) {
      updates.avatarUrl = clerkUser.imageUrl ?? null
    }

    if (Object.keys(updates).length > 0) {
      return db.user.update({
        where: { id: existing.id },
        data: updates,
      })
    }

    return existing
  }

  // New user — create with Clerk data
  const client = await clerkClient()
  const clerkUser = await client.users.getUser(clerkId)
  const email = clerkUser.emailAddresses[0]?.emailAddress
  if (!email) throw new Error('No email found for Clerk user')

  const username = await deriveUsername(clerkUser.username, email)

  return db.user.upsert({
    where: { clerkId },
    update: {},
    create: {
      clerkId,
      email,
      username,
      displayName:
        clerkUser.fullName ?? clerkUser.firstName ?? clerkUser.username ?? null,
      avatarUrl: clerkUser.imageUrl ?? null,
    },
  })
})

export async function createUser(params: {
  clerkId: string
  email: string
}): Promise<User> {
  return db.user.create({
    data: {
      clerkId: params.clerkId,
      email: params.email,
    },
  })
}

// ─── Profile Functions ───────────────────────────────────────────

/**
 * Validate a username for update (format + reserved + unique).
 * Returns error message or null if valid.
 */
export async function validateUsername(
  username: string,
  currentUserId: string,
): Promise<string | null> {
  if (!isValidUsernameFormat(username)) {
    return 'Username must be 3-30 characters, start with a letter, and contain only letters, numbers, and hyphens'
  }

  if (isReservedUsername(username)) {
    return 'This username is reserved'
  }

  const existing = await db.user.findUnique({
    where: { username: username.toLowerCase() },
  })

  if (existing && existing.id !== currentUserId) {
    return 'This username is already taken'
  }

  return null
}

/**
 * Update the current user's profile.
 */
export async function updateProfile(
  userId: string,
  data: UpdateProfileRequest,
): Promise<Pick<User, 'username' | 'displayName' | 'bio' | 'isPublic'>> {
  if (data.username) {
    const error = await validateUsername(data.username, userId)
    if (error) throw new Error(error)
    data.username = data.username.toLowerCase()
  }

  const updated = await db.user.update({
    where: { id: userId },
    data: {
      ...(data.username !== undefined && { username: data.username }),
      ...(data.displayName !== undefined && { displayName: data.displayName }),
      ...(data.bio !== undefined && { bio: data.bio }),
      ...(data.isPublic !== undefined && { isPublic: data.isPublic }),
    },
    select: {
      username: true,
      displayName: true,
      bio: true,
      isPublic: true,
    },
  })

  return updated as Pick<User, 'username' | 'displayName' | 'bio' | 'isPublic'>
}

// ─── Profile Image Upload ────────────────────────────────────────

function generateProfileImageKey(
  userId: string,
  type: 'avatar' | 'banner',
  mimeType: string,
): string {
  const date = new Date().toISOString().slice(0, 10)
  const random = randomBytes(8).toString('hex')
  const ext = mimeType.includes('webp')
    ? 'webp'
    : mimeType.includes('png')
      ? 'png'
      : 'jpg'
  return `profiles/${userId}/${type}/${date}_${random}.${ext}`
}

/**
 * Upload a new avatar image to R2 and update the user record.
 * Deletes the previous custom avatar if one exists.
 */
export async function uploadAvatar(
  userId: string,
  imageData: string,
): Promise<{ url: string }> {
  const { buffer, mimeType } = await fetchAsBuffer(imageData)

  if (!PROFILE.SUPPORTED_IMAGE_TYPES.includes(mimeType)) {
    throw new Error('Unsupported image type. Use JPEG, PNG, or WebP.')
  }
  if (buffer.length > PROFILE.AVATAR_MAX_SIZE_BYTES) {
    throw new Error('Avatar image must be under 5 MB')
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { avatarStorageKey: true },
  })

  // Delete old custom avatar from R2
  if (user?.avatarStorageKey) {
    await deleteFromR2(user.avatarStorageKey).catch(() => {})
  }

  const key = generateProfileImageKey(userId, 'avatar', mimeType)
  const url = await uploadToR2({ data: buffer, key, mimeType })

  await db.user.update({
    where: { id: userId },
    data: { avatarUrl: url, avatarStorageKey: key },
  })

  return { url }
}

/**
 * Upload a new banner image to R2 and update the user record.
 * Deletes the previous banner if one exists.
 */
export async function uploadBanner(
  userId: string,
  imageData: string,
): Promise<{ url: string }> {
  const { buffer, mimeType } = await fetchAsBuffer(imageData)

  if (!PROFILE.SUPPORTED_IMAGE_TYPES.includes(mimeType)) {
    throw new Error('Unsupported image type. Use JPEG, PNG, or WebP.')
  }
  if (buffer.length > PROFILE.BANNER_MAX_SIZE_BYTES) {
    throw new Error('Banner image must be under 10 MB')
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { bannerStorageKey: true },
  })

  // Delete old banner from R2
  if (user?.bannerStorageKey) {
    await deleteFromR2(user.bannerStorageKey).catch(() => {})
  }

  const key = generateProfileImageKey(userId, 'banner', mimeType)
  const url = await uploadToR2({ data: buffer, key, mimeType })

  await db.user.update({
    where: { id: userId },
    data: { bannerUrl: url, bannerStorageKey: key },
  })

  return { url }
}

/**
 * Get a public creator profile by username with paginated public generations.
 */
export async function getCreatorProfile(
  username: string,
  viewerUserId: string | null,
  page: number = 1,
  limit: number = PROFILE.POLAROID_PAGE_SIZE,
): Promise<
  | (CreatorProfileWithImages & {
      viewerRelation: ViewerRelation
      userId: string
    })
  | {
      private: true
      username: string
      displayName: string | null
      avatarUrl: string | null
    }
  | null
> {
  const user = await db.user.findUnique({
    where: { username: username.toLowerCase() },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      bannerUrl: true,
      bio: true,
      isPublic: true,
      createdAt: true,
    },
  })

  if (!user || !user.username) return null

  // Allow owner to view their own profile even if not public
  const isOwnProfile = viewerUserId === user.id
  if (!user.isPublic && !isOwnProfile) {
    return {
      private: true as const,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
    }
  }

  // Fetch counts in parallel
  const [publicImageCount, likeCount, followerCount, followingCount] =
    await Promise.all([
      db.generation.count({
        where: { userId: user.id, isPublic: true },
      }),
      db.userLike.count({
        where: {
          generation: { userId: user.id, isPublic: true },
        },
      }),
      db.userFollow.count({ where: { followingId: user.id } }),
      db.userFollow.count({ where: { followerId: user.id } }),
    ])

  // Fetch public generations with like info
  const offset = (page - 1) * limit
  const generations = await db.generation.findMany({
    where: { userId: user.id, isPublic: true },
    orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }],
    skip: offset,
    take: limit,
    include: {
      _count: { select: { likes: true } },
      ...(viewerUserId
        ? {
            likes: {
              where: { userId: viewerUserId },
              select: { id: true },
            },
          }
        : {}),
    },
  })

  // Viewer relation
  let isFollowing = false
  if (viewerUserId && !isOwnProfile) {
    const follow = await db.userFollow.findUnique({
      where: {
        followerId_followingId: {
          followerId: viewerUserId,
          followingId: user.id,
        },
      },
    })
    isFollowing = !!follow
  }

  const mappedGenerations = generations.map((g) => ({
    id: g.id,
    createdAt: g.createdAt,
    outputType: g.outputType,
    status: g.status,
    url: g.url,
    storageKey: g.storageKey,
    mimeType: g.mimeType,
    width: g.width,
    height: g.height,
    duration: g.duration,
    referenceImageUrl: g.referenceImageUrl,
    prompt: g.prompt,
    negativePrompt: g.negativePrompt,
    model: g.model,
    provider: g.provider,
    requestCount: g.requestCount,
    isPublic: g.isPublic,
    isPromptPublic: g.isPromptPublic,
    userId: g.userId,
    likeCount: g._count.likes,
    isLiked: 'likes' in g ? (g.likes as { id: string }[]).length > 0 : false,
    isFeatured: g.isFeatured,
    creator: {
      username: user.username!,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
    },
  })) as CreatorProfileWithImages['generations']

  return {
    userId: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    bannerUrl: user.bannerUrl,
    bio: user.bio,
    isPublic: user.isPublic,
    createdAt: user.createdAt,
    publicImageCount,
    likeCount,
    followerCount,
    followingCount,
    generations: mappedGenerations,
    total: publicImageCount,
    hasMore: offset + limit < publicImageCount,
    viewerRelation: {
      isFollowing,
      isOwnProfile,
    },
  }
}

/**
 * Force-sync the current user's avatar from Clerk.
 * Call after the user edits their profile in Clerk's UI.
 */
export async function refreshAvatarFromClerk(
  clerkId: string,
): Promise<User | null> {
  const user = await db.user.findUnique({ where: { clerkId } })
  if (!user) return null

  const client = await clerkClient()
  const clerkUser = await client.users.getUser(clerkId)
  const newAvatarUrl = clerkUser.imageUrl ?? null

  if (newAvatarUrl !== user.avatarUrl) {
    return db.user.update({
      where: { id: user.id },
      data: { avatarUrl: newAvatarUrl },
    })
  }

  return user
}

/**
 * Sync user profile data from a Clerk webhook event.
 */
export async function syncUserFromClerk(
  clerkId: string,
  data: {
    displayName?: string | null
    avatarUrl?: string | null
    username?: string | null
  },
): Promise<void> {
  const user = await db.user.findUnique({ where: { clerkId } })
  if (!user) return

  const updates: Record<string, unknown> = {}
  if (data.displayName !== undefined) updates.displayName = data.displayName
  if (data.avatarUrl !== undefined) updates.avatarUrl = data.avatarUrl
  if (data.username !== undefined) {
    updates.username = data.username ? data.username.toLowerCase() : null
  }

  if (Object.keys(updates).length > 0) {
    await db.user.update({ where: { id: user.id }, data: updates })
  }
}

/**
 * Mark a user as deleted after Clerk sends user.deleted.
 * Keeps generated assets and relational history intact while hiding the profile.
 */
export async function softDeleteUser(clerkId: string): Promise<void> {
  const user = await db.user.findUnique({
    where: { clerkId },
    select: { id: true },
  })

  if (!user) {
    logger.warn('softDeleteUser: user not found, skipping', { clerkId })
    return
  }

  await db.user.update({
    where: { id: user.id },
    data: { isDeleted: true, isPublic: false },
  })

  logger.info('User soft-deleted via Clerk webhook', {
    clerkId,
    userId: user.id,
  })
}
