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
  extractStyleAttributes: vi.fn().mockResolvedValue({
    attributes: { artStyle: 'watercolor' },
    prompt: 'watercolor painting style',
  }),
}))

const mockFindMany = vi.fn()
const mockFindFirst = vi.fn()
const mockUpdateMany = vi.fn()

vi.mock('@/lib/db', () => ({
  db: {
    styleCard: {
      findMany: (...a: unknown[]) => mockFindMany(...a),
      findFirst: (...a: unknown[]) => mockFindFirst(...a),
      updateMany: (...a: unknown[]) => mockUpdateMany(...a),
    },
  },
}))

import {
  listStyleCards,
  getStyleCard,
  deleteStyleCard,
} from '@/services/style-card.service'

const FAKE_USER = { id: 'db_user_1', clerkId: 'clerk_1' }

const FAKE_STYLE_ROW = {
  id: 'style_1',
  name: 'Watercolor',
  description: null,
  sourceImageUrl: null,
  stylePrompt: 'watercolor painting style',
  attributes: { artStyle: 'watercolor' },
  loras: null,
  modelId: 'flux-2-pro',
  adapterType: 'fal',
  advancedParams: null,
  tags: [],
  projectId: null,
  isDeleted: false,
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('listStyleCards', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureUser.mockResolvedValue(FAKE_USER)
  })

  it('returns a list of style cards for the user', async () => {
    mockFindMany.mockResolvedValue([FAKE_STYLE_ROW])
    const result = await listStyleCards('clerk_1')
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Watercolor')
  })
})

describe('getStyleCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureUser.mockResolvedValue(FAKE_USER)
  })

  it('returns the card when found', async () => {
    mockFindFirst.mockResolvedValue(FAKE_STYLE_ROW)
    const result = await getStyleCard('clerk_1', 'style_1')
    expect(result?.id).toBe('style_1')
  })

  it('returns null when card not found', async () => {
    mockFindFirst.mockResolvedValue(null)
    const result = await getStyleCard('clerk_1', 'missing')
    expect(result).toBeNull()
  })
})

describe('deleteStyleCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockUpdateMany.mockResolvedValue({ count: 1 })
  })

  it('soft-deletes style cards owned by the user', async () => {
    await deleteStyleCard('clerk_1', 'style_1')
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: 'style_1', userId: 'db_user_1', isDeleted: false },
      data: { isDeleted: true },
    })
  })
})
