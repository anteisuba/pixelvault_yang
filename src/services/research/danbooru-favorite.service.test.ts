import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockEnsureUser = vi.fn()
vi.mock('@/services/user.service', () => ({
  ensureUser: (...args: unknown[]) => mockEnsureUser(...args),
}))

const mockCount = vi.fn()
const mockCreate = vi.fn()
const mockFindMany = vi.fn()
const mockFindUnique = vi.fn()
const mockDeleteMany = vi.fn()
vi.mock('@/lib/db', () => ({
  db: {
    danbooruFavorite: {
      count: (...args: unknown[]) => mockCount(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
    },
  },
}))

import { DANBOORU_REQUEST } from '@/constants/research'
import {
  addDanbooruFavorite,
  DanbooruFavoriteLimitError,
  listDanbooruFavorites,
  removeDanbooruFavorite,
} from '@/services/research/danbooru-favorite.service'

const USER = { id: 'db_user_1', clerkId: 'clerk_1' }
const NOW = new Date('2026-09-28T12:00:00.000Z')
const INPUT = {
  kind: 'character' as const,
  name: 'fate_testarossa',
  count: 10000,
  work: 'lyrical_nanoha',
  previews: ['https://cdn.donmai.us/p.jpg'],
}

beforeEach(() => {
  vi.clearAllMocks()
  mockEnsureUser.mockResolvedValue(USER)
})

describe('addDanbooruFavorite', () => {
  it('stores the row snapshot under the signed-in user', async () => {
    mockFindUnique.mockResolvedValue(null)
    mockCount.mockResolvedValue(0)
    mockCreate.mockImplementation(async ({ data }) => ({
      id: 'fav_1',
      createdAt: NOW,
      ...data,
    }))
    const favorite = await addDanbooruFavorite(USER.clerkId, INPUT)
    expect(mockCreate).toHaveBeenCalledWith({
      data: { userId: USER.id, ...INPUT },
    })
    expect(favorite).toEqual({
      id: 'fav_1',
      ...INPUT,
      createdAt: NOW.toISOString(),
    })
  })

  it('returns the existing favorite instead of adding it twice', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'fav_1',
      userId: USER.id,
      createdAt: NOW,
      ...INPUT,
    })
    const favorite = await addDanbooruFavorite(USER.clerkId, INPUT)
    expect(favorite.id).toBe('fav_1')
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('refuses once a page is full', async () => {
    mockFindUnique.mockResolvedValue(null)
    mockCount.mockResolvedValue(DANBOORU_REQUEST.favoriteLimitPerKind)
    await expect(addDanbooruFavorite(USER.clerkId, INPUT)).rejects.toThrow(
      DanbooruFavoriteLimitError,
    )
    expect(mockCreate).not.toHaveBeenCalled()
  })
})

describe('listDanbooruFavorites', () => {
  it('lists newest first and drops rows with an unknown kind', async () => {
    mockFindMany.mockResolvedValue([
      { id: 'fav_2', createdAt: NOW, ...INPUT },
      { id: 'fav_3', createdAt: NOW, ...INPUT, kind: 'meta' },
    ])
    const favorites = await listDanbooruFavorites(USER.clerkId)
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { userId: USER.id },
      orderBy: { createdAt: 'desc' },
    })
    expect(favorites.map((favorite) => favorite.id)).toEqual(['fav_2'])
  })
})

describe('removeDanbooruFavorite', () => {
  it('only deletes the signed-in user’s own favorite', async () => {
    mockDeleteMany.mockResolvedValue({ count: 0 })
    expect(await removeDanbooruFavorite(USER.clerkId, 'fav_other')).toBe(false)
    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { id: 'fav_other', userId: USER.id },
    })
  })
})
