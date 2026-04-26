import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  mockAuthenticated,
  mockUnauthenticated,
  createGET,
  createPUT,
  createDELETE,
  parseJSON,
} from '@/test/api-helpers'

vi.mock('server-only', () => ({}))

vi.mock('@/services/character-card.service', () => ({
  getCharacterCard: vi.fn(),
  updateCharacterCard: vi.fn(),
  deleteCharacterCard: vi.fn(),
}))

import { GET, PUT, DELETE } from './route'
import {
  getCharacterCard,
  updateCharacterCard,
  deleteCharacterCard,
} from '@/services/character-card.service'

const mockGetCharacterCard = vi.mocked(getCharacterCard)
const mockUpdateCharacterCard = vi.mocked(updateCharacterCard)
const mockDeleteCharacterCard = vi.mocked(deleteCharacterCard)

const CARD_ID = 'char_123'
const routeParams = { params: Promise.resolve({ id: CARD_ID }) }
const CREATED_AT = new Date('2026-01-01T00:00:00.000Z')

const FAKE_CHARACTER_CARD = {
  id: CARD_ID,
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

beforeEach(() => {
  vi.clearAllMocks()
  mockAuthenticated()
  mockGetCharacterCard.mockResolvedValue(FAKE_CHARACTER_CARD as never)
  mockUpdateCharacterCard.mockResolvedValue(FAKE_CHARACTER_CARD as never)
  mockDeleteCharacterCard.mockResolvedValue(true)
})

describe('GET /api/character-cards/[id]', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()

    const res = await GET(createGET(`/api/character-cards/${CARD_ID}`), routeParams)
    const body = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(401)
    expect(body.success).toBe(false)
  })

  it('returns 404 when the character card is missing', async () => {
    mockGetCharacterCard.mockResolvedValue(null)

    const res = await GET(createGET(`/api/character-cards/${CARD_ID}`), routeParams)
    const body = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(404)
    expect(body.success).toBe(false)
  })

  it('returns a character card on success', async () => {
    const res = await GET(createGET(`/api/character-cards/${CARD_ID}`), routeParams)
    const body = await parseJSON<{ success: boolean; data: unknown }>(res)

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toMatchObject({ id: CARD_ID })
    expect(mockGetCharacterCard).toHaveBeenCalledWith(
      'clerk_test_user',
      CARD_ID,
    )
  })
})

describe('PUT /api/character-cards/[id]', () => {
  it('returns 400 for invalid update body', async () => {
    const res = await PUT(
      createPUT(`/api/character-cards/${CARD_ID}`, { name: '' }),
      routeParams,
    )
    const body = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
    expect(mockUpdateCharacterCard).not.toHaveBeenCalled()
  })

  it('updates a character card with validated input', async () => {
    const res = await PUT(
      createPUT(`/api/character-cards/${CARD_ID}`, { name: 'Mira Prime' }),
      routeParams,
    )
    const body = await parseJSON<{ success: boolean; data: unknown }>(res)

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(mockUpdateCharacterCard).toHaveBeenCalledWith(
      'clerk_test_user',
      CARD_ID,
      { name: 'Mira Prime' },
    )
  })
})

describe('DELETE /api/character-cards/[id]', () => {
  it('returns 404 when delete target is missing', async () => {
    mockDeleteCharacterCard.mockResolvedValue(false)

    const res = await DELETE(
      createDELETE(`/api/character-cards/${CARD_ID}`),
      routeParams,
    )
    const body = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(404)
    expect(body.success).toBe(false)
  })

  it('deletes a character card on success', async () => {
    const res = await DELETE(
      createDELETE(`/api/character-cards/${CARD_ID}`),
      routeParams,
    )
    const body = await parseJSON<{ success: boolean; data: null }>(res)

    expect(res.status).toBe(200)
    expect(body).toEqual({ success: true, data: null })
    expect(mockDeleteCharacterCard).toHaveBeenCalledWith(
      'clerk_test_user',
      CARD_ID,
    )
  })
})
