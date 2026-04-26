import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  mockAuthenticated,
  mockUnauthenticated,
  createGET,
  createPOST,
  parseJSON,
} from '@/test/api-helpers'

vi.mock('server-only', () => ({}))

vi.mock('@/services/character-card.service', () => ({
  listCharacterCards: vi.fn(),
  createCharacterCard: vi.fn(),
}))

import { GET, POST } from './route'
import {
  listCharacterCards,
  createCharacterCard,
} from '@/services/character-card.service'

const mockListCharacterCards = vi.mocked(listCharacterCards)
const mockCreateCharacterCard = vi.mocked(createCharacterCard)

const CREATED_AT = new Date('2026-01-01T00:00:00.000Z')

const FAKE_CHARACTER_CARD = {
  id: 'char_123',
  name: 'Mira',
  description: null,
  sourceImageUrl: 'https://example.com/mira.png',
  sourceImages: ['https://example.com/mira.png'],
  sourceImageEntries: [{ url: 'https://example.com/mira.png', viewType: 'front' }],
  characterPrompt: 'silver hair, blue eyes',
  modelPrompts: null,
  referenceImages: null,
  attributes: null,
  loras: null,
  tags: [],
  status: 'DRAFT',
  stabilityScore: null,
  parentId: null,
  variantLabel: null,
  variants: [],
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
}

const VALID_BODY = {
  name: 'Mira',
  sourceImages: ['https://example.com/mira.png'],
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuthenticated()
  mockListCharacterCards.mockResolvedValue([FAKE_CHARACTER_CARD] as never)
  mockCreateCharacterCard.mockResolvedValue(FAKE_CHARACTER_CARD as never)
})

describe('GET /api/character-cards', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()

    const res = await GET(createGET('/api/character-cards'))
    const body = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(401)
    expect(body.success).toBe(false)
    expect(mockListCharacterCards).not.toHaveBeenCalled()
  })

  it('lists character cards for the authenticated user', async () => {
    const res = await GET(createGET('/api/character-cards'))
    const body = await parseJSON<{ success: boolean; data: unknown[] }>(res)

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toHaveLength(1)
    expect(mockListCharacterCards).toHaveBeenCalledWith('clerk_test_user')
  })
})

describe('POST /api/character-cards', () => {
  it('returns 400 for invalid body', async () => {
    const res = await POST(createPOST('/api/character-cards', { name: '' }))
    const body = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
    expect(mockCreateCharacterCard).not.toHaveBeenCalled()
  })

  it('creates a character card with validated input', async () => {
    const res = await POST(createPOST('/api/character-cards', VALID_BODY))
    const body = await parseJSON<{ success: boolean; data: unknown }>(res)

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toMatchObject({ id: 'char_123' })
    expect(mockCreateCharacterCard).toHaveBeenCalledWith(
      'clerk_test_user',
      VALID_BODY,
    )
  })
})
