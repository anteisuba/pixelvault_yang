import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  mockAuthenticated,
  mockUnauthenticated,
  mockRateLimitAllowed,
  mockRateLimitExceeded,
  createPOST,
  parseJSON,
} from '@/test/api-helpers'

// ─── Mocks ────────────────────────────────────────────────────────

vi.mock('@/services/arena.service', () => ({
  generateArenaEntry: vi.fn(),
}))

import { POST } from './route'
import { generateArenaEntry } from '@/services/arena.service'

const mockGenerateEntry = vi.mocked(generateArenaEntry)

// ─── Tests ────────────────────────────────────────────────────────

const MATCH_ID = 'match_abc123'
const makeParams = (id: string) => ({ params: Promise.resolve({ id }) })

const VALID_BODY = {
  modelId: 'nai-diffusion-4-curated-preview',
  slotIndex: 0,
}

const FAKE_ENTRY = {
  id: 'entry_001',
  slotIndex: 0,
  modelId: '',
  status: 'completed',
  imageUrl: 'https://storage.example.com/arena.png',
  wasVoted: false,
}

describe('POST /api/arena/matches/[id]/entries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockRateLimitAllowed()
    mockGenerateEntry.mockResolvedValue(FAKE_ENTRY as never)
  })

  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()
    const req = createPOST(`/api/arena/matches/${MATCH_ID}/entries`, VALID_BODY)
    const res = await POST(req, makeParams(MATCH_ID))

    expect(res.status).toBe(401)
    const json = await parseJSON<{ success: boolean }>(res)
    expect(json.success).toBe(false)
  })

  it('returns 429 when rate limited', async () => {
    mockRateLimitExceeded()
    const req = createPOST(`/api/arena/matches/${MATCH_ID}/entries`, VALID_BODY)
    const res = await POST(req, makeParams(MATCH_ID))

    expect(res.status).toBe(429)
  })

  it('returns 400 for missing modelId', async () => {
    const req = createPOST(`/api/arena/matches/${MATCH_ID}/entries`, {
      slotIndex: 0,
    })
    const res = await POST(req, makeParams(MATCH_ID))

    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid JSON body', async () => {
    const req = createPOST(`/api/arena/matches/${MATCH_ID}/entries`, undefined)
    const res = await POST(req, makeParams(MATCH_ID))

    expect(res.status).toBe(400)
  })

  it('generates entry on success', async () => {
    const req = createPOST(`/api/arena/matches/${MATCH_ID}/entries`, VALID_BODY)
    const res = await POST(req, makeParams(MATCH_ID))
    const json = await parseJSON<{ success: boolean; data: unknown }>(res)

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data).toEqual(FAKE_ENTRY)
    expect(mockGenerateEntry).toHaveBeenCalledWith(
      MATCH_ID,
      'clerk_test_user',
      expect.objectContaining({
        modelId: VALID_BODY.modelId,
        slotIndex: VALID_BODY.slotIndex,
      }),
    )
  })

  it('passes advancedParams to service when provided', async () => {
    const bodyWithAdvanced = {
      ...VALID_BODY,
      advancedParams: {
        negativePrompt: 'blurry',
        guidanceScale: 5,
        steps: 28,
        seed: 12345,
        referenceStrength: 0.7,
      },
    }
    const req = createPOST(
      `/api/arena/matches/${MATCH_ID}/entries`,
      bodyWithAdvanced,
    )
    const res = await POST(req, makeParams(MATCH_ID))

    expect(res.status).toBe(200)
    expect(mockGenerateEntry).toHaveBeenCalledWith(
      MATCH_ID,
      'clerk_test_user',
      expect.objectContaining({
        modelId: VALID_BODY.modelId,
        slotIndex: VALID_BODY.slotIndex,
        advancedParams: expect.objectContaining({
          negativePrompt: 'blurry',
          guidanceScale: 5,
          steps: 28,
          seed: 12345,
          referenceStrength: 0.7,
        }),
      }),
    )
  })

  it('succeeds without advancedParams', async () => {
    const req = createPOST(`/api/arena/matches/${MATCH_ID}/entries`, VALID_BODY)
    const res = await POST(req, makeParams(MATCH_ID))

    expect(res.status).toBe(200)
    expect(mockGenerateEntry).toHaveBeenCalledWith(
      MATCH_ID,
      'clerk_test_user',
      expect.objectContaining({
        modelId: VALID_BODY.modelId,
      }),
    )
  })

  it('returns 500 when service throws', async () => {
    mockGenerateEntry.mockRejectedValue(new Error('Generation failed'))

    const req = createPOST(`/api/arena/matches/${MATCH_ID}/entries`, VALID_BODY)
    const res = await POST(req, makeParams(MATCH_ID))
    const json = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(500)
    expect(json.success).toBe(false)
  })
})
