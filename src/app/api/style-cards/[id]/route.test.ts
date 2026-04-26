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

vi.mock('@/services/style-card.service', () => ({
  getStyleCard: vi.fn(),
  updateStyleCard: vi.fn(),
  deleteStyleCard: vi.fn(),
}))

import { GET, PUT, DELETE } from './route'
import {
  getStyleCard,
  updateStyleCard,
  deleteStyleCard,
} from '@/services/style-card.service'

const mockGetStyleCard = vi.mocked(getStyleCard)
const mockUpdateStyleCard = vi.mocked(updateStyleCard)
const mockDeleteStyleCard = vi.mocked(deleteStyleCard)

const CARD_ID = 'style_123'
const routeParams = { params: Promise.resolve({ id: CARD_ID }) }
const CREATED_AT = new Date('2026-01-01T00:00:00.000Z')

const FAKE_STYLE_CARD = {
  id: CARD_ID,
  name: 'Painterly',
  description: null,
  sourceImageUrl: null,
  stylePrompt: 'soft painterly lighting',
  attributes: null,
  loras: null,
  modelId: null,
  adapterType: null,
  advancedParams: null,
  tags: [],
  projectId: null,
  isDeleted: false,
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuthenticated()
  mockGetStyleCard.mockResolvedValue(FAKE_STYLE_CARD as never)
  mockUpdateStyleCard.mockResolvedValue(FAKE_STYLE_CARD as never)
  mockDeleteStyleCard.mockResolvedValue(undefined)
})

describe('GET /api/style-cards/[id]', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()

    const res = await GET(createGET(`/api/style-cards/${CARD_ID}`), routeParams)
    const body = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(401)
    expect(body.success).toBe(false)
  })

  it('returns 404 when the style card is missing', async () => {
    mockGetStyleCard.mockResolvedValue(null)

    const res = await GET(createGET(`/api/style-cards/${CARD_ID}`), routeParams)
    const body = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(404)
    expect(body.success).toBe(false)
  })

  it('returns a style card on success', async () => {
    const res = await GET(createGET(`/api/style-cards/${CARD_ID}`), routeParams)
    const body = await parseJSON<{ success: boolean; data: unknown }>(res)

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toMatchObject({ id: CARD_ID })
    expect(mockGetStyleCard).toHaveBeenCalledWith('clerk_test_user', CARD_ID)
  })
})

describe('PUT /api/style-cards/[id]', () => {
  it('returns 400 for invalid update body', async () => {
    const res = await PUT(
      createPUT(`/api/style-cards/${CARD_ID}`, { name: '' }),
      routeParams,
    )
    const body = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
    expect(mockUpdateStyleCard).not.toHaveBeenCalled()
  })

  it('updates a style card with validated input', async () => {
    const res = await PUT(
      createPUT(`/api/style-cards/${CARD_ID}`, {
        stylePrompt: 'updated style prompt',
      }),
      routeParams,
    )
    const body = await parseJSON<{ success: boolean; data: unknown }>(res)

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(mockUpdateStyleCard).toHaveBeenCalledWith(
      'clerk_test_user',
      CARD_ID,
      { stylePrompt: 'updated style prompt' },
    )
  })
})

describe('DELETE /api/style-cards/[id]', () => {
  it('deletes a style card on success', async () => {
    const res = await DELETE(
      createDELETE(`/api/style-cards/${CARD_ID}`),
      routeParams,
    )
    const body = await parseJSON<{ success: boolean; data: null }>(res)

    expect(res.status).toBe(200)
    expect(body).toEqual({ success: true, data: null })
    expect(mockDeleteStyleCard).toHaveBeenCalledWith(
      'clerk_test_user',
      CARD_ID,
    )
  })
})
