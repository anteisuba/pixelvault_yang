import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFindUniqueGen = vi.fn()
const mockFindUniqueLike = vi.fn()
const mockCreateLike = vi.fn()
const mockDeleteLike = vi.fn()
const mockCountLike = vi.fn()
const mockFindManyLike = vi.fn()

vi.mock('@/lib/db', () => ({
  db: {
    generation: { findUnique: (...a: unknown[]) => mockFindUniqueGen(...a) },
    userLike: {
      findUnique: (...a: unknown[]) => mockFindUniqueLike(...a),
      create: (...a: unknown[]) => mockCreateLike(...a),
      delete: (...a: unknown[]) => mockDeleteLike(...a),
      count: (...a: unknown[]) => mockCountLike(...a),
      findMany: (...a: unknown[]) => mockFindManyLike(...a),
    },
  },
}))

import { toggleLike, getUserLikes } from '@/services/like.service'

const PUBLIC_GEN = { id: 'gen_1', isPublic: true, userId: 'owner_1' }

describe('toggleLike', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindUniqueGen.mockResolvedValue(PUBLIC_GEN)
    mockFindUniqueLike.mockResolvedValue(null)
    mockCreateLike.mockResolvedValue({})
    mockCountLike.mockResolvedValue(5)
  })

  it('likes a generation and returns liked=true', async () => {
    const result = await toggleLike('user_a', 'gen_1')
    expect(result.liked).toBe(true)
    expect(result.likeCount).toBe(5)
    expect(mockCreateLike).toHaveBeenCalled()
  })

  it('unlikes when like already exists', async () => {
    mockFindUniqueLike.mockResolvedValue({ id: 'like_1' })
    mockCountLike.mockResolvedValue(4)
    const result = await toggleLike('user_a', 'gen_1')
    expect(result.liked).toBe(false)
    expect(mockDeleteLike).toHaveBeenCalled()
  })

  it('throws when generation not found', async () => {
    mockFindUniqueGen.mockResolvedValue(null)
    await expect(toggleLike('user_a', 'gen_missing')).rejects.toThrow(
      'Generation not found',
    )
  })

  it('throws when liking a private generation by non-owner', async () => {
    mockFindUniqueGen.mockResolvedValue({
      id: 'gen_1',
      isPublic: false,
      userId: 'owner_1',
    })
    await expect(toggleLike('user_b', 'gen_1')).rejects.toThrow(
      'Cannot like a private generation',
    )
  })
})

describe('getUserLikes', () => {
  it('returns a Set of liked generation IDs', async () => {
    mockFindManyLike.mockResolvedValue([
      { generationId: 'gen_1' },
      { generationId: 'gen_2' },
    ])
    const result = await getUserLikes('user_a', ['gen_1', 'gen_2', 'gen_3'])
    expect(result).toBeInstanceOf(Set)
    expect(result.has('gen_1')).toBe(true)
    expect(result.has('gen_3')).toBe(false)
  })
})
