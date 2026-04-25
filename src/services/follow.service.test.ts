import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFindUniqueUser = vi.fn()
const mockFindUniqueFollow = vi.fn()
const mockCreateFollow = vi.fn()
const mockDeleteFollow = vi.fn()
const mockCountFollow = vi.fn()

vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: (...a: unknown[]) => mockFindUniqueUser(...a) },
    userFollow: {
      findUnique: (...a: unknown[]) => mockFindUniqueFollow(...a),
      create: (...a: unknown[]) => mockCreateFollow(...a),
      delete: (...a: unknown[]) => mockDeleteFollow(...a),
      count: (...a: unknown[]) => mockCountFollow(...a),
    },
  },
}))

import { toggleFollow } from '@/services/follow.service'

const TARGET_USER = { id: 'user_target', isPublic: true }

describe('toggleFollow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindUniqueUser.mockResolvedValue(TARGET_USER)
    mockFindUniqueFollow.mockResolvedValue(null)
    mockCreateFollow.mockResolvedValue({})
    mockCountFollow.mockResolvedValue(1)
  })

  it('follows a user and returns following=true', async () => {
    const result = await toggleFollow('user_a', 'user_target')
    expect(result.following).toBe(true)
    expect(result.followerCount).toBe(1)
    expect(mockCreateFollow).toHaveBeenCalled()
  })

  it('unfollows when follow already exists', async () => {
    mockFindUniqueFollow.mockResolvedValue({ id: 'follow_1' })
    mockCountFollow.mockResolvedValue(0)
    const result = await toggleFollow('user_a', 'user_target')
    expect(result.following).toBe(false)
    expect(mockDeleteFollow).toHaveBeenCalled()
  })

  it('throws when following yourself', async () => {
    await expect(toggleFollow('user_a', 'user_a')).rejects.toThrow(
      'Cannot follow yourself',
    )
  })

  it('throws when target user not found', async () => {
    mockFindUniqueUser.mockResolvedValue(null)
    await expect(toggleFollow('user_a', 'user_missing')).rejects.toThrow(
      'User not found',
    )
  })
})
