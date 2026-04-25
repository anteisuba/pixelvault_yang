import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const mockEnsureUser = vi.fn()
vi.mock('@/services/user.service', () => ({
  ensureUser: (...a: unknown[]) => mockEnsureUser(...a),
}))

vi.mock('@/services/storage/r2', () => ({
  generateStorageKey: vi.fn().mockReturnValue('key/abc'),
  uploadToR2: vi.fn().mockResolvedValue('https://r2.example.com/abc.jpg'),
}))

vi.mock('@/services/recipe-compiler.service', () => ({
  extractBackgroundAttributes: vi.fn().mockResolvedValue({
    attributes: { freeformDescription: 'forest' },
    prompt: 'a dense forest',
  }),
}))

const mockFindMany = vi.fn()
const mockFindFirst = vi.fn()
const mockUpdateMany = vi.fn()

vi.mock('@/lib/db', () => ({
  db: {
    backgroundCard: {
      findMany: (...a: unknown[]) => mockFindMany(...a),
      findFirst: (...a: unknown[]) => mockFindFirst(...a),
      updateMany: (...a: unknown[]) => mockUpdateMany(...a),
    },
  },
}))

import {
  listBackgroundCards,
  getBackgroundCard,
  deleteBackgroundCard,
} from '@/services/background-card.service'

const FAKE_USER = { id: 'db_user_1', clerkId: 'clerk_1' }

const FAKE_CARD_ROW = {
  id: 'bg_1',
  name: 'Forest',
  description: null,
  sourceImageUrl: 'https://example.com/forest.jpg',
  backgroundPrompt: 'dense forest',
  attributes: {},
  loras: null,
  tags: [],
  projectId: null,
  isDeleted: false,
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('listBackgroundCards', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureUser.mockResolvedValue(FAKE_USER)
  })

  it('returns a list of background cards for the user', async () => {
    mockFindMany.mockResolvedValue([FAKE_CARD_ROW])
    const result = await listBackgroundCards('clerk_1')
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Forest')
  })
})

describe('getBackgroundCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureUser.mockResolvedValue(FAKE_USER)
  })

  it('returns the card when found', async () => {
    mockFindFirst.mockResolvedValue(FAKE_CARD_ROW)
    const result = await getBackgroundCard('clerk_1', 'bg_1')
    expect(result?.id).toBe('bg_1')
  })

  it('returns null when card not found', async () => {
    mockFindFirst.mockResolvedValue(null)
    const result = await getBackgroundCard('clerk_1', 'bg_missing')
    expect(result).toBeNull()
  })
})

describe('deleteBackgroundCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockUpdateMany.mockResolvedValue({ count: 1 })
  })

  it('soft-deletes cards owned by the user', async () => {
    await deleteBackgroundCard('clerk_1', 'bg_1')
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: 'bg_1', userId: 'db_user_1', isDeleted: false },
      data: { isDeleted: true },
    })
  })
})
