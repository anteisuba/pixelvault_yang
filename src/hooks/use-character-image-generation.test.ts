import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/api-client', () => ({
  studioGenerateAPI: vi.fn(),
}))

import { DEFAULT_ASPECT_RATIO } from '@/constants/config'
import { studioGenerateAPI } from '@/lib/api-client'
import { useCharacterImageGeneration } from '@/hooks/use-character-image-generation'
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
})

describe('useCharacterImageGeneration', () => {
  it('returns a generated image on success', async () => {
    vi.mocked(studioGenerateAPI).mockResolvedValue({
      success: true,
      data: { generation: FAKE_GENERATION },
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
      success: true,
      generation: FAKE_GENERATION,
      imageUrl: FAKE_GENERATION.url,
    })
    expect(studioGenerateAPI).toHaveBeenCalledWith({
      modelId: FAKE_GENERATION.model,
      apiKeyId: undefined,
      freePrompt: FAKE_GENERATION.prompt,
      aspectRatio: DEFAULT_ASPECT_RATIO,
    })
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('passes a saved-route apiKeyId through to studio generation', async () => {
    vi.mocked(studioGenerateAPI).mockResolvedValue({
      success: true,
      data: { generation: FAKE_GENERATION },
    })

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
