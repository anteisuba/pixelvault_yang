import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockUserFindUnique = vi.hoisted(() => vi.fn())
const mockUserCreate = vi.hoisted(() => vi.fn())
const mockUserUpdate = vi.hoisted(() => vi.fn())
const mockUserUpsert = vi.hoisted(() => vi.fn())
const mockGenerationCount = vi.hoisted(() => vi.fn())
const mockGenerationFindMany = vi.hoisted(() => vi.fn())
const mockUserLikeCount = vi.hoisted(() => vi.fn())
const mockUserFollowCount = vi.hoisted(() => vi.fn())
const mockUserFollowFindUnique = vi.hoisted(() => vi.fn())
const mockClerkGetUser = vi.hoisted(() => vi.fn())
const mockFetchAsBuffer = vi.hoisted(() => vi.fn())
const mockUploadToR2 = vi.hoisted(() => vi.fn())
const mockDeleteFromR2 = vi.hoisted(() => vi.fn())
const mockLoggerWarn = vi.hoisted(() => vi.fn())
const mockLoggerInfo = vi.hoisted(() => vi.fn())

vi.mock('@/lib/db', () => ({
  db: {
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
      create: (...args: unknown[]) => mockUserCreate(...args),
      update: (...args: unknown[]) => mockUserUpdate(...args),
      upsert: (...args: unknown[]) => mockUserUpsert(...args),
    },
    generation: {
      count: (...args: unknown[]) => mockGenerationCount(...args),
      findMany: (...args: unknown[]) => mockGenerationFindMany(...args),
    },
    userLike: {
      count: (...args: unknown[]) => mockUserLikeCount(...args),
    },
    userFollow: {
      count: (...args: unknown[]) => mockUserFollowCount(...args),
      findUnique: (...args: unknown[]) => mockUserFollowFindUnique(...args),
    },
  },
}))

vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: () =>
    Promise.resolve({
      users: {
        getUser: (...args: unknown[]) => mockClerkGetUser(...args),
      },
    }),
}))

vi.mock('@/services/storage/r2', () => ({
  fetchAsBuffer: (...args: unknown[]) => mockFetchAsBuffer(...args),
  uploadToR2: (...args: unknown[]) => mockUploadToR2(...args),
  deleteFromR2: (...args: unknown[]) => mockDeleteFromR2(...args),
}))

