import { describe, expect, it, vi } from 'vitest'

import { AI_MODELS, MODEL_OPTIONS } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { getVideoModelCapabilities } from '@/constants/video-model-capabilities'
import { getVideoModelSendContract } from '@/constants/video-model-send-plan'

vi.mock('server-only', () => ({}))

import {
  buildMiniMaxVideoQueueBody,
  isMiniMaxReferenceModel,
} from './minimax.adapter'

const PROMPT = 'Image 1 is the protagonist walking through a sunlit garden'
const IMG = (n: number) => `https://example.com/image-${n}.png`
const VID = (n: number) => `https://example.com/clip-${n}.mp4`
const AUD = (n: number) => `https://example.com/voice-${n}.mp3`

type ContentEntry = { type: string; role?: string }

const contentOf = (body: Record<string, unknown>): ContentEntry[] =>
  body.content as ContentEntry[]

const rolesOf = (body: Record<string, unknown>, type: string): string[] =>
  contentOf(body)
    .filter((entry) => entry.type === type)
    .map((entry) => entry.role ?? '')

describe('buildMiniMaxVideoQueueBody', () => {
  it('always pins resolution to 2K — the only output H3 offers', () => {
    const body = buildMiniMaxVideoQueueBody({
      prompt: PROMPT,
      modelId: AI_MODELS.MINIMAX_H3,
      aspectRatio: '16:9',
    })

    expect(body.resolution).toBe('2K')
    expect(body.model).toBe('MiniMax-H3')
    expect(body.ratio).toBe('16:9')
  })

  it('clamps duration into 4–15 and falls back to 5 for the auto token', () => {
    const at = (duration: number | 'auto' | undefined) =>
      buildMiniMaxVideoQueueBody({
        prompt: PROMPT,
        modelId: AI_MODELS.MINIMAX_H3,
        aspectRatio: '16:9',
        duration,
      }).duration

    expect(at(1)).toBe(4)
    expect(at(99)).toBe(15)
    expect(at(7)).toBe(7)
    expect(at(7.4)).toBe(7)
    expect(at('auto')).toBe(5)
    expect(at(undefined)).toBe(5)
  })

  it('promotes a single image to first_frame on the base model', () => {
    const body = buildMiniMaxVideoQueueBody({
      prompt: PROMPT,
      modelId: AI_MODELS.MINIMAX_H3,
      aspectRatio: '16:9',
      referenceImage: IMG(1),
    })

    expect(rolesOf(body, 'image_url')).toEqual(['first_frame'])
  })

  it('ignores motion and voice references on the base model', () => {
    // The base id has no multimodal face; sending reference_video there is a
    // 400, so extra modalities must be dropped rather than forwarded.
    const body = buildMiniMaxVideoQueueBody({
      prompt: PROMPT,
      modelId: AI_MODELS.MINIMAX_H3,
      aspectRatio: '16:9',
      referenceImages: [IMG(1), IMG(2)],
      videoUrls: [VID(1)],
      audioUrls: [AUD(1)],
    })

    expect(rolesOf(body, 'image_url')).toEqual(['first_frame'])
    expect(rolesOf(body, 'video_url')).toEqual([])
    expect(rolesOf(body, 'audio_url')).toEqual([])
  })

  it('emits reference roles on the reference model, prompt entry first', () => {
    const body = buildMiniMaxVideoQueueBody({
      prompt: PROMPT,
      modelId: AI_MODELS.MINIMAX_H3_REFERENCE,
      aspectRatio: '16:9',
      referenceImages: [IMG(1), IMG(2)],
      videoUrls: [VID(1)],
      audioUrls: [AUD(1)],
    })

    const content = contentOf(body)
    expect(content[0]).toEqual({ type: 'text', text: PROMPT })
    expect(rolesOf(body, 'image_url')).toEqual([
      'reference_image',
      'reference_image',
    ])
    expect(rolesOf(body, 'video_url')).toEqual(['reference_video'])
    expect(rolesOf(body, 'audio_url')).toEqual(['reference_audio'])
  })

  it('preserves reference order — prompts cite them positionally', () => {
    const body = buildMiniMaxVideoQueueBody({
      prompt: PROMPT,
      modelId: AI_MODELS.MINIMAX_H3_REFERENCE_CN,
      aspectRatio: '16:9',
      referenceImages: [IMG(1), IMG(2), IMG(3)],
    })

    const urls = contentOf(body)
      .filter((entry) => entry.type === 'image_url')
      .map(
        (entry) =>
          (entry as unknown as { image_url: { url: string } }).image_url.url,
      )

    expect(urls).toEqual([IMG(1), IMG(2), IMG(3)])
  })

  it('caps each modality and the 12-file total', () => {
    const body = buildMiniMaxVideoQueueBody({
      prompt: PROMPT,
      modelId: AI_MODELS.MINIMAX_H3_REFERENCE,
      aspectRatio: '16:9',
      referenceImages: Array.from({ length: 20 }, (_, i) => IMG(i)),
      videoUrls: Array.from({ length: 5 }, (_, i) => VID(i)),
      audioUrls: Array.from({ length: 5 }, (_, i) => AUD(i)),
    })

    const images = rolesOf(body, 'image_url').length
    const videos = rolesOf(body, 'video_url').length
    const audio = rolesOf(body, 'audio_url').length

    expect(images).toBe(9)
    expect(videos).toBe(3)
    // 9 images + 3 videos already exhausts the 12-file budget.
    expect(audio).toBe(0)
    expect(images + videos + audio).toBeLessThanOrEqual(12)
  })

  it('drops audio when it would be the only reference', () => {
    // Provider rule: audio may never stand alone — such a payload 400s.
    const body = buildMiniMaxVideoQueueBody({
      prompt: PROMPT,
      modelId: AI_MODELS.MINIMAX_H3_REFERENCE,
      aspectRatio: '16:9',
      audioUrls: [AUD(1), AUD(2)],
    })

    expect(rolesOf(body, 'audio_url')).toEqual([])
    expect(contentOf(body)).toHaveLength(1)
  })

  it('keeps audio when a visual reference accompanies it', () => {
    const body = buildMiniMaxVideoQueueBody({
      prompt: PROMPT,
      modelId: AI_MODELS.MINIMAX_H3_REFERENCE,
      aspectRatio: '16:9',
      videoUrls: [VID(1)],
      audioUrls: [AUD(1)],
    })

    expect(rolesOf(body, 'video_url')).toEqual(['reference_video'])
    expect(rolesOf(body, 'audio_url')).toEqual(['reference_audio'])
  })

  it('honours an explicit externalModelId over the built-in default', () => {
    const body = buildMiniMaxVideoQueueBody({
      prompt: PROMPT,
      modelId: AI_MODELS.MINIMAX_H3,
      externalModelId: 'MiniMax-H3-Future',
      aspectRatio: '16:9',
    })

    expect(body.model).toBe('MiniMax-H3-Future')
  })
})

