import { createElement, type ReactNode } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

import { AUDIO_GENERATION, IMAGE_GENERATION } from '@/constants/config'
import { FAKE_GENERATION } from '@/test/api-helpers'
import type { GenerationRecord } from '@/types'

// ─── Mock dependencies ───────────────────────────────────────────

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}))

const mockSearchParams = new URLSearchParams()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => mockSearchParams,
}))

// The hook routes "view in gallery" toast actions through the locale-aware
// router; next-intl's createNavigation can't resolve in jsdom, so stub it.
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

vi.mock('@/lib/api-client', () => ({
  studioGenerateAPI: vi.fn(),
  checkImageGenerationStatusAPI: vi.fn(),
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
  getGenerationErrorMessage: vi.fn(
    (_tErrors: unknown, result: { error?: string }, fallback: string) =>
      result?.error ?? fallback,
  ),
}))

// LoraStackProvider now calls useAuth() to scope its localStorage slot
// per signed-in user. The test wrapper doesn't mount ClerkProvider, so
// stub useAuth into a stable signed-in state for these tests.
vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, userId: 'user_test_unified_generate' }),
}))

import { useUnifiedGenerate } from '@/hooks/use-unified-generate'
import { LoraStackProvider } from '@/hooks/use-active-lora-stack'
import {
  checkImageGenerationStatusAPI,
  studioGenerateAPI,
  generateAudioAPI,
  checkAudioStatusAPI,
} from '@/lib/api-client'
import { toast } from 'sonner'

const mockStudioGenerate = vi.mocked(studioGenerateAPI)
const mockCheckImageStatus = vi.mocked(checkImageGenerationStatusAPI)
const mockGenerateAudio = vi.mocked(generateAudioAPI)
const mockCheckAudioStatus = vi.mocked(checkAudioStatusAPI)

function wrapper({ children }: { children: ReactNode }) {
  return createElement(LoraStackProvider, null, children)
}

// ─── Fixtures ─────────────────────────────────────────────────────

const IMAGE_INPUT = {
  modelId: 'gemini-3.1-flash-image',
  freePrompt: 'a red circle',
  aspectRatio: '1:1' as const,
}

const AUDIO_INPUT = {
  modelId: 'fish-audio-s2-pro',
  freePrompt: 'Hello world',
}