vi.mock('@/lib/logger', () => ({
  logger: {
    info: (...args: unknown[]) => mockLoggerInfo(...args),
    warn: (...args: unknown[]) => mockLoggerWarn(...args),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

import {
  ensureUser,
  getCreatorProfile,
  getUserByClerkId,
  provisionVerifiedClerkUser,
  refreshAvatarFromClerk,
  softDeleteUser,
  updateProfile,
  uploadAvatar,
  validateUsername,
} from './user.service'

const BASE_USER = {
  id: 'user-1',
  clerkId: 'clerk-1',
  email: 'artist@example.com',
  username: 'artist',
  displayName: 'Artist',
  avatarUrl: 'https://cdn.example.com/avatar.png',
  avatarStorageKey: null,
  bannerUrl: null,
  bannerStorageKey: null,
  bio: 'Bio',
  isPublic: true,
  isDeleted: false,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
}

describe('user.service', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    delete process.env.VERCEL_ENV
    mockGenerationCount.mockResolvedValue(0)
    mockGenerationFindMany.mockResolvedValue([])
    mockUserLikeCount.mockResolvedValue(0)
    mockUserFollowCount.mockResolvedValue(0)
    mockUserFollowFindUnique.mockResolvedValue(null)
  })

  describe('getUserByClerkId', () => {
    it('returns the user matching the Clerk id', async () => {
      mockUserFindUnique.mockResolvedValue(BASE_USER)

      const result = await getUserByClerkId('clerk-1')

      expect(result).toBe(BASE_USER)
      expect(mockUserFindUnique).toHaveBeenCalledWith({
        where: { clerkId: 'clerk-1' },
      })
    })

    it('returns null when no user exists', async () => {
      mockUserFindUnique.mockResolvedValue(null)

      await expect(getUserByClerkId('missing-clerk')).resolves.toBeNull()
    })
  })

  describe('ensureUser', () => {
    it('returns an existing fully-synced user without calling Clerk', async () => {
      mockUserFindUnique.mockResolvedValue(BASE_USER)

      const result = await ensureUser('clerk-existing')

      expect(result).toBe(BASE_USER)
      expect(mockClerkGetUser).not.toHaveBeenCalled()
    })

    it('creates a new user from Clerk data when absent locally', async () => {
      const createdUser = {
        ...BASE_USER,
        id: 'user-created',
        clerkId: 'clerk-created',
        email: 'new.creator@example.com',
        username: 'newcreator',
      }
      // ensureUser: find by clerkId → null; then provision uses upsert (local/prod).
      mockUserFindUnique.mockResolvedValueOnce(null)
      mockClerkGetUser.mockResolvedValue({
        username: 'New.Creator',
        fullName: 'New Creator',
        firstName: 'New',
        imageUrl: 'https://img.example.com/new.png',
        primaryEmailAddressId: 'email-primary',
        emailAddresses: [
          {
            id: 'email-primary',
            emailAddress: 'new.creator@example.com',
            verification: { status: 'verified' },
          },
        ],
      })
      mockUserUpsert.mockResolvedValue(createdUser)

      const result = await ensureUser('clerk-created')

      expect(result).toBe(createdUser)
      expect(mockUserUpsert).toHaveBeenCalledWith({
        where: { email: 'new.creator@example.com' },
        update: { clerkId: 'clerk-created' },
        create: {
          clerkId: 'clerk-created',
          email: 'new.creator@example.com',
          displayName: 'New Creator',
          avatarUrl: 'https://img.example.com/new.png',
        },
      })
    })

    it('relinks a Production Clerk identity while preserving the existing profile and user id', async () => {
      process.env.VERCEL_ENV = 'production'
      const relinkedUser = {
        ...BASE_USER,
        clerkId: 'clerk-production-jit',
      }
      mockUserFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null)
      mockClerkGetUser.mockResolvedValue({
        username: 'DifferentClerkName',
        fullName: 'Different Clerk Name',
        firstName: 'Different',
        imageUrl: 'https://clerk.example.com/different-avatar.png',
        primaryEmailAddressId: 'email-primary',
        emailAddresses: [
          {
            id: 'email-primary',
            emailAddress: 'artist@example.com',
            verification: { status: 'verified' },
          },
        ],
      })
      mockUserUpsert.mockResolvedValue(relinkedUser)

      const result = await ensureUser('clerk-production-jit')

      expect(result).toBe(relinkedUser)
      expect(result.id).toBe(BASE_USER.id)
      expect(result.username).toBe(BASE_USER.username)
      expect(result.displayName).toBe(BASE_USER.displayName)
      expect(mockUserUpdate).not.toHaveBeenCalled()
      expect(mockUserUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { email: 'artist@example.com' },
          update: { clerkId: 'clerk-production-jit' },
        }),
      )
    })

    it('throws when Clerk has no email for a new user', async () => {
      mockUserFindUnique.mockResolvedValue(null)
      mockClerkGetUser.mockResolvedValue({
        username: 'no-email',
        fullName: null,
        firstName: null,
        imageUrl: null,
        primaryEmailAddressId: null,
        emailAddresses: [],
      })

      await expect(ensureUser('clerk-no-email')).rejects.toThrow(
        'No email found for Clerk user',
      )
    })
  })

  describe('provisionVerifiedClerkUser', () => {
    it('relinks a production Clerk user by verified email without changing the internal user id', async () => {
      process.env.VERCEL_ENV = 'production'
      const relinkedUser = {
        ...BASE_USER,
        clerkId: 'clerk-production',
      }
      mockUserFindUnique.mockResolvedValue(null)
      mockUserUpsert.mockResolvedValue(relinkedUser)

      const result = await provisionVerifiedClerkUser({
        clerkId: 'clerk-production',
        email: 'ARTIST@example.com ',
        emailVerificationStatus: 'verified',
        displayName: 'Production Name',
        avatarUrl: 'https://clerk.example.com/avatar.png',
      })

      expect(result.id).toBe(BASE_USER.id)
      expect(mockUserUpsert).toHaveBeenCalledWith({
        where: { email: 'artist@example.com' },
        update: { clerkId: 'clerk-production' },
        create: {
          clerkId: 'clerk-production',
          email: 'artist@example.com',
          displayName: 'Production Name',
          avatarUrl: 'https://clerk.example.com/avatar.png',
        },
      })
    })

    it('rejects an unverified email before touching the database', async () => {
      await expect(
        provisionVerifiedClerkUser({
          clerkId: 'clerk-unverified',
          email: 'artist@example.com',
          emailVerificationStatus: 'unverified',
        }),
      ).rejects.toThrow('verified primary email')

      expect(mockUserFindUnique).not.toHaveBeenCalled()
      expect(mockUserUpsert).not.toHaveBeenCalled()
      expect(mockUserCreate).not.toHaveBeenCalled()
    })

    it('is idempotent when the Clerk id is already linked', async () => {
      const alreadyLinked = {
        ...BASE_USER,
        clerkId: 'clerk-production',
      }
      mockUserFindUnique.mockResolvedValue(alreadyLinked)

      const result = await provisionVerifiedClerkUser({
        clerkId: 'clerk-production',
        email: 'artist@example.com',
        emailVerificationStatus: 'verified',
        displayName: 'Different Clerk Name',
        avatarUrl: 'https://clerk.example.com/different-avatar.png',
      })

      expect(result).toBe(alreadyLinked)
      expect(mockUserUpdate).not.toHaveBeenCalled()
      expect(mockUserUpsert).not.toHaveBeenCalled()
      expect(mockUserCreate).not.toHaveBeenCalled()
    })

    it('does not let Preview relink an existing production email', async () => {
      process.env.VERCEL_ENV = 'preview'
      mockUserFindUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(BASE_USER)

      await expect(
        provisionVerifiedClerkUser({
          clerkId: 'clerk-preview',
          email: 'artist@example.com',
          emailVerificationStatus: 'verified',
        }),
      ).rejects.toThrow(/only allowed in Production/)

      expect(mockUserUpdate).not.toHaveBeenCalled()
      expect(mockUserUpsert).not.toHaveBeenCalled()
      expect(mockUserCreate).not.toHaveBeenCalled()
    })

    it('lets local dev (no VERCEL_ENV) relink a verified email to a new Clerk id', async () => {
      // beforeEach already clears VERCEL_ENV — Clerk development keys re-issue IDs.
      delete process.env.VERCEL_ENV
      const relinkedUser = {
        ...BASE_USER,
        clerkId: 'clerk-local-dev',
      }
      mockUserFindUnique.mockResolvedValue(null)
      mockUserUpsert.mockResolvedValue(relinkedUser)

      const result = await provisionVerifiedClerkUser({
        clerkId: 'clerk-local-dev',
        email: 'artist@example.com',
        emailVerificationStatus: 'verified',
      })

      expect(result.clerkId).toBe('clerk-local-dev')
      expect(mockUserUpsert).toHaveBeenCalledWith({
        where: { email: 'artist@example.com' },
        update: { clerkId: 'clerk-local-dev' },
        create: {
          clerkId: 'clerk-local-dev',
          email: 'artist@example.com',
        },
      })
      expect(mockUserCreate).not.toHaveBeenCalled()
    })

    it('upserts a new local user when the verified email is not already mapped', async () => {
      const createdUser = {
        ...BASE_USER,
        id: 'user-new',
        clerkId: 'clerk-new',
        email: 'new@example.com',
      }
      mockUserFindUnique.mockResolvedValueOnce(null)
      mockUserUpsert.mockResolvedValue(createdUser)

      const result = await provisionVerifiedClerkUser({
        clerkId: 'clerk-new',
        email: 'new@example.com',
        emailVerificationStatus: 'verified',
      })

      expect(result).toBe(createdUser)
      expect(mockUserUpsert).toHaveBeenCalledWith({
        where: { email: 'new@example.com' },
        update: { clerkId: 'clerk-new' },
        create: {
          clerkId: 'clerk-new',
          email: 'new@example.com',
        },
      })
    })
  })

  describe('validateUsername', () => {
    it('rejects invalid username format before querying the database', async () => {
      const result = await validateUsername('1bad', 'user-1')

      expect(result).toMatch(/Username must be/)
      expect(mockUserFindUnique).not.toHaveBeenCalled()
    })

    it('rejects a username owned by another user', async () => {
      mockUserFindUnique.mockResolvedValue({ id: 'other-user' })

      const result = await validateUsername('taken-name', 'user-1')

      expect(result).toBe('This username is already taken')
    })

    it('allows the current user to keep their username', async () => {
      mockUserFindUnique.mockResolvedValue({ id: 'user-1' })

      await expect(validateUsername('artist', 'user-1')).resolves.toBeNull()
    })
  })

  describe('updateProfile', () => {
    it('validates, normalizes, and updates profile fields', async () => {
      const updated = {
        username: 'newname',
        displayName: 'New Name',
        bio: 'Updated bio',
        isPublic: false,
      }
      mockUserFindUnique.mockResolvedValue(null)
      mockUserUpdate.mockResolvedValue(updated)

      const result = await updateProfile('user-1', {
        username: 'NewName',
        displayName: 'New Name',
        bio: 'Updated bio',
        isPublic: false,
      })

      expect(result).toEqual(updated)
      expect(mockUserUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: {
            username: 'newname',
            displayName: 'New Name',
            bio: 'Updated bio',
            isPublic: false,
          },
        }),
      )
    })

    it('throws when username validation fails', async () => {
      await expect(
        updateProfile('user-1', { username: 'admin' }),
      ).rejects.toThrow('This username is reserved')
      expect(mockUserUpdate).not.toHaveBeenCalled()
    })
  })

  describe('uploadAvatar', () => {
    it('rejects unsupported image mime types before writing storage', async () => {
      mockFetchAsBuffer.mockResolvedValue({
        buffer: Buffer.from('not-an-image'),
        mimeType: 'image/gif',
      })

      await expect(
        uploadAvatar('user-1', 'data:image/gif;base64,x'),
      ).rejects.toThrow('Unsupported image type. Use JPEG, PNG, or WebP.')
      expect(mockUploadToR2).not.toHaveBeenCalled()
      expect(mockUserUpdate).not.toHaveBeenCalled()
    })
  })

  describe('getCreatorProfile', () => {
    it('returns a private profile shell when viewer is not the owner', async () => {
      mockUserFindUnique.mockResolvedValue({
        ...BASE_USER,
        isPublic: false,
      })

      const result = await getCreatorProfile('Artist', 'viewer-1')

      expect(result).toEqual({
        private: true,
        username: 'artist',
        displayName: 'Artist',
        avatarUrl: 'https://cdn.example.com/avatar.png',
      })
      expect(mockGenerationFindMany).not.toHaveBeenCalled()
    })

    it('maps public generations and viewer follow relation', async () => {
      mockUserFindUnique.mockResolvedValue(BASE_USER)
      mockGenerationCount.mockResolvedValue(1)
      mockUserLikeCount.mockResolvedValue(3)
      mockUserFollowCount.mockResolvedValueOnce(4).mockResolvedValueOnce(2)
      mockUserFollowFindUnique.mockResolvedValue({ id: 'follow-1' })
      mockGenerationFindMany.mockResolvedValue([
        {
          id: 'gen-1',
          createdAt: new Date('2026-02-01T00:00:00.000Z'),
          outputType: 'IMAGE',
          status: 'COMPLETED',
          url: 'https://cdn.example.com/gen.png',
          storageKey: 'generations/gen.png',
          mimeType: 'image/png',
          width: 1024,
          height: 1024,
          duration: null,
          referenceImageUrl: null,
          prompt: 'prompt',
          negativePrompt: null,
          model: 'sdxl',
          provider: 'huggingface',
          requestCount: 1,
          isPublic: true,
          isPromptPublic: false,
          userId: 'user-1',
          isFeatured: false,
          _count: { likes: 7 },
          likes: [{ id: 'like-1' }],
        },
      ])

      const result = await getCreatorProfile('Artist', 'viewer-1', 1, 15)

      expect(result).toMatchObject({
        userId: 'user-1',
        username: 'artist',
        publicImageCount: 1,
        likeCount: 3,
        followerCount: 4,
        followingCount: 2,
        hasMore: false,
        nextCursor: null,
        viewerRelation: {
          isFollowing: true,
          isOwnProfile: false,
        },
      })
      expect(
        result && 'generations' in result && result.generations[0],
      ).toMatchObject({
        id: 'gen-1',
        likeCount: 7,
        isLiked: true,
        creator: {
          username: 'artist',
          displayName: 'Artist',
        },
      })
    })

    it('uses cursor predicates for creator profile load-more queries', async () => {
      const cursor = Buffer.from(
        JSON.stringify({
          id: 'gen-cursor',
          createdAt: '2026-02-02T00:00:00.000Z',
          isFeatured: true,
        }),
      ).toString('base64url')
      mockUserFindUnique.mockResolvedValue(BASE_USER)
      mockGenerationCount.mockResolvedValue(2)
      mockUserLikeCount.mockResolvedValue(3)
      mockUserFollowCount.mockResolvedValueOnce(4).mockResolvedValueOnce(2)
      mockUserFollowFindUnique.mockResolvedValue(null)
      mockGenerationFindMany.mockResolvedValue([
        {
          id: 'gen-2',
          createdAt: new Date('2026-02-01T00:00:00.000Z'),
          outputType: 'IMAGE',
          status: 'COMPLETED',
          url: 'https://cdn.example.com/gen-2.png',
          storageKey: 'generations/gen-2.png',
          mimeType: 'image/png',
          thumbnailUrl: 'https://cdn.example.com/gen-2.thumbnail.webp',
          thumbnailStorageKey: 'generations/gen-2.thumbnail.webp',
          previewUrl: 'https://cdn.example.com/gen-2.preview.webp',
          previewStorageKey: 'generations/gen-2.preview.webp',
          width: 1024,
          height: 1024,
          duration: null,
          referenceImageUrl: null,
          prompt: 'prompt',
          negativePrompt: null,
          model: 'sdxl',
          provider: 'huggingface',
          requestCount: 1,
          isPublic: true,
          isPromptPublic: true,
          userId: 'user-1',
          isFeatured: false,
          _count: { likes: 0 },
          likes: [],
        },
        {
          id: 'gen-3',
          createdAt: new Date('2026-01-31T00:00:00.000Z'),
          outputType: 'IMAGE',
          status: 'COMPLETED',
          url: 'https://cdn.example.com/gen-3.png',
          storageKey: 'generations/gen-3.png',
          mimeType: 'image/png',
          width: 1024,
          height: 1024,
          duration: null,
          referenceImageUrl: null,
          prompt: 'prompt 3',
          negativePrompt: null,
          model: 'sdxl',
          provider: 'huggingface',
          requestCount: 1,
          isPublic: true,
          isPromptPublic: true,
          userId: 'user-1',
          isFeatured: false,
          _count: { likes: 0 },
          likes: [],
        },
      ])

      const result = await getCreatorProfile('Artist', 'viewer-1', 3, 1, cursor)

      expect(mockGenerationFindMany).toHaveBeenCalledWith(
        expect.not.objectContaining({ skip: expect.any(Number) }),
      )
      expect(mockGenerationFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [
            { isFeatured: 'desc' },
            { createdAt: 'desc' },
            { id: 'desc' },
          ],
          take: 2,
        }),
      )
      expect(
        result && 'generations' in result && result.generations,
      ).toHaveLength(1)
      const nextCursor =
        result && 'nextCursor' in result ? result.nextCursor : null
      const decodedNextCursor = JSON.parse(
        Buffer.from(nextCursor ?? '', 'base64url').toString('utf8'),
      ) as unknown
      expect(decodedNextCursor).toEqual({
        id: 'gen-2',
        createdAt: '2026-02-01T00:00:00.000Z',
        isFeatured: false,
      })
      expect(
        result && 'generations' in result && result.generations[0],
      ).toMatchObject({
        thumbnailUrl: 'https://cdn.example.com/gen-2.thumbnail.webp',
        previewUrl: 'https://cdn.example.com/gen-2.preview.webp',
      })
    })
  })

  describe('refreshAvatarFromClerk', () => {
    it('updates the avatar when Clerk has a newer image URL', async () => {
      const updated = {
        ...BASE_USER,
        avatarUrl: 'https://img.example.com/latest.png',
      }
      mockUserFindUnique.mockResolvedValue(BASE_USER)
      mockClerkGetUser.mockResolvedValue({
        imageUrl: 'https://img.example.com/latest.png',
      })
      mockUserUpdate.mockResolvedValue(updated)

      const result = await refreshAvatarFromClerk('clerk-1')

      expect(result).toBe(updated)
      expect(mockUserUpdate).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { avatarUrl: 'https://img.example.com/latest.png' },
      })
    })
  })

  describe('softDeleteUser', () => {
    it('marks an existing user as deleted and private', async () => {
      mockUserFindUnique.mockResolvedValue({ id: 'user-1' })
      mockUserUpdate.mockResolvedValue({
        ...BASE_USER,
        isDeleted: true,
        isPublic: false,
      })

      await softDeleteUser('clerk-1')

      expect(mockUserUpdate).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { isDeleted: true, isPublic: false },
      })
      expect(mockLoggerInfo).toHaveBeenCalledWith(
        'User soft-deleted via Clerk webhook',
        { clerkId: 'clerk-1', userId: 'user-1' },
      )
    })

    it('logs and skips when the user is missing', async () => {
      mockUserFindUnique.mockResolvedValue(null)

      await softDeleteUser('missing-clerk')

      expect(mockUserUpdate).not.toHaveBeenCalled()
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        'softDeleteUser: user not found, skipping',
        { clerkId: 'missing-clerk' },
      )
    })
  })
})