describe('isMiniMaxReferenceModel', () => {
  it('splits the reference ids from the base ids on both stations', () => {
    expect(isMiniMaxReferenceModel(AI_MODELS.MINIMAX_H3)).toBe(false)
    expect(isMiniMaxReferenceModel(AI_MODELS.MINIMAX_H3_CN)).toBe(false)
    expect(isMiniMaxReferenceModel(AI_MODELS.MINIMAX_H3_REFERENCE)).toBe(true)
    expect(isMiniMaxReferenceModel(AI_MODELS.MINIMAX_H3_REFERENCE_CN)).toBe(
      true,
    )
  })
})

describe('MiniMax H3 catalog wiring', () => {
  const MINIMAX_IDS = [
    AI_MODELS.MINIMAX_H3,
    AI_MODELS.MINIMAX_H3_REFERENCE,
    AI_MODELS.MINIMAX_H3_CN,
    AI_MODELS.MINIMAX_H3_REFERENCE_CN,
  ] as const

  it('routes each station to its own adapter type and base URL', () => {
    const byId = new Map(MODEL_OPTIONS.map((model) => [model.id, model]))

    expect(byId.get(AI_MODELS.MINIMAX_H3)?.adapterType).toBe(
      AI_ADAPTER_TYPES.MINIMAX,
    )
    expect(byId.get(AI_MODELS.MINIMAX_H3_CN)?.adapterType).toBe(
      AI_ADAPTER_TYPES.MINIMAX_CN,
    )
    expect(byId.get(AI_MODELS.MINIMAX_H3)?.providerConfig.baseUrl).toContain(
      'api.minimax.io',
    )
    expect(byId.get(AI_MODELS.MINIMAX_H3_CN)?.providerConfig.baseUrl).toContain(
      'api.minimaxi.com',
    )
  })

  it('declares 2K only — and never an empty resolution list', () => {
    // An empty supportedResolutions makes the server 400 outright, not merely
    // drop the picker, so this guard matters more than it looks.
    for (const id of MINIMAX_IDS) {
      const capabilities = getVideoModelCapabilities(id)
      expect(capabilities.supportedResolutions).toEqual(['2k'])
      expect(capabilities.supportedResolutions?.length).toBeGreaterThan(0)
    }
  })

  it('is sendable — the worker has a MiniMax branch', () => {
    for (const id of MINIMAX_IDS) {
      const adapterType = id.endsWith('-cn')
        ? AI_ADAPTER_TYPES.MINIMAX_CN
        : AI_ADAPTER_TYPES.MINIMAX
      const contract = getVideoModelSendContract(id, adapterType)
      expect(contract.family).toBe('minimax')
      expect(contract.execution).toBe('ready')
    }
  })

  it('exposes the 9/3/3-capped-at-12 slots only on the reference ids', () => {
    const reference = getVideoModelSendContract(
      AI_MODELS.MINIMAX_H3_REFERENCE,
      AI_ADAPTER_TYPES.MINIMAX,
    )
    expect(reference.slots).toMatchObject({
      images: 9,
      videos: 3,
      audio: 3,
      total: 12,
      audioRequiresVisual: true,
    })

    const base = getVideoModelSendContract(
      AI_MODELS.MINIMAX_H3,
      AI_ADAPTER_TYPES.MINIMAX,
    )
    expect(base.slots).toMatchObject({ images: 1, videos: 0, audio: 0 })
  })
})
