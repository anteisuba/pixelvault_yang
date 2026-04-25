import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const mockEnsureUser = vi.fn()
vi.mock('@/services/user.service', () => ({
  ensureUser: (...a: unknown[]) => mockEnsureUser(...a),
}))

vi.mock('@/services/llm-text.service', () => ({
  llmTextCompletion: vi.fn(),
  resolveLlmTextRoute: vi.fn(),
}))

vi.mock('@/services/storage/r2', () => ({
  generateStorageKey: vi.fn().mockReturnValue('key/abc'),
  uploadToR2: vi.fn().mockResolvedValue('https://r2.example.com/abc.jpg'),
}))

const mockFindMany = vi.fn()
const mockFindUnique = vi.fn()
const mockUpdate = vi.fn()
const mockCount = vi.fn()

vi.mock('@/lib/db', () => ({
  db: {
    characterCard: {
      findMany: (...a: unknown[]) => mockFindMany(...a),
      findUnique: (...a: unknown[]) => mockFindUnique(...a),
      update: (...a: unknown[]) => mockUpdate(...a),
      count: (...a: unknown[]) => mockCount(...a),
    },
  },
}))

import {
  buildPromptFromAttributes,
  listCharacterCards,
  getCharacterCard,
  deleteCharacterCard,
} from '@/services/character-card.service'
import type { CharacterAttributes } from '@/types'

const FAKE_USER = { id: 'db_user_1', clerkId: 'clerk_1' }
const FAKE_CARD = {
  id: 'card_1',
  userId: 'db_user_1',
  name: 'Rei',
  description: null,
  sourceImageUrl: 'https://example.com/rei.png',
  sourceStorageKey: '',
  sourceImages: [],
  sourceImageEntries: [],
  characterPrompt: 'blue hair anime girl',
  modelPrompts: null,
  attributes: {},
  tags: [],
  status: 'DRAFT',
  parentId: null,
  variantLabel: null,
  stabilityScore: null,
  isDeleted: false,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  loras: null,
  referenceImages: null,
  variants: [],
}

describe('buildPromptFromAttributes', () => {
  it('assembles known fields into a comma-separated prompt', () => {
    const attrs: CharacterAttributes = {
      hairColor: 'blue',
      hairStyle: 'long',
      eyeColor: 'violet',
      artStyle: 'anime',
    }

    const result = buildPromptFromAttributes(attrs)

    expect(result).toContain('blue long hair')
    expect(result).toContain('violet eyes')
    expect(result).toContain('anime')
  })

  it('falls back to freeformDescription when all other fields are empty', () => {
    const attrs: CharacterAttributes = {
      freeformDescription: 'a mysterious hooded figure',
    }

    const result = buildPromptFromAttributes(attrs)

    expect(result).toBe('a mysterious hooded figure')
  })
})

describe('listCharacterCards', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureUser.mockResolvedValue(FAKE_USER)
  })

  it('returns a list of cards for the user', async () => {
    mockFindMany.mockResolvedValue([FAKE_CARD])

    const result = await listCharacterCards('clerk_1')

    expect(result).toHaveLength(1)
    expect(result[0]?.name).toBe('Rei')
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'db_user_1', isDeleted: false, parentId: null },
      }),
    )
  })
})

describe('getCharacterCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureUser.mockResolvedValue(FAKE_USER)
  })

  it('returns null when card belongs to another user', async () => {
    mockFindUnique.mockResolvedValue({
      ...FAKE_CARD,
      userId: 'other',
      variants: [],
    })

    const result = await getCharacterCard('clerk_1', 'card_1')

    expect(result).toBeNull()
  })
})

describe('deleteCharacterCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureUser.mockResolvedValue(FAKE_USER)
  })

  it('soft-deletes and returns true', async () => {
    mockFindUnique.mockResolvedValue(FAKE_CARD)
    mockUpdate.mockResolvedValue({})

    const result = await deleteCharacterCard('clerk_1', 'card_1')

    expect(result).toBe(true)
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'card_1' },
      data: { isDeleted: true },
    })
  })

  it('returns false when not found', async () => {
    mockFindUnique.mockResolvedValue(null)

    const result = await deleteCharacterCard('clerk_1', 'missing')

    expect(result).toBe(false)
  })
})
