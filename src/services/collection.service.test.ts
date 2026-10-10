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
const mockCollectionItemCount = vi.fn()
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
      count: (...a: unknown[]) => mockCollectionItemCount(...a),
    },
    generation: { findMany: (...a: unknown[]) => mockGenerationFindMany(...a) },
  },
}))

import {
  addToCollection,
  getUserCollections,
  createCollection,
  deleteCollection,
  getCollectionById,
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

describe('getCollectionById', () => {
  const PUBLIC_COLLECTION = {
    ...FAKE_COLLECTION,
    userId: 'owner_1',
    isPublic: true,
    coverUrl: 'https://cdn.example.com/private-cover.png',
    _count: { items: 3 },
    user: {
      id: 'owner_1',
      username: 'owner',
      displayName: null,
      avatarUrl: null,
    },
  }
  const generationItem = (
    id: string,
    isPublic: boolean,
    isPromptPublic: boolean,
  ) => ({
    generation: {
      id,
      url: `https://cdn.example.com/${id}.png`,
      prompt: `prompt of ${id}`,
      negativePrompt: `negative of ${id}`,
      isPublic,
      isPromptPublic,
    },
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockFindUnique.mockResolvedValue(PUBLIC_COLLECTION)
  })

  it('returns only public items to non-owners, counted and paged from the same filter', async () => {
    mockCollectionItemFindMany.mockResolvedValue([
      generationItem('gen_public', true, true),
    ])
    mockCollectionItemCount.mockResolvedValue(1)
    mockCollectionItemFindFirst.mockResolvedValue({
      generation: { url: 'https://cdn.example.com/gen_public.png' },
    })

    const result = await getCollectionById('col_1', 'viewer_1', 1, 20)

    const publicWhere = {
      collectionId: 'col_1',
      generation: { isPublic: true },
    }
    expect(mockCollectionItemFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: publicWhere }),
    )
    expect(mockCollectionItemCount).toHaveBeenCalledWith({
      where: publicWhere,
    })
    expect(mockCollectionItemFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: publicWhere }),
    )
    expect(result?.generations.map((g) => g.id)).toEqual(['gen_public'])
    expect(result?.total).toBe(1)
    expect(result?.itemCount).toBe(1)
    expect(result?.hasMore).toBe(false)
    expect(result?.coverUrl).toBe('https://cdn.example.com/gen_public.png')
  })

  it('applies the same filter to anonymous viewers and has no cover when nothing is public', async () => {
    mockCollectionItemFindMany.mockResolvedValue([])
    mockCollectionItemCount.mockResolvedValue(0)
    mockCollectionItemFindFirst.mockResolvedValue(null)

    const result = await getCollectionById('col_1', null)

    expect(mockCollectionItemCount).toHaveBeenCalledWith({
      where: { collectionId: 'col_1', generation: { isPublic: true } },
    })
    expect(result?.generations).toEqual([])
    expect(result?.total).toBe(0)
    expect(result?.coverUrl).toBeNull()
  })

  it('redacts prompts of items whose prompt is not public for non-owners', async () => {
    mockCollectionItemFindMany.mockResolvedValue([
      generationItem('gen_open', true, true),
      generationItem('gen_hidden', true, false),
    ])
    mockCollectionItemCount.mockResolvedValue(2)
    mockCollectionItemFindFirst.mockResolvedValue(null)

    const result = await getCollectionById('col_1', 'viewer_1')

    const [open, hidden] = result?.generations ?? []
    expect(open.prompt).toBe('prompt of gen_open')
    expect(open.negativePrompt).toBe('negative of gen_open')
    expect(hidden.prompt).toBe('')
    expect(hidden.negativePrompt).toBeNull()
  })

  it('keeps the owner view unfiltered and unredacted', async () => {
    mockCollectionItemFindMany.mockResolvedValue([
      generationItem('gen_public', true, true),
      generationItem('gen_private', false, false),
      generationItem('gen_hidden_prompt', true, false),
    ])

    const result = await getCollectionById('col_1', 'owner_1', 1, 2)

    expect(mockCollectionItemFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { collectionId: 'col_1' } }),
    )
    expect(mockCollectionItemCount).not.toHaveBeenCalled()
    expect(mockCollectionItemFindFirst).not.toHaveBeenCalled()
    expect(result?.generations.map((g) => g.prompt)).toEqual([
      'prompt of gen_public',
      'prompt of gen_private',
      'prompt of gen_hidden_prompt',
    ])
    expect(result?.total).toBe(3)
    expect(result?.hasMore).toBe(true)
    expect(result?.coverUrl).toBe('https://cdn.example.com/private-cover.png')
  })

  it('hides private collections from non-owners', async () => {
    mockFindUnique.mockResolvedValue({ ...PUBLIC_COLLECTION, isPublic: false })

    const result = await getCollectionById('col_1', 'viewer_1')

    expect(result).toBeNull()
    expect(mockCollectionItemFindMany).not.toHaveBeenCalled()
  })
})
