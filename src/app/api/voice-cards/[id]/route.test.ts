import { NextRequest } from 'next/server'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  createDELETE,
  createGET,
  mockAuthenticated,
  mockUnauthenticated,
  parseJSON,
} from '@/test/api-helpers'
import { ApiRequestError } from '@/lib/errors'
import {
  VOICE_CARD_DEFAULT_PACE,
  VOICE_CARD_DEFAULT_PROVIDER,
} from '@/constants/voice-cards'

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const mockGet = vi.fn()
const mockUpdate = vi.fn()
const mockDelete = vi.fn()

vi.mock('@/services/cards/voice-card.service', () => ({
  getVoiceCard: (...args: unknown[]) => mockGet(...args),
  updateVoiceCard: (...args: unknown[]) => mockUpdate(...args),
  deleteVoiceCard: (...args: unknown[]) => mockDelete(...args),
}))

import { DELETE, GET, PATCH } from '@/app/api/voice-cards/[id]/route'

const BASE_URL = 'http://localhost:3000'

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

const FAKE_CONTEXT = {
  params: Promise.resolve({ id: 'voice_card_123' }),
}

function createPATCH(path: string, body: unknown) {
  return new NextRequest(new URL(path, BASE_URL), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function notFoundError() {
  return new ApiRequestError(
    'VOICE_CARD_NOT_FOUND',
    404,
    'errors.voiceCard.notFound',
    'Voice card not found',
  )
}

describe('GET /api/voice-cards/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockGet.mockResolvedValue(FAKE_VOICE_CARD)
  })

  it('returns 401 for unauthenticated requests', async () => {
    mockUnauthenticated()

    const res = await GET(createGET('/api/voice-cards/voice_card_123'), {
      params: Promise.resolve({ id: 'voice_card_123' }),
    })

    expect(res.status).toBe(401)
  })

  it('returns 404 when the card is missing or not owned by the user', async () => {
    mockGet.mockResolvedValueOnce(null)

    const res = await GET(createGET('/api/voice-cards/missing'), {
      params: Promise.resolve({ id: 'missing' }),
    })

    expect(res.status).toBe(404)
  })

  it('returns the voice card on success', async () => {
    const res = await GET(
      createGET('/api/voice-cards/voice_card_123'),
      FAKE_CONTEXT,
    )
    const body = await parseJSON<{
      success: boolean
      data: typeof FAKE_VOICE_CARD
    }>(res)

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.id).toBe('voice_card_123')
    expect(mockGet).toHaveBeenCalledWith('clerk_test_user', 'voice_card_123')
  })
})

describe('PATCH /api/voice-cards/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockUpdate.mockResolvedValue({ ...FAKE_VOICE_CARD, name: 'Updated' })
  })

  it('returns 401 for unauthenticated requests', async () => {
    mockUnauthenticated()

    const res = await PATCH(
      createPATCH('/api/voice-cards/voice_card_123', { name: 'Updated' }),
      FAKE_CONTEXT,
    )

    expect(res.status).toBe(401)
  })

  it('returns 400 when validation fails', async () => {
    const res = await PATCH(
      createPATCH('/api/voice-cards/voice_card_123', { pace: 'too-fast' }),
      FAKE_CONTEXT,
    )

    expect(res.status).toBe(400)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('returns 404 when the card is missing or not owned by the user', async () => {
    mockUpdate.mockResolvedValueOnce(null)

    const res = await PATCH(
      createPATCH('/api/voice-cards/missing', { name: 'Updated' }),
      { params: Promise.resolve({ id: 'missing' }) },
    )

    expect(res.status).toBe(404)
  })

  it('updates the voice card on success', async () => {
    const res = await PATCH(
      createPATCH('/api/voice-cards/voice_card_123', { name: 'Updated' }),
      FAKE_CONTEXT,
    )
    const body = await parseJSON<{
      success: boolean
      data: typeof FAKE_VOICE_CARD
    }>(res)

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.name).toBe('Updated')
    expect(mockUpdate).toHaveBeenCalledWith(
      'clerk_test_user',
      'voice_card_123',
      {
        name: 'Updated',
      },
    )
  })
})

describe('DELETE /api/voice-cards/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockDelete.mockResolvedValue(undefined)
  })

  it('returns 401 for unauthenticated requests', async () => {
    mockUnauthenticated()

    const res = await DELETE(
      createDELETE('/api/voice-cards/voice_card_123'),
      FAKE_CONTEXT,
    )

    expect(res.status).toBe(401)
  })

  it('returns 404 when the card is missing or not owned by the user', async () => {
    mockDelete.mockRejectedValueOnce(notFoundError())

    const res = await DELETE(createDELETE('/api/voice-cards/missing'), {
      params: Promise.resolve({ id: 'missing' }),
    })

    expect(res.status).toBe(404)
  })

  it('soft-deletes the voice card on success', async () => {
    const res = await DELETE(
      createDELETE('/api/voice-cards/voice_card_123'),
      FAKE_CONTEXT,
    )
    const body = await parseJSON<{ success: boolean; data: null }>(res)

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(mockDelete).toHaveBeenCalledWith('clerk_test_user', 'voice_card_123')
  })
})
