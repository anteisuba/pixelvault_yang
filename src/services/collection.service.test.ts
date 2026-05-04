import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFindMany = vi.fn()
const mockFindUnique = vi.fn()
const mockCount = vi.fn()
const mockCreate = vi.fn()
const mockUpdate = vi.fn()
const mockCollectionItemFindMany = vi.fn()
const mockCollectionItemFindFirst = vi.fn()
const mockCollectionItemCreateMany = vi.fn()
const mockCollectionItemDeleteMany = vi.fn()
const mockGenerationFindMany = vi.fn()

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
      findMany: (...a: unknown[]) => mockCollectionItemFindMany(...a),
      findFirst: (...a: unknown[]) => mockCollectionItemFindFirst(...a),
      createMany: (...a: unknown[]) => mockCollectionItemCreateMany(...a),
      deleteMany: (...a: unknown[]) => mockCollectionItemDeleteMany(...a),
    },
    generation: { findMany: (...a: unknown[]) => mockGenerationFindMany(...a) },
  },
}))

import {
  addToCollection,
  getUserCollections,
  createCollection,
  deleteCollection,
  removeFromCollection,
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
    mockCollectionItemFindFirst.mockResolvedValue(null)
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

describe('addToCollection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindUnique.mockResolvedValue({
      userId: 'user_1',
      _count: { items: 0 },
    })
    mockCollectionItemFindMany.mockResolvedValue([])
    mockGenerationFindMany.mockResolvedValue([{ id: 'gen_1' }, { id: 'gen_2' }])
    mockCollectionItemFindFirst.mockResolvedValue(null)
    mockCollectionItemCreateMany.mockResolvedValue({ count: 2 })
    mockUpdate.mockResolvedValue({})
  })

  it('adds owned generations to a collection and updates the cover', async () => {
    const result = await addToCollection('col_1', 'user_1', ['gen_1', 'gen_2'])

    expect(result).toBe(2)
    expect(mockCollectionItemCreateMany).toHaveBeenCalledWith({
      data: [
        { collectionId: 'col_1', generationId: 'gen_1', orderIndex: 0 },
        { collectionId: 'col_1', generationId: 'gen_2', orderIndex: 1 },
      ],
    })
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'col_1' },
      data: { coverUrl: null },
    })
  })

  it('throws when collection does not exist or belongs to another user', async () => {
    mockFindUnique.mockResolvedValue({ userId: 'other', _count: { items: 0 } })

    await expect(addToCollection('col_1', 'user_1', ['gen_1'])).rejects.toThrow(
      'COLLECTION_NOT_FOUND',
    )
    expect(mockCollectionItemCreateMany).not.toHaveBeenCalled()
  })
})

describe('removeFromCollection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindUnique.mockResolvedValue({ userId: 'user_1' })
    mockCollectionItemDeleteMany.mockResolvedValue({ count: 1 })
    mockCollectionItemFindFirst.mockResolvedValue({
      generation: { url: 'https://cdn.example.com/cover.png' },
    })
    mockUpdate.mockResolvedValue({})
  })

  it('removes a generation from the collection and refreshes the cover', async () => {
    const result = await removeFromCollection('col_1', 'user_1', 'gen_1')

    expect(result).toBe(true)
    expect(mockCollectionItemDeleteMany).toHaveBeenCalledWith({
      where: { collectionId: 'col_1', generationId: 'gen_1' },
    })
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'col_1' },
      data: { coverUrl: 'https://cdn.example.com/cover.png' },
    })
  })

  it('returns false when no collection item is removed', async () => {
    mockCollectionItemDeleteMany.mockResolvedValue({ count: 0 })

    const result = await removeFromCollection('col_1', 'user_1', 'gen_missing')

    expect(result).toBe(false)
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})
