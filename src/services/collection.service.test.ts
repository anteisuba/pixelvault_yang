import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFindMany = vi.fn()
const mockFindUnique = vi.fn()
const mockCount = vi.fn()
const mockCreate = vi.fn()
const mockUpdate = vi.fn()

vi.mock('@/lib/db', () => ({
  db: {
    collection: {
      findMany: (...a: unknown[]) => mockFindMany(...a),
      findUnique: (...a: unknown[]) => mockFindUnique(...a),
      count: (...a: unknown[]) => mockCount(...a),
      create: (...a: unknown[]) => mockCreate(...a),
      update: (...a: unknown[]) => mockUpdate(...a),
    },
    collectionItem: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    generation: { findMany: vi.fn().mockResolvedValue([]) },
  },
}))

import {
  getUserCollections,
  createCollection,
  deleteCollection,
} from '@/services/collection.service'

const FAKE_COLLECTION = {
  id: 'col_1',
  name: 'My Collection',
  description: null,
  coverUrl: null,
  isPublic: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  _count: { items: 0 },
}

describe('getUserCollections', () => {
  it('returns a list of collections for the user', async () => {
    mockFindMany.mockResolvedValue([FAKE_COLLECTION])
    const result = await getUserCollections('user_1')
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('My Collection')
  })
})

describe('createCollection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCount.mockResolvedValue(0)
    mockCreate.mockResolvedValue(FAKE_COLLECTION)
  })

  it('creates a collection and returns a record', async () => {
    const result = await createCollection('user_1', { name: 'My Collection' })
    expect(result.name).toBe('My Collection')
    expect(mockCreate).toHaveBeenCalled()
  })

  it('throws MAX_COLLECTIONS_EXCEEDED when limit reached', async () => {
    mockCount.mockResolvedValue(999)
    await expect(
      createCollection('user_1', { name: 'One More' }),
    ).rejects.toThrow('MAX_COLLECTIONS_EXCEEDED')
  })
})

describe('deleteCollection', () => {
  it('soft-deletes and returns true when owner matches', async () => {
    mockFindUnique.mockResolvedValue({ userId: 'user_1' })
    mockUpdate.mockResolvedValue({})
    const result = await deleteCollection('col_1', 'user_1')
    expect(result).toBe(true)
  })

  it('returns false when collection not found or wrong owner', async () => {
    mockFindUnique.mockResolvedValue(null)
    const result = await deleteCollection('col_missing', 'user_1')
    expect(result).toBe(false)
  })
})
