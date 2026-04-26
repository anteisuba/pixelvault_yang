import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  mockAuthenticated,
  mockUnauthenticated,
  createGET,
  createPOST,
  parseJSON,
} from '@/test/api-helpers'

vi.mock('server-only', () => ({}))

vi.mock('@/services/background-card.service', () => ({
  listBackgroundCards: vi.fn(),
  createBackgroundCard: vi.fn(),
}))

import { GET, POST } from './route'
import {
  listBackgroundCards,
  createBackgroundCard,
} from '@/services/background-card.service'

const mockListBackgroundCards = vi.mocked(listBackgroundCards)
const mockCreateBackgroundCard = vi.mocked(createBackgroundCard)

const CREATED_AT = new Date('2026-01-01T00:00:00.000Z')

const FAKE_BACKGROUND_CARD = {
  id: 'bg_123',
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

const VALID_BODY = {
  name: 'Moonlit Alley',
  backgroundPrompt: 'moonlit alley with wet pavement',
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuthenticated()
  mockListBackgroundCards.mockResolvedValue([FAKE_BACKGROUND_CARD] as never)
  mockCreateBackgroundCard.mockResolvedValue(FAKE_BACKGROUND_CARD as never)
})

describe('GET /api/background-cards', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()

    const res = await GET(createGET('/api/background-cards'))
    const body = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(401)
    expect(body.success).toBe(false)
    expect(mockListBackgroundCards).not.toHaveBeenCalled()
  })

  it('lists background cards for the authenticated user', async () => {
    const res = await GET(
      createGET('/api/background-cards', { projectId: 'proj_123' }),
    )
    const body = await parseJSON<{ success: boolean; data: unknown[] }>(res)

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toHaveLength(1)
    expect(mockListBackgroundCards).toHaveBeenCalledWith(
      'clerk_test_user',
      'proj_123',
    )
  })
})

describe('POST /api/background-cards', () => {
  it('returns 400 for invalid body', async () => {
    const res = await POST(createPOST('/api/background-cards', { name: '' }))
    const body = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
    expect(mockCreateBackgroundCard).not.toHaveBeenCalled()
  })

  it('creates a background card with validated input', async () => {
    const res = await POST(createPOST('/api/background-cards', VALID_BODY))
    const body = await parseJSON<{ success: boolean; data: unknown }>(res)

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toMatchObject({ id: 'bg_123' })
    expect(mockCreateBackgroundCard).toHaveBeenCalledWith(
      'clerk_test_user',
      expect.objectContaining({
        name: VALID_BODY.name,
        backgroundPrompt: VALID_BODY.backgroundPrompt,
        tags: [],
      }),
    )
  })
})
