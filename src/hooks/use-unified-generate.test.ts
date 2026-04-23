import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

import { AUDIO_GENERATION } from '@/constants/config'
import { FAKE_GENERATION } from '@/test/api-helpers'

// ─── Mock dependencies ───────────────────────────────────────────

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('@/lib/api-client', () => ({
  studioGenerateAPI: vi.fn(),
  submitVideoAPI: vi.fn(),
  checkVideoStatusAPI: vi.fn(),
  generateAudioAPI: vi.fn(),
  checkAudioStatusAPI: vi.fn(),
  studioSelectWinnerAPI: vi.fn(),
}))

vi.mock('@/lib/api-error-message', () => ({
  getApiErrorMessage: vi.fn(
    (_tErrors: unknown, result: { error?: string }, fallback: string) =>
      result?.error ?? fallback,
  ),
}))

import { useUnifiedGenerate } from '@/hooks/use-unified-generate'
import {
  studioGenerateAPI,
  generateAudioAPI,
  checkAudioStatusAPI,
} from '@/lib/api-client'
import { toast } from 'sonner'

const mockStudioGenerate = vi.mocked(studioGenerateAPI)
const mockGenerateAudio = vi.mocked(generateAudioAPI)
const mockCheckAudioStatus = vi.mocked(checkAudioStatusAPI)

// ─── Fixtures ─────────────────────────────────────────────────────

const IMAGE_INPUT = {
  modelId: 'gemini-3.1-flash-image-preview',
  freePrompt: 'a red circle',
  aspectRatio: '1:1' as const,
}

const AUDIO_INPUT = {
  modelId: 'fish-audio-s2-pro',
  freePrompt: 'Hello world',
}

const SUCCESS_RESPONSE = {
  success: true as const,
  data: { generation: FAKE_GENERATION },
}

const ERROR_RESPONSE = {
  success: false as const,
  error: 'Provider unavailable',
  data: undefined,
}

// ─── Tests ────────────────────────────────────────────────────────

