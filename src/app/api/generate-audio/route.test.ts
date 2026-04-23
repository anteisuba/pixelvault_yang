import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createPOST,
  mockAuthenticated,
  mockRateLimitAllowed,
  mockRateLimitExceeded,
  mockUnauthenticated,
  parseJSON,
} from '@/test/api-helpers'
import { AI_ADAPTER_TYPES } from '@/constants/providers'

vi.mock('@/services/generate-audio.service', () => ({
  generateAudioForUser: vi.fn(),
  submitAudioGeneration: vi.fn(),
}))

vi.mock('@/constants/models', async () => {
  const actual =
    await vi.importActual<typeof import('@/constants/models')>(
      '@/constants/models',
    )
  return {
    ...actual,
    getModelById: vi.fn(),
  }
})

vi.mock('@/services/generate-image.service', () => ({
  isGenerateImageServiceError: vi.fn(),
}))

import { POST } from '@/app/api/generate-audio/route'
import {
  generateAudioForUser,
  submitAudioGeneration,
} from '@/services/generate-audio.service'
import { getModelById } from '@/constants/models'
import { isGenerateImageServiceError } from '@/services/generate-image.service'

const mockGenerateAudioForUser = vi.mocked(generateAudioForUser)
const mockSubmitAudioGeneration = vi.mocked(submitAudioGeneration)
const mockGetModelById = vi.mocked(getModelById)
const mockIsServiceError = vi.mocked(isGenerateImageServiceError)

const VALID_SYNC_BODY = {
  prompt: 'Hello world',
  modelId: 'fish-audio-s2-pro',
}

const VALID_ASYNC_BODY = {
  prompt: 'Hello world',
  modelId: 'fal-f5-tts',
}

const FAKE_AUDIO_GENERATION = {
  id: 'gen-audio-1',
  createdAt: new Date('2026-04-23T00:00:01.000Z'),
  outputType: 'AUDIO' as const,
  status: 'COMPLETED' as const,
  url: 'https://cdn.example.com/audio.mp3',
  storageKey: 'audio/user-1/gen.mp3',
  mimeType: 'audio/mpeg',
  width: 0,
  height: 0,
  duration: 3.5,
  prompt: 'Hello world',
  negativePrompt: null,
  model: 'fish-audio-s2-pro',
  provider: 'Fish Audio',
  requestCount: 1,
  isPublic: false,
  isPromptPublic: false,
  userId: 'user-1',
}

describe('POST /api/generate-audio', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockRateLimitAllowed()
    mockIsServiceError.mockReturnValue(false)
    mockGenerateAudioForUser.mockResolvedValue(FAKE_AUDIO_GENERATION as never)
    mockSubmitAudioGeneration.mockResolvedValue({
      jobId: 'job-audio-1',
    } as never)
  })

  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()
    const req = createPOST('/api/generate-audio', VALID_SYNC_BODY)
    const res = await POST(req)

    expect(res.status).toBe(401)
    const body = await parseJSON<{ success: boolean }>(res)
    expect(body.success).toBe(false)
  })

  it('returns 429 when rate limited', async () => {
    mockRateLimitExceeded()
    const req = createPOST('/api/generate-audio', VALID_SYNC_BODY)
    const res = await POST(req)

    expect(res.status).toBe(429)
    const body = await parseJSON<{ success: boolean; error: string }>(res)
    expect(body.success).toBe(false)
    expect(body.error).toContain('Too many requests')
  })

  it('returns 400 for missing prompt', async () => {
    const req = createPOST('/api/generate-audio', {
      modelId: 'fish-audio-s2-pro',
    })
    const res = await POST(req)

    expect(res.status).toBe(400)
    const body = await parseJSON<{ success: boolean }>(res)
    expect(body.success).toBe(false)
  })

  it('delegates Fish Audio models to sync generation service', async () => {
    mockGetModelById.mockReturnValue({
      adapterType: AI_ADAPTER_TYPES.FISH_AUDIO,
    } as never)
    const req = createPOST('/api/generate-audio', VALID_SYNC_BODY)
    const res = await POST(req)

    expect(res.status).toBe(200)
    const body = await parseJSON<{
      success: boolean
      data: { generation: typeof FAKE_AUDIO_GENERATION }
    }>(res)
    expect(body.success).toBe(true)
    expect(body.data.generation.id).toBe('gen-audio-1')
    expect(mockGenerateAudioForUser).toHaveBeenCalledWith(
      'clerk_test_user',
      expect.objectContaining({ prompt: VALID_SYNC_BODY.prompt }),
    )
    expect(mockSubmitAudioGeneration).not.toHaveBeenCalled()
  })

  it('delegates queued models to async submit service', async () => {
    mockGetModelById.mockReturnValue({
      adapterType: AI_ADAPTER_TYPES.FAL,
    } as never)
    const req = createPOST('/api/generate-audio', VALID_ASYNC_BODY)
    const res = await POST(req)

    expect(res.status).toBe(200)
    const body = await parseJSON<{
      success: boolean
      data: { jobId: string }
    }>(res)
    expect(body.success).toBe(true)
    expect(body.data.jobId).toBe('job-audio-1')
    expect(mockSubmitAudioGeneration).toHaveBeenCalledWith(
      'clerk_test_user',
      expect.objectContaining({ prompt: VALID_ASYNC_BODY.prompt }),
    )
    expect(mockGenerateAudioForUser).not.toHaveBeenCalled()
  })

  it('returns legacy service error status when sync generation fails', async () => {
    mockGetModelById.mockReturnValue({
      adapterType: AI_ADAPTER_TYPES.FISH_AUDIO,
    } as never)
    mockGenerateAudioForUser.mockRejectedValue(
      Object.assign(new Error('Audio provider unavailable'), {
        code: 'PROVIDER_ERROR',
        status: 503,
      }),
    )
    mockIsServiceError.mockReturnValue(true)

    const req = createPOST('/api/generate-audio', VALID_SYNC_BODY)
    const res = await POST(req)

    expect(res.status).toBe(503)
    const body = await parseJSON<{ success: boolean; error: string }>(res)
    expect(body.success).toBe(false)
    expect(body.error).toBe('Audio provider unavailable')
  })

  it('returns 500 on unexpected async submit error', async () => {
    mockGetModelById.mockReturnValue({
      adapterType: AI_ADAPTER_TYPES.FAL,
    } as never)
    mockSubmitAudioGeneration.mockRejectedValue(new Error('unexpected'))

    const req = createPOST('/api/generate-audio', VALID_ASYNC_BODY)
    const res = await POST(req)

    expect(res.status).toBe(500)
    const body = await parseJSON<{ success: boolean; error: string }>(res)
    expect(body.success).toBe(false)
  })
})
