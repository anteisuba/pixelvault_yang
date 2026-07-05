import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/api-client', () => ({
  checkAudioStatusAPI: vi.fn(),
  checkImageGenerationStatusAPI: vi.fn(),
  checkVideoStatusAPI: vi.fn(),
  generateAudioAPI: vi.fn(),
  studioGenerateAPI: vi.fn(),
  submitVideoAPI: vi.fn(),
}))

import {
  DEFAULT_ASPECT_RATIO,
  GENERATION_POLL,
  VIDEO_GENERATION,
} from '@/constants/config'
import {
  checkAudioStatusAPI,
  checkImageGenerationStatusAPI,
  checkVideoStatusAPI,
  generateAudioAPI,
  studioGenerateAPI,
  submitVideoAPI,
} from '@/lib/api-client'
import { useNodeMediaGeneration } from '@/hooks/node/use-node-media-generation'
import type { GenerationRecord } from '@/types'

const IMAGE_GENERATION: GenerationRecord = {
  id: 'generation-image',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  outputType: 'IMAGE',
  status: 'COMPLETED',
  url: 'https://cdn.test/shot.png',
  storageKey: 'generations/shot.png',
  mimeType: 'image/png',
  width: 1024,
  height: 1024,
  prompt: 'shot prompt',
  model: 'gemini-3.1-flash-image-preview',
  provider: 'Gemini',
  requestCount: 2,
  isPublic: false,
  isPromptPublic: false,
}

const VIDEO_GENERATION_RECORD: GenerationRecord = {
  ...IMAGE_GENERATION,
  id: 'generation-video',
  outputType: 'VIDEO',
  url: 'https://cdn.test/clip.mp4',
  storageKey: 'generations/clip.mp4',
  mimeType: 'video/mp4',
  model: 'seedance-2.0',
}