describe('useUnifiedGenerate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    // Stub crypto.randomUUID for deterministic test runs
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(
      '00000000-0000-0000-0000-000000000000',
    )
  })

  it('starts in idle state', () => {
    const { result } = renderHook(() => useUnifiedGenerate())

    expect(result.current.isGenerating).toBe(false)
    expect(result.current.stage).toBe('idle')
    expect(result.current.error).toBeNull()
    expect(result.current.lastGeneration).toBeNull()
    expect(result.current.activeRun).toBeNull()
  })

  it('generates image in single mode and returns generation', async () => {
    mockStudioGenerate.mockResolvedValue(SUCCESS_RESPONSE)

    const { result } = renderHook(() => useUnifiedGenerate())

    let gen: unknown
    await act(async () => {
      gen = await result.current.generate({
        mode: 'image',
        image: IMAGE_INPUT,
      })
    })

    expect(gen).toEqual(expect.objectContaining({ id: FAKE_GENERATION.id }))
    expect(result.current.lastGeneration?.id).toBe(FAKE_GENERATION.id)
    expect(result.current.isGenerating).toBe(false)
    expect(result.current.error).toBeNull()
    expect(mockStudioGenerate).toHaveBeenCalledWith(IMAGE_INPUT)
    expect(toast.success).toHaveBeenCalled()
  })

  it('sets error state when image generation fails', async () => {
    mockStudioGenerate.mockResolvedValue(ERROR_RESPONSE)

    const { result } = renderHook(() => useUnifiedGenerate())

    let gen: unknown
    await act(async () => {
      gen = await result.current.generate({
        mode: 'image',
        image: IMAGE_INPUT,
      })
    })

    expect(gen).toBeNull()
    expect(result.current.error).toBe('Provider unavailable')
    expect(result.current.lastGeneration).toBeNull()
    expect(result.current.isGenerating).toBe(false)
  })

  it('creates activeRun with correct mode for single image', async () => {
    mockStudioGenerate.mockResolvedValue(SUCCESS_RESPONSE)

    const { result } = renderHook(() => useUnifiedGenerate())

    await act(async () => {
      await result.current.generate({ mode: 'image', image: IMAGE_INPUT })
    })

    expect(result.current.activeRun).not.toBeNull()
    expect(result.current.activeRun?.mode).toBe('single')
    expect(result.current.activeRun?.items).toHaveLength(1)
    expect(result.current.activeRun?.items[0].status).toBe('completed')
  })

  it('generates audio and returns generation', async () => {
    mockGenerateAudio.mockResolvedValue(SUCCESS_RESPONSE)

    const { result } = renderHook(() => useUnifiedGenerate())

    let gen: unknown
    await act(async () => {
      gen = await result.current.generate({
        mode: 'audio',
        audio: AUDIO_INPUT,
      })
    })

    expect(gen).toEqual(expect.objectContaining({ id: FAKE_GENERATION.id }))
    expect(mockGenerateAudio).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'Hello world',
        modelId: 'fish-audio-s2-pro',
      }),
    )
  })

  it('polls async audio submit until generation is available', async () => {
    vi.useFakeTimers()
    mockGenerateAudio.mockResolvedValue({
      success: true,
      data: {
        jobId: 'job-audio-123',
      },
    })
    mockCheckAudioStatus
      .mockResolvedValueOnce({
        success: true,
        data: {
          jobId: 'job-audio-123',
          status: 'IN_QUEUE',
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          jobId: 'job-audio-123',
          status: 'COMPLETED',
          generation: FAKE_GENERATION,
        },
      })

    const { result } = renderHook(() => useUnifiedGenerate())

    let generationPromise: Promise<unknown> | undefined

    await act(async () => {
      generationPromise = result.current.generate({
        mode: 'audio',
        audio: AUDIO_INPUT,
      })
      await Promise.resolve()
    })

    expect(result.current.activeRun?.items[0].status).toBe('generating')
    expect(result.current.stage).toBe('queued')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUDIO_GENERATION.POLL_INTERVAL_MS)
    })
    expect(mockCheckAudioStatus).toHaveBeenCalledWith('job-audio-123')
    expect(result.current.stage).toBe('queued')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUDIO_GENERATION.POLL_INTERVAL_MS)
    })

    const generation = await generationPromise
    expect(generation).toEqual(
      expect.objectContaining({ id: FAKE_GENERATION.id }),
    )
    expect(result.current.lastGeneration?.id).toBe(FAKE_GENERATION.id)
    expect(result.current.activeRun?.items[0].status).toBe('completed')
    expect(result.current.activeRun?.items[0].generation?.id).toBe(
      FAKE_GENERATION.id,
    )
  })

  it('switches audio stage to processing when provider reports IN_PROGRESS', async () => {
    vi.useFakeTimers()
    mockGenerateAudio.mockResolvedValue({
      success: true,
      data: {
        jobId: 'job-audio-456',
      },
    })
    mockCheckAudioStatus
      .mockResolvedValueOnce({
        success: true,
        data: {
          jobId: 'job-audio-456',
          status: 'IN_PROGRESS',
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          jobId: 'job-audio-456',
          status: 'COMPLETED',
          generation: FAKE_GENERATION,
        },
      })

    const { result } = renderHook(() => useUnifiedGenerate())

    let generationPromise: Promise<unknown> | undefined

    await act(async () => {
      generationPromise = result.current.generate({
        mode: 'audio',
        audio: AUDIO_INPUT,
      })
      await Promise.resolve()
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUDIO_GENERATION.POLL_INTERVAL_MS)
    })

    expect(result.current.stage).toBe('processing')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUDIO_GENERATION.POLL_INTERVAL_MS)
    })

    await expect(generationPromise).resolves.toEqual(
      expect.objectContaining({ id: FAKE_GENERATION.id }),
    )
  })

  it('marks audio run failed when provider returns FAILED status', async () => {
    vi.useFakeTimers()
    mockGenerateAudio.mockResolvedValue({
      success: true,
      data: {
        jobId: 'job-audio-failed',
      },
    })
    mockCheckAudioStatus.mockResolvedValueOnce({
      success: true,
      data: {
        jobId: 'job-audio-failed',
        status: 'FAILED',
      },
    })

    const { result } = renderHook(() => useUnifiedGenerate())

    let generationPromise: Promise<unknown> | undefined

    await act(async () => {
      generationPromise = result.current.generate({
        mode: 'audio',
        audio: AUDIO_INPUT,
      })
      await Promise.resolve()
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUDIO_GENERATION.POLL_INTERVAL_MS)
    })

    await expect(generationPromise).resolves.toBeNull()
    expect(result.current.stage).toBe('idle')
    expect(result.current.error).toBe('generateFailed')
    expect(result.current.activeRun?.items[0].status).toBe('failed')
    expect(result.current.activeRun?.items[0].error).toBe('generateFailed')
  })

  it('marks audio run failed when async polling times out', async () => {
    vi.useFakeTimers()
    mockGenerateAudio.mockResolvedValue({
      success: true,
      data: {
        jobId: 'job-audio-timeout',
      },
    })
    mockCheckAudioStatus.mockResolvedValue({
      success: true,
      data: {
        jobId: 'job-audio-timeout',
        status: 'IN_QUEUE',
      },
    })

    const { result } = renderHook(() => useUnifiedGenerate())

    let generationPromise: Promise<unknown> | undefined

    await act(async () => {
      generationPromise = result.current.generate({
        mode: 'audio',
        audio: AUDIO_INPUT,
      })
      await Promise.resolve()
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(
        AUDIO_GENERATION.POLL_INTERVAL_MS *
          (AUDIO_GENERATION.MAX_POLL_ATTEMPTS + 1),
      )
    })

    await expect(generationPromise).resolves.toBeNull()
    expect(result.current.stage).toBe('idle')
    expect(result.current.error).toBe('generateFailed')
    expect(result.current.activeRun?.items[0].status).toBe('failed')
  })

  it('fails audio run when submit succeeds without generation or jobId', async () => {
    mockGenerateAudio.mockResolvedValue({
      success: true,
    })

    const { result } = renderHook(() => useUnifiedGenerate())

    let generation: unknown
    await act(async () => {
      generation = await result.current.generate({
        mode: 'audio',
        audio: AUDIO_INPUT,
      })
    })

    expect(generation).toBeNull()
    expect(result.current.stage).toBe('idle')
    expect(result.current.error).toBe('generateFailed')
    expect(result.current.activeRun?.items[0].status).toBe('failed')
    expect(result.current.activeRun?.items[0].error).toBe('generateFailed')
  })

  it('returns null when mode has no matching input', async () => {
    const { result } = renderHook(() => useUnifiedGenerate())

    let gen: unknown
    await act(async () => {
      gen = await result.current.generate({ mode: 'image' })
    })

    expect(gen).toBeNull()
  })

  it('retry re-sends the last request', async () => {
    mockStudioGenerate
      .mockResolvedValueOnce(ERROR_RESPONSE)
      .mockResolvedValueOnce(SUCCESS_RESPONSE)

    const { result } = renderHook(() => useUnifiedGenerate())

    await act(async () => {
      await result.current.generate({ mode: 'image', image: IMAGE_INPUT })
    })

    expect(result.current.error).toBe('Provider unavailable')

    await act(async () => {
      await result.current.retry()
    })

    expect(result.current.lastGeneration?.id).toBe(FAKE_GENERATION.id)
    expect(result.current.error).toBeNull()
    expect(mockStudioGenerate).toHaveBeenCalledTimes(2)
  })

  it('reset clears all state', async () => {
    mockStudioGenerate.mockResolvedValue(SUCCESS_RESPONSE)

    const { result } = renderHook(() => useUnifiedGenerate())

    await act(async () => {
      await result.current.generate({ mode: 'image', image: IMAGE_INPUT })
    })

    expect(result.current.lastGeneration).not.toBeNull()

    act(() => {
      result.current.reset()
    })

    expect(result.current.isGenerating).toBe(false)
    expect(result.current.stage).toBe('idle')
    expect(result.current.error).toBeNull()
    expect(result.current.lastGeneration).toBeNull()
    expect(result.current.activeRun).toBeNull()
  })
})
