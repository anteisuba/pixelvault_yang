import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  mockAuthenticated,
  mockUnauthenticated,
  createGET,
  createPOST,
  parseJSON,
} from '@/test/api-helpers'

vi.mock('server-only', () => ({}))

vi.mock('@/services/style-card.service', () => ({
  listStyleCards: vi.fn(),
  createStyleCard: vi.fn(),
}))

import { GET, POST } from './route'
import { listStyleCards, createStyleCard } from '@/services/style-card.service'

const mockListStyleCards = vi.mocked(listStyleCards)
const mockCreateStyleCard = vi.mocked(createStyleCard)

const CREATED_AT = new Date('2026-01-01T00:00:00.000Z')

const FAKE_STYLE_CARD = {
  id: 'style_123',
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

const VALID_BODY = {
  name: 'Painterly',
  stylePrompt: 'soft painterly lighting',
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuthenticated()
  mockListStyleCards.mockResolvedValue([FAKE_STYLE_CARD] as never)
  mockCreateStyleCard.mockResolvedValue(FAKE_STYLE_CARD as never)
})

describe('GET /api/style-cards', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()

    const res = await GET(createGET('/api/style-cards'))
    const body = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(401)
    expect(body.success).toBe(false)
    expect(mockListStyleCards).not.toHaveBeenCalled()
  })

  it('lists style cards for the authenticated user', async () => {
    const res = await GET(
      createGET('/api/style-cards', { projectId: 'proj_123' }),
    )
    const body = await parseJSON<{ success: boolean; data: unknown[] }>(res)

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toHaveLength(1)
    expect(mockListStyleCards).toHaveBeenCalledWith(
      'clerk_test_user',
      'proj_123',
    )
  })
})

describe('POST /api/style-cards', () => {
  it('returns 400 for invalid body', async () => {
    const res = await POST(createPOST('/api/style-cards', { name: '' }))
    const body = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
    expect(mockCreateStyleCard).not.toHaveBeenCalled()
  })

  it('creates a style card with validated input', async () => {
    const res = await POST(createPOST('/api/style-cards', VALID_BODY))
    const body = await parseJSON<{ success: boolean; data: unknown }>(res)

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toMatchObject({ id: 'style_123' })
    expect(mockCreateStyleCard).toHaveBeenCalledWith(
      'clerk_test_user',
      expect.objectContaining({
        name: VALID_BODY.name,
        stylePrompt: VALID_BODY.stylePrompt,
        tags: [],
      }),
    )
  })
})
