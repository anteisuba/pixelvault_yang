import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/api-client', () => ({
  checkImageGenerationStatusAPI: vi.fn(),
  studioGenerateAPI: vi.fn(),
}))

import { DEFAULT_ASPECT_RATIO, GENERATION_POLL } from '@/constants/config'
import {
  checkImageGenerationStatusAPI,
  studioGenerateAPI,
} from '@/lib/api-client'
import { useCharacterImageGeneration } from '@/hooks/cards/use-character-image-generation'
import type { GenerationRecord } from '@/types'

const FAKE_GENERATION: GenerationRecord = {
  id: 'generation-1',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  outputType: 'IMAGE',
  status: 'COMPLETED',
  url: 'https://cdn.test/character.png',
  storageKey: 'generations/character.png',
  mimeType: 'image/png',
  width: 1024,
  height: 1024,
  prompt: 'cinematic explorer portrait',
  model: 'gemini-3.1-flash-image-preview',
  provider: 'Gemini',
  requestCount: 2,
  isPublic: false,
  isPromptPublic: false,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(studioGenerateAPI).mockResolvedValue({
    success: true,
    data: { jobId: 'job-image', requestId: 'request-image' },
  })
  vi.mocked(checkImageGenerationStatusAPI).mockResolvedValue({
    success: true,
    data: {
      jobId: 'job-image',
      status: 'COMPLETED',
      generation: FAKE_GENERATION,
    },
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useCharacterImageGeneration', () => {
  it('returns a generated image on success', async () => {
    const { result } = renderHook(() => useCharacterImageGeneration())
    let response: Awaited<ReturnType<typeof result.current.generate>>

    await act(async () => {
      response = await result.current.generate({
        modelId: FAKE_GENERATION.model,
        freePrompt: FAKE_GENERATION.prompt,
      })
    })

    expect(response!).toEqual({
      success: true,
      generation: FAKE_GENERATION,
      imageUrl: FAKE_GENERATION.url,
    })
    expect(studioGenerateAPI).toHaveBeenCalledWith({
      modelId: FAKE_GENERATION.model,
      apiKeyId: undefined,
      freePrompt: FAKE_GENERATION.prompt,
      aspectRatio: DEFAULT_ASPECT_RATIO,
      referenceImages: undefined,
      advancedParams: undefined,
    })
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('passes a saved-route apiKeyId through to studio generation', async () => {
    const { result } = renderHook(() => useCharacterImageGeneration())

    await act(async () => {
      await result.current.generate({
        modelId: FAKE_GENERATION.model,
        apiKeyId: 'key-123',
        freePrompt: FAKE_GENERATION.prompt,
        aspectRatio: '3:4',
      })
    })

    expect(studioGenerateAPI).toHaveBeenCalledWith({
      modelId: FAKE_GENERATION.model,
      apiKeyId: 'key-123',
      freePrompt: FAKE_GENERATION.prompt,
      aspectRatio: '3:4',
      referenceImages: undefined,
      advancedParams: undefined,
    })
  })

  it('passes reference images and LoRA advanced params through', async () => {
    const { result } = renderHook(() => useCharacterImageGeneration())

    await act(async () => {
      await result.current.generate({
        modelId: FAKE_GENERATION.model,
        freePrompt: FAKE_GENERATION.prompt,
        referenceImages: ['https://cdn.test/ref.png'],
        advancedParams: {
          loras: [{ url: 'https://cdn.test/lora.safetensors', scale: 0.8 }],
        },
      })
    })

    expect(studioGenerateAPI).toHaveBeenCalledWith({
      modelId: FAKE_GENERATION.model,
      apiKeyId: undefined,
      freePrompt: FAKE_GENERATION.prompt,
      aspectRatio: DEFAULT_ASPECT_RATIO,
      referenceImages: ['https://cdn.test/ref.png'],
      advancedParams: {
        loras: [{ url: 'https://cdn.test/lora.safetensors', scale: 0.8 }],
      },
    })
  })

  it('surfaces API errors and error codes', async () => {
    vi.mocked(studioGenerateAPI).mockResolvedValue({
      success: false,
      error: 'Missing API key',
      errorCode: 'MISSING_API_KEY',
      i18nKey: 'errors.missingApiKey',
    })

    const { result } = renderHook(() => useCharacterImageGeneration())
    let response: Awaited<ReturnType<typeof result.current.generate>>

    await act(async () => {
      response = await result.current.generate({
        modelId: FAKE_GENERATION.model,
        freePrompt: FAKE_GENERATION.prompt,
      })
    })

    expect(response!).toEqual({
      success: false,
      error: 'Missing API key',
      errorCode: 'MISSING_API_KEY',
      i18nKey: 'errors.missingApiKey',
    })
    expect(result.current.error).toBe('Missing API key')
    expect(result.current.errorCode).toBe('MISSING_API_KEY')
  })

  it('returns a fallback message when the API response has no generation', async () => {
    vi.mocked(studioGenerateAPI).mockResolvedValue({
      success: true,
    })

    const { result } = renderHook(() => useCharacterImageGeneration())
    let response: Awaited<ReturnType<typeof result.current.generate>>

    await act(async () => {
      response = await result.current.generate({
        modelId: FAKE_GENERATION.model,
        freePrompt: FAKE_GENERATION.prompt,
      })
    })

    expect(response!).toEqual({
      success: false,
      error: 'Character image generation failed',
      errorCode: undefined,
      i18nKey: undefined,
    })
    expect(result.current.error).toBe('Character image generation failed')
  })

  it('passes through FAILED status error fields instead of falling back', async () => {
    vi.mocked(checkImageGenerationStatusAPI).mockResolvedValue({
      success: true,
      data: {
        jobId: 'job-image',
        status: 'FAILED',
        error: 'Provider blocked this character image request',
        errorCode: 'content_filtered',
        i18nKey: 'errors.provider.contentFiltered',
      },
    })

    const { result } = renderHook(() => useCharacterImageGeneration())
    let response: Awaited<ReturnType<typeof result.current.generate>>

    await act(async () => {
      response = await result.current.generate({
        modelId: FAKE_GENERATION.model,
        freePrompt: FAKE_GENERATION.prompt,
      })
    })

    expect(response!).toEqual({
      success: false,
      error: 'Provider blocked this character image request',
      errorCode: 'content_filtered',
      i18nKey: 'errors.provider.contentFiltered',
    })
    expect(result.current.error).toBe(
      'Provider blocked this character image request',
    )
    expect(result.current.errorCode).toBe('content_filtered')
  })

  it('keeps polling exhaustion as pending instead of a provider failure', async () => {
    vi.useFakeTimers()
    vi.mocked(checkImageGenerationStatusAPI).mockResolvedValue({
      success: true,
      data: {
        jobId: 'job-image',
        status: 'IN_PROGRESS',
      },
    })

    const { result } = renderHook(() => useCharacterImageGeneration())
    let response: Awaited<ReturnType<typeof result.current.generate>>

    await act(async () => {
      const pendingResponse = result.current.generate({
        modelId: FAKE_GENERATION.model,
        freePrompt: FAKE_GENERATION.prompt,
      })
      await vi.runAllTimersAsync()
      response = await pendingResponse
    })

    expect(response!).toEqual({
      success: false,
      error: 'Character image generation failed',
      pending: true,
      jobId: 'job-image',
    })
    expect(result.current.errorCode).toBeNull()
    expect(response!).not.toMatchObject({
      errorCode: 'content_filtered',
      i18nKey: 'errors.provider.contentFiltered',
    })
  })

  it('retries transient status failures before giving up to pending', async () => {
    vi.useFakeTimers()
    // A persistently-throwing status endpoint is transient, not terminal: the
    // poller backs off and retries up to the tolerance, then hands the still-
    // running job back as pending (with its jobId) for later reconciliation —
    // it does NOT abandon the generation on the first network hiccup.
    vi.mocked(checkImageGenerationStatusAPI).mockRejectedValue(
      new Error('status service unavailable'),
    )

    const { result } = renderHook(() => useCharacterImageGeneration())
    let response: Awaited<ReturnType<typeof result.current.generate>>

    await act(async () => {
      const pendingResponse = result.current.generate({
        modelId: FAKE_GENERATION.model,
        freePrompt: FAKE_GENERATION.prompt,
      })
      await vi.runAllTimersAsync()
      response = await pendingResponse
    })

    expect(response!).toEqual({
      success: false,
      error: 'Character image generation failed',
      pending: true,
      jobId: 'job-image',
    })
    expect(response!).not.toHaveProperty('errorCode')
    expect(response!).not.toHaveProperty('i18nKey')
    expect(checkImageGenerationStatusAPI).toHaveBeenCalledTimes(
      GENERATION_POLL.TRANSIENT_TOLERANCE,
    )
  })

  it('resets stored error state', async () => {
    vi.mocked(studioGenerateAPI).mockRejectedValue(new Error('offline'))

    const { result } = renderHook(() => useCharacterImageGeneration())

    await act(async () => {
      await result.current.generate({
        modelId: FAKE_GENERATION.model,
        freePrompt: FAKE_GENERATION.prompt,
      })
    })
    act(() => {
      result.current.reset()
    })

    expect(result.current.error).toBeNull()
    expect(result.current.errorCode).toBeNull()
  })
})