const SUCCESS_IMAGE_SUBMIT_RESPONSE = {
  success: true as const,
  data: { jobId: 'job-image-123', requestId: 'request-image-123' },
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
    window.localStorage.clear()
    mockSearchParams.forEach((_, key) => mockSearchParams.delete(key))
    // Stub crypto.randomUUID for deterministic test runs
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(
      '00000000-0000-0000-0000-000000000000',
    )
    mockCheckImageStatus.mockResolvedValue({
      success: true,
      data: {
        jobId: 'job-image-123',
        status: 'COMPLETED',
        generation: FAKE_GENERATION,
      },
    })
  })

  it('starts in idle state', () => {
    const { result } = renderHook(() => useUnifiedGenerate(), { wrapper })

    expect(result.current.isGenerating).toBe(false)
    expect(result.current.stage).toBe('idle')
    expect(result.current.error).toBeNull()
    expect(result.current.lastGeneration).toBeNull()
    expect(result.current.activeRun).toBeNull()
  })

  it('generates image in single mode and returns generation', async () => {
    vi.useFakeTimers()
    mockStudioGenerate.mockResolvedValue(SUCCESS_IMAGE_SUBMIT_RESPONSE)

    const { result } = renderHook(() => useUnifiedGenerate(), { wrapper })

    let generationPromise: Promise<GenerationRecord | null>
    await act(async () => {
      generationPromise = result.current.generate({
        mode: 'image',
        image: IMAGE_INPUT,
      })
      await Promise.resolve()
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(IMAGE_GENERATION.POLL_INTERVAL_MS)
    })

    const gen = await generationPromise!
    expect(gen).toEqual(expect.objectContaining({ id: FAKE_GENERATION.id }))
    expect(result.current.lastGeneration?.id).toBe(FAKE_GENERATION.id)
    expect(result.current.isGenerating).toBe(false)
    expect(result.current.error).toBeNull()
    expect(mockStudioGenerate).toHaveBeenCalledWith(IMAGE_INPUT)
    // 审查 D1：完成提示必须带"查看作品"直达动作（结果的去向）。
    expect(toast.success).toHaveBeenCalledWith(
      'generateSuccess',
      expect.objectContaining({
        id: `generation-saved-${FAKE_GENERATION.id}`,
        action: expect.objectContaining({ label: 'viewInGallery' }),
      }),
    )
  })

  it('dedupes concurrent single image generate calls', async () => {
    vi.useFakeTimers()
    let resolveGeneration!: (
      value: typeof SUCCESS_IMAGE_SUBMIT_RESPONSE,
    ) => void
    mockStudioGenerate.mockReturnValue(
      new Promise((resolve) => {
        resolveGeneration = resolve
      }),
    )

    const { result } = renderHook(() => useUnifiedGenerate(), { wrapper })

    let first!: Promise<GenerationRecord | null>
    let second!: Promise<GenerationRecord | null>

    await act(async () => {
      first = result.current.generate({
        mode: 'image',
        image: IMAGE_INPUT,
      })
      second = result.current.generate({
        mode: 'image',
        image: IMAGE_INPUT,
      })
      await Promise.resolve()
    })

    expect(mockStudioGenerate).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveGeneration(SUCCESS_IMAGE_SUBMIT_RESPONSE)
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(IMAGE_GENERATION.POLL_INTERVAL_MS)
      await expect(first).resolves.toEqual(
        expect.objectContaining({ id: FAKE_GENERATION.id }),
      )
      await expect(second).resolves.toBeNull()
    })
  })

  it('sets error state when image generation fails', async () => {
    mockStudioGenerate.mockResolvedValue(ERROR_RESPONSE)

    const { result } = renderHook(() => useUnifiedGenerate(), { wrapper })

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
    vi.useFakeTimers()
    mockStudioGenerate.mockResolvedValue(SUCCESS_IMAGE_SUBMIT_RESPONSE)

    const { result } = renderHook(() => useUnifiedGenerate(), { wrapper })

    let generationPromise: Promise<GenerationRecord | null>
    await act(async () => {
      generationPromise = result.current.generate({
        mode: 'image',
        image: IMAGE_INPUT,
      })
      await Promise.resolve()
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(IMAGE_GENERATION.POLL_INTERVAL_MS)
    })
    await generationPromise!

    expect(result.current.activeRun).not.toBeNull()
    expect(result.current.activeRun?.mode).toBe('single')
    expect(result.current.activeRun?.items).toHaveLength(1)
    expect(result.current.activeRun?.items[0].status).toBe('completed')
  })

  it('recovers a completed image when polling times out (worker still succeeded)', async () => {
    vi.useFakeTimers()
    mockStudioGenerate.mockResolvedValue(SUCCESS_IMAGE_SUBMIT_RESPONSE)
    // Worker is slower than the poll window: every poll sees IN_PROGRESS, but
    // the authoritative status check after exhaustion sees COMPLETED. A
    // generated image must never be reported as a failure.
    let calls = 0
    mockCheckImageStatus.mockImplementation(async () => {
      calls += 1
      if (calls > IMAGE_GENERATION.MAX_POLL_ATTEMPTS) {
        return {
          success: true,
          data: {
            jobId: 'job-image-123',
            status: 'COMPLETED',
            generation: FAKE_GENERATION,
          },
        }
      }
      return {
        success: true,
        data: { jobId: 'job-image-123', status: 'IN_PROGRESS' },
      }
    })

    const { result } = renderHook(() => useUnifiedGenerate(), { wrapper })

    let generationPromise: Promise<GenerationRecord | null> | undefined
    await act(async () => {
      generationPromise = result.current.generate({
        mode: 'image',
        image: IMAGE_INPUT,
      })
      await Promise.resolve()
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(
        IMAGE_GENERATION.POLL_INTERVAL_MS *
          (IMAGE_GENERATION.MAX_POLL_ATTEMPTS + 1),
      )
    })

    await expect(generationPromise).resolves.toEqual(
      expect.objectContaining({ id: FAKE_GENERATION.id }),
    )
    expect(result.current.error).toBeNull()
    expect(result.current.activeRun?.items[0].status).toBe('completed')
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('does not report failure when polling times out but the job is still running', async () => {
    vi.useFakeTimers()
    mockStudioGenerate.mockResolvedValue(SUCCESS_IMAGE_SUBMIT_RESPONSE)
    // Job never reaches a terminal state within the poll window and the
    // authoritative check still sees it running — the worker may yet finish,
    // so this must NOT be surfaced as a failure.
    mockCheckImageStatus.mockResolvedValue({
      success: true,
      data: { jobId: 'job-image-123', status: 'IN_PROGRESS' },
    })

    const { result } = renderHook(() => useUnifiedGenerate(), { wrapper })

    let generationPromise: Promise<GenerationRecord | null> | undefined
    await act(async () => {
      generationPromise = result.current.generate({
        mode: 'image',
        image: IMAGE_INPUT,
      })
      await Promise.resolve()
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(
        IMAGE_GENERATION.POLL_INTERVAL_MS *
          (IMAGE_GENERATION.MAX_POLL_ATTEMPTS + 1),
      )
    })

    await expect(generationPromise).resolves.toBeNull()
    expect(result.current.error).toBeNull()
    expect(result.current.activeRun?.items[0].status).not.toBe('failed')
    expect(toast.error).not.toHaveBeenCalled()
    expect(toast.info).toHaveBeenCalled()
  })

  it('generates audio and returns generation', async () => {
    vi.useFakeTimers()
    mockGenerateAudio.mockResolvedValue({
      success: true,
      data: {
        jobId: 'job-audio-123',
      },
    })
    mockCheckAudioStatus.mockResolvedValue({
      success: true,
      data: {
        jobId: 'job-audio-123',
        status: 'COMPLETED',
        generation: FAKE_GENERATION,
      },
    })

    const { result } = renderHook(() => useUnifiedGenerate(), { wrapper })

    let generationPromise: Promise<GenerationRecord | null>
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

    const gen = await generationPromise!
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

    const { result } = renderHook(() => useUnifiedGenerate(), { wrapper })

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

    const { result } = renderHook(() => useUnifiedGenerate(), { wrapper })

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
        error: 'Provider reported unsafe input',
      },
    })

    const { result } = renderHook(() => useUnifiedGenerate(), { wrapper })

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
    expect(result.current.error).toBe('Provider reported unsafe input')
    expect(result.current.activeRun?.items[0].status).toBe('failed')
    expect(result.current.activeRun?.items[0].error).toBe(
      'Provider reported unsafe input',
    )
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

    const { result } = renderHook(() => useUnifiedGenerate(), { wrapper })

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
    expect(result.current.error).toBe('generation.provider_timeout')
    expect(result.current.activeRun?.items[0].status).toBe('failed')
  })

  it('fails audio run when submit succeeds without generation or jobId', async () => {
    mockGenerateAudio.mockResolvedValue({
      success: true,
    })

    const { result } = renderHook(() => useUnifiedGenerate(), { wrapper })

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
    const { result } = renderHook(() => useUnifiedGenerate(), { wrapper })

    let gen: unknown
    await act(async () => {
      gen = await result.current.generate({ mode: 'image' })
    })

    expect(gen).toBeNull()
  })

  it('retry re-sends the last request', async () => {
    vi.useFakeTimers()
    mockStudioGenerate
      .mockResolvedValueOnce(ERROR_RESPONSE)
      .mockResolvedValueOnce(SUCCESS_IMAGE_SUBMIT_RESPONSE)

    const { result } = renderHook(() => useUnifiedGenerate(), { wrapper })

    await act(async () => {
      await result.current.generate({ mode: 'image', image: IMAGE_INPUT })
    })

    expect(result.current.error).toBe('Provider unavailable')

    let retryPromise: Promise<GenerationRecord | null>
    await act(async () => {
      retryPromise = result.current.retry()
      await Promise.resolve()
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(IMAGE_GENERATION.POLL_INTERVAL_MS)
    })
    await retryPromise!

    expect(result.current.lastGeneration?.id).toBe(FAKE_GENERATION.id)
    expect(result.current.error).toBeNull()
    expect(mockStudioGenerate).toHaveBeenCalledTimes(2)
  })

  it('reset clears all state', async () => {
    vi.useFakeTimers()
    mockStudioGenerate.mockResolvedValue(SUCCESS_IMAGE_SUBMIT_RESPONSE)

    const { result } = renderHook(() => useUnifiedGenerate(), { wrapper })

    let generationPromise: Promise<GenerationRecord | null>
    await act(async () => {
      generationPromise = result.current.generate({
        mode: 'image',
        image: IMAGE_INPUT,
      })
      await Promise.resolve()
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(IMAGE_GENERATION.POLL_INTERVAL_MS)
    })
    await generationPromise!

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