const AUDIO_GENERATION_RECORD: GenerationRecord = {
  ...IMAGE_GENERATION,
  id: 'generation-audio',
  outputType: 'AUDIO',
  url: 'https://cdn.test/voice.mp3',
  storageKey: 'generations/voice.mp3',
  mimeType: 'audio/mpeg',
  model: 'fish-audio-s2-pro',
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useNodeMediaGeneration', () => {
  it('generates image media through studioGenerateAPI', async () => {
    vi.mocked(studioGenerateAPI).mockResolvedValue({
      success: true,
      data: { jobId: 'job-image', requestId: 'request-image' },
    })
    vi.mocked(checkImageGenerationStatusAPI).mockResolvedValue({
      success: true,
      data: {
        jobId: 'job-image',
        status: 'COMPLETED',
        generation: IMAGE_GENERATION,
      },
    })

    const { result } = renderHook(() => useNodeMediaGeneration())
    let response: Awaited<ReturnType<typeof result.current.generate>>

    await act(async () => {
      response = await result.current.generate({
        kind: 'image',
        modelId: IMAGE_GENERATION.model,
        prompt: IMAGE_GENERATION.prompt,
      })
    })

    expect(response!).toEqual({
      success: true,
      generation: IMAGE_GENERATION,
      mediaUrl: IMAGE_GENERATION.url,
    })
    expect(studioGenerateAPI).toHaveBeenCalledWith({
      modelId: IMAGE_GENERATION.model,
      apiKeyId: undefined,
      freePrompt: IMAGE_GENERATION.prompt,
      aspectRatio: DEFAULT_ASPECT_RATIO,
      referenceImages: undefined,
      advancedParams: undefined,
    })
  })

  it('generates video media through the queue and status API', async () => {
    vi.mocked(submitVideoAPI).mockResolvedValue({
      success: true,
      data: {
        jobId: 'job-video',
        requestId: 'request-video',
      },
    })
    vi.mocked(checkVideoStatusAPI).mockResolvedValue({
      success: true,
      data: {
        jobId: 'job-video',
        status: 'COMPLETED',
        generation: VIDEO_GENERATION_RECORD,
      },
    })

    const { result } = renderHook(() => useNodeMediaGeneration())

    await act(async () => {
      await result.current.generate({
        kind: 'video',
        modelId: VIDEO_GENERATION_RECORD.model,
        prompt: VIDEO_GENERATION_RECORD.prompt,
        apiKeyId: 'key-video',
      })
    })

    expect(submitVideoAPI).toHaveBeenCalledWith({
      modelId: VIDEO_GENERATION_RECORD.model,
      apiKeyId: 'key-video',
      prompt: VIDEO_GENERATION_RECORD.prompt,
      aspectRatio: VIDEO_GENERATION.DEFAULT_ASPECT_RATIO,
      duration: VIDEO_GENERATION.DEFAULT_DURATION,
      resolution: undefined,
      referenceImages: undefined,
      audioUrls: undefined,
      audioBindings: undefined,
      videoUrls: undefined,
    })
    expect(checkVideoStatusAPI).toHaveBeenCalledWith('job-video')
  })

  it('carries the provider poster frame back as thumbnailUrl (§9.1)', async () => {
    const videoWithThumbnail: GenerationRecord = {
      ...VIDEO_GENERATION_RECORD,
      thumbnailUrl: 'https://cdn.test/clip-thumb.webp',
    }
    vi.mocked(submitVideoAPI).mockResolvedValue({
      success: true,
      data: { jobId: 'job-video', requestId: 'request-video' },
    })
    vi.mocked(checkVideoStatusAPI).mockResolvedValue({
      success: true,
      data: {
        jobId: 'job-video',
        status: 'COMPLETED',
        generation: videoWithThumbnail,
      },
    })

    const { result } = renderHook(() => useNodeMediaGeneration())
    let response: Awaited<ReturnType<typeof result.current.generate>>

    await act(async () => {
      response = await result.current.generate({
        kind: 'video',
        modelId: videoWithThumbnail.model,
        prompt: videoWithThumbnail.prompt,
      })
    })

    expect(response!).toEqual({
      success: true,
      generation: videoWithThumbnail,
      mediaUrl: videoWithThumbnail.url,
      thumbnailUrl: videoWithThumbnail.thumbnailUrl,
    })
  })

  it('generates audio media through the queue and status API', async () => {
    vi.mocked(generateAudioAPI).mockResolvedValue({
      success: true,
      data: { jobId: 'job-audio', requestId: 'request-audio' },
    })
    vi.mocked(checkAudioStatusAPI).mockResolvedValue({
      success: true,
      data: {
        jobId: 'job-audio',
        status: 'COMPLETED',
        generation: AUDIO_GENERATION_RECORD,
      },
    })

    const { result } = renderHook(() => useNodeMediaGeneration())
    let response: Awaited<ReturnType<typeof result.current.generate>>

    await act(async () => {
      response = await result.current.generate({
        kind: 'audio',
        modelId: AUDIO_GENERATION_RECORD.model,
        prompt: AUDIO_GENERATION_RECORD.prompt,
        apiKeyId: 'key-audio',
        voiceId: 'fish-voice-test',
      })
    })

    expect(response!).toEqual({
      success: true,
      generation: AUDIO_GENERATION_RECORD,
      mediaUrl: AUDIO_GENERATION_RECORD.url,
    })
    expect(generateAudioAPI).toHaveBeenCalledWith({
      modelId: AUDIO_GENERATION_RECORD.model,
      apiKeyId: 'key-audio',
      prompt: AUDIO_GENERATION_RECORD.prompt,
      voiceId: 'fish-voice-test',
      referenceAudioUrl: undefined,
      referenceText: undefined,
    })
    expect(checkAudioStatusAPI).toHaveBeenCalledWith('job-audio')
  })

  it('passes through FAILED status error fields instead of falling back', async () => {
    vi.mocked(studioGenerateAPI).mockResolvedValue({
      success: true,
      data: { jobId: 'job-image', requestId: 'request-image' },
    })
    vi.mocked(checkImageGenerationStatusAPI).mockResolvedValue({
      success: true,
      data: {
        jobId: 'job-image',
        status: 'FAILED',
        error: 'Provider safety filter blocked the prompt',
        errorCode: 'content_filtered',
        i18nKey: 'errors.provider.contentFiltered',
      },
    })

    const { result } = renderHook(() => useNodeMediaGeneration())
    let response: Awaited<ReturnType<typeof result.current.generate>>

    await act(async () => {
      response = await result.current.generate({
        kind: 'image',
        modelId: IMAGE_GENERATION.model,
        prompt: IMAGE_GENERATION.prompt,
      })
    })

    expect(response!).toEqual({
      success: false,
      error: 'Provider safety filter blocked the prompt',
      errorCode: 'content_filtered',
      i18nKey: 'errors.provider.contentFiltered',
    })
    expect(response!).not.toMatchObject({
      error: 'Node media generation failed',
    })
  })

  it('keeps polling exhaustion as pending instead of a provider failure', async () => {
    vi.useFakeTimers()
    vi.mocked(submitVideoAPI).mockResolvedValue({
      success: true,
      data: {
        jobId: 'job-video',
        requestId: 'request-video',
      },
    })
    vi.mocked(checkVideoStatusAPI).mockResolvedValue({
      success: true,
      data: {
        jobId: 'job-video',
        status: 'IN_PROGRESS',
      },
    })

    const { result } = renderHook(() => useNodeMediaGeneration())
    let response: Awaited<ReturnType<typeof result.current.generate>>

    await act(async () => {
      const pendingResponse = result.current.generate({
        kind: 'video',
        modelId: VIDEO_GENERATION_RECORD.model,
        prompt: VIDEO_GENERATION_RECORD.prompt,
      })
      await vi.runAllTimersAsync()
      response = await pendingResponse
    })

    expect(response!).toEqual({
      success: false,
      error: 'Node media generation failed',
      pending: true,
      jobId: 'job-video',
    })
    expect(response!).not.toMatchObject({
      errorCode: 'content_filtered',
      i18nKey: 'errors.provider.contentFiltered',
    })
  })

  it('retries transient status failures before giving up to pending', async () => {
    vi.useFakeTimers()
    vi.mocked(generateAudioAPI).mockResolvedValue({
      success: true,
      data: { jobId: 'job-audio', requestId: 'request-audio' },
    })
    // A persistently-throwing status endpoint is transient, not terminal: the
    // poller backs off and retries up to the tolerance, then hands the still-
    // running job back as pending (with its jobId) for later reconciliation.
    vi.mocked(checkAudioStatusAPI).mockRejectedValue(
      new Error('status service unavailable'),
    )

    const { result } = renderHook(() => useNodeMediaGeneration())
    let response: Awaited<ReturnType<typeof result.current.generate>>

    await act(async () => {
      const pendingResponse = result.current.generate({
        kind: 'audio',
        modelId: AUDIO_GENERATION_RECORD.model,
        prompt: AUDIO_GENERATION_RECORD.prompt,
      })
      await vi.runAllTimersAsync()
      response = await pendingResponse
    })

    expect(response!).toEqual({
      success: false,
      error: 'Node media generation failed',
      pending: true,
      jobId: 'job-audio',
    })
    expect(response!).not.toHaveProperty('errorCode')
    expect(response!).not.toHaveProperty('i18nKey')
    expect(checkAudioStatusAPI).toHaveBeenCalledTimes(
      GENERATION_POLL.TRANSIENT_TOLERANCE,
    )
  })

  it('forwards prosody and emotion to generateAudioAPI', async () => {
    vi.mocked(generateAudioAPI).mockResolvedValue({
      success: true,
      data: { jobId: 'job-audio', requestId: 'request-audio' },
    })
    vi.mocked(checkAudioStatusAPI).mockResolvedValue({
      success: true,
      data: {
        jobId: 'job-audio',
        status: 'COMPLETED',
        generation: AUDIO_GENERATION_RECORD,
      },
    })

    const { result } = renderHook(() => useNodeMediaGeneration())
    await act(async () => {
      await result.current.generate({
        kind: 'audio',
        modelId: AUDIO_GENERATION_RECORD.model,
        prompt: AUDIO_GENERATION_RECORD.prompt,
        voiceId: 'fish-voice-test',
        speed: 1.4,
        volume: -3,
        emotion: 'angry',
        coverImageUrl: 'https://cdn.example.com/cover.png',
      })
    })

    expect(generateAudioAPI).toHaveBeenCalledWith(
      expect.objectContaining({
        speed: 1.4,
        volume: -3,
        emotion: 'angry',
        coverImageUrl: 'https://cdn.example.com/cover.png',
      }),
    )
  })

  it('forwards the negative prompt and generateAudio to submitVideoAPI', async () => {
    vi.mocked(submitVideoAPI).mockResolvedValue({
      success: true,
      data: { jobId: 'job-video', requestId: 'request-video' },
    })
    vi.mocked(checkVideoStatusAPI).mockResolvedValue({
      success: true,
      data: {
        jobId: 'job-video',
        status: 'COMPLETED',
        generation: VIDEO_GENERATION_RECORD,
      },
    })

    const { result } = renderHook(() => useNodeMediaGeneration())
    await act(async () => {
      await result.current.generate({
        kind: 'video',
        modelId: VIDEO_GENERATION_RECORD.model,
        prompt: VIDEO_GENERATION_RECORD.prompt,
        negativePrompt: 'blurry, low quality',
        generateAudio: false,
        seed: 12345,
      })
    })

    expect(submitVideoAPI).toHaveBeenCalledWith(
      expect.objectContaining({
        negativePrompt: 'blurry, low quality',
        generateAudio: false,
        seed: 12345,
      }),
    )
  })
})
