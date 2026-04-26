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

vi.mock('@/services/background-card.service', () => ({
  getBackgroundCard: vi.fn(),
  updateBackgroundCard: vi.fn(),
  deleteBackgroundCard: vi.fn(),
}))

import { GET, PUT, DELETE } from './route'
import {
  getBackgroundCard,
  updateBackgroundCard,
  deleteBackgroundCard,
} from '@/services/background-card.service'

const mockGetBackgroundCard = vi.mocked(getBackgroundCard)
const mockUpdateBackgroundCard = vi.mocked(updateBackgroundCard)
const mockDeleteBackgroundCard = vi.mocked(deleteBackgroundCard)

const CARD_ID = 'bg_123'
const routeParams = { params: Promise.resolve({ id: CARD_ID }) }
const CREATED_AT = new Date('2026-01-01T00:00:00.000Z')

const FAKE_BACKGROUND_CARD = {
  id: CARD_ID,
  name: 'Moonlit Alley',
  description: null,
  sourceImageUrl: null,
  backgroundPrompt: 'moonlit alley with wet pavement',
  attributes: null,
  loras: null,
  tags: [],
  projectId: null,
  isDeleted: false,
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuthenticated()
  mockGetBackgroundCard.mockResolvedValue(FAKE_BACKGROUND_CARD as never)
  mockUpdateBackgroundCard.mockResolvedValue(FAKE_BACKGROUND_CARD as never)
  mockDeleteBackgroundCard.mockResolvedValue(undefined)
})

describe('GET /api/background-cards/[id]', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()

    const res = await GET(createGET(`/api/background-cards/${CARD_ID}`), routeParams)
    const body = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(401)
    expect(body.success).toBe(false)
  })

  it('returns 404 when the background card is missing', async () => {
    mockGetBackgroundCard.mockResolvedValue(null)

    const res = await GET(createGET(`/api/background-cards/${CARD_ID}`), routeParams)
    const body = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(404)
    expect(body.success).toBe(false)
  })

  it('returns a background card on success', async () => {
    const res = await GET(createGET(`/api/background-cards/${CARD_ID}`), routeParams)
    const body = await parseJSON<{ success: boolean; data: unknown }>(res)

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toMatchObject({ id: CARD_ID })
    expect(mockGetBackgroundCard).toHaveBeenCalledWith(
      'clerk_test_user',
      CARD_ID,
    )
  })
})

describe('PUT /api/background-cards/[id]', () => {
  it('returns 400 for invalid update body', async () => {
    const res = await PUT(
      createPUT(`/api/background-cards/${CARD_ID}`, { name: '' }),
      routeParams,
    )
    const body = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
    expect(mockUpdateBackgroundCard).not.toHaveBeenCalled()
  })

  it('updates a background card with validated input', async () => {
    const res = await PUT(
      createPUT(`/api/background-cards/${CARD_ID}`, {
        backgroundPrompt: 'updated alley prompt',
      }),
      routeParams,
    )
    const body = await parseJSON<{ success: boolean; data: unknown }>(res)

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(mockUpdateBackgroundCard).toHaveBeenCalledWith(
      'clerk_test_user',
      CARD_ID,
      { backgroundPrompt: 'updated alley prompt' },
    )
  })
})

describe('DELETE /api/background-cards/[id]', () => {
  it('deletes a background card on success', async () => {
    const res = await DELETE(
      createDELETE(`/api/background-cards/${CARD_ID}`),
      routeParams,
    )
    const body = await parseJSON<{ success: boolean; data: null }>(res)

    expect(res.status).toBe(200)
    expect(body).toEqual({ success: true, data: null })
    expect(mockDeleteBackgroundCard).toHaveBeenCalledWith(
      'clerk_test_user',
      CARD_ID,
    )
  })
})
