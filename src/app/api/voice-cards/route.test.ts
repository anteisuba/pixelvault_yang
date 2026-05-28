import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  createGET,
  createPOST,
  mockAuthenticated,
  mockUnauthenticated,
  parseJSON,
} from '@/test/api-helpers'
import {
  VOICE_CARD_DEFAULT_PACE,
  VOICE_CARD_DEFAULT_PROVIDER,
} from '@/constants/voice-cards'

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const mockCreate = vi.fn()
const mockList = vi.fn()

vi.mock('@/services/cards/voice-card.service', () => ({
  createVoiceCard: (...args: unknown[]) => mockCreate(...args),
  listVoiceCards: (...args: unknown[]) => mockList(...args),
}))

import { GET, POST } from '@/app/api/voice-cards/route'

const FAKE_VOICE_CARD = {
  id: 'voice_card_123',
  userId: 'db_user_123',
  name: 'Narrator',
  provider: VOICE_CARD_DEFAULT_PROVIDER,
  modelId: 'fish-audio-s2-pro',
  voiceId: 'voice_123',
  referenceAudioUrl: null,
  referenceAudioStorageKey: null,
  gender: null,
  age: null,
  tone: [],
  pace: VOICE_CARD_DEFAULT_PACE,
  pitch: null,
  pronunciationDictionary: {},
  sampleText: null,
  isDeleted: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

describe('POST /api/voice-cards', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockCreate.mockResolvedValue(FAKE_VOICE_CARD)
  })

  it('returns 401 for unauthenticated requests', async () => {
    mockUnauthenticated()

    const res = await POST(createPOST('/api/voice-cards', { name: 'Narrator' }))

    expect(res.status).toBe(401)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('returns 400 when validation fails', async () => {
    const res = await POST(createPOST('/api/voice-cards', { name: '' }))

    expect(res.status).toBe(400)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('creates a voice card and returns 201', async () => {
    const res = await POST(
      createPOST('/api/voice-cards', {
        name: 'Narrator',
        voiceId: 'voice_123',
      }),
    )
    const body = await parseJSON<{
      success: boolean
      data: typeof FAKE_VOICE_CARD
    }>(res)

    expect(res.status).toBe(201)
    expect(body.success).toBe(true)
    expect(body.data.id).toBe('voice_card_123')
    expect(mockCreate).toHaveBeenCalledWith(
      'clerk_test_user',
      expect.objectContaining({
        name: 'Narrator',
        provider: VOICE_CARD_DEFAULT_PROVIDER,
        pace: VOICE_CARD_DEFAULT_PACE,
      }),
    )
  })

  it('returns 500 when the service fails unexpectedly', async () => {
    mockCreate.mockRejectedValueOnce(new Error('database unavailable'))

    const res = await POST(createPOST('/api/voice-cards', { name: 'Narrator' }))

    expect(res.status).toBe(500)
  })
})

describe('GET /api/voice-cards', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockList.mockResolvedValue({ items: [FAKE_VOICE_CARD], total: 1 })
  })

  it('returns 401 for unauthenticated requests', async () => {
    mockUnauthenticated()

    const res = await GET(createGET('/api/voice-cards'))

    expect(res.status).toBe(401)
    expect(mockList).not.toHaveBeenCalled()
  })

  it('returns paginated voice cards', async () => {
    const res = await GET(createGET('/api/voice-cards'))
    const body = await parseJSON<{
      success: boolean
      data: { items: (typeof FAKE_VOICE_CARD)[]; total: number }
    }>(res)

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.items).toHaveLength(1)
    expect(body.data.total).toBe(1)
  })

  it('passes page and pageSize query params to listVoiceCards', async () => {
    await GET(createGET('/api/voice-cards', { page: '2', pageSize: '5' }))

    expect(mockList).toHaveBeenCalledWith('clerk_test_user', 2, 5)
  })

  it('returns 400 for invalid query params', async () => {
    const res = await GET(createGET('/api/voice-cards', { pageSize: '100' }))

    expect(res.status).toBe(400)
    expect(mockList).not.toHaveBeenCalled()
  })
})
