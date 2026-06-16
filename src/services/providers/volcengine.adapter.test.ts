import { describe, expect, it, vi } from 'vitest'

import { AI_PROVIDER_ENDPOINTS } from '@/constants/config'
import { AI_MODELS, MODEL_OPTIONS } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import type { VideoDefaults } from '@/constants/models'
import type { ProviderQueueSubmitInput } from '@/services/providers/types'

vi.mock('server-only', () => ({}))

import { buildVolcEngineVideoQueueBody } from './volcengine.adapter'

const PROMPT = 'A precise cinematic prompt'
const REF = 'https://example.com/reference.png'
const API_KEY = 'ark-test-key'

interface VolcVideoFixture {
  id: string
  externalModelId: string
  videoDefaults?: VideoDefaults
}

interface VolcBodyCase {
  label: string
  model: VolcVideoFixture
  referenceImage?: string
  expectedResolution: string
  expectedGenerateAudio?: boolean
}

const VOLC_VIDEO_FIXTURES = {
  seedance20: {
    id: 'doubao-seedance-2-0-260128',
    externalModelId: 'doubao-seedance-2-0-260128',
    videoDefaults: {
      generateAudio: true,
      resolution: '720p',
    },
  },
  seedance20Fast: {
    id: 'doubao-seedance-2-0-fast-260128',
    externalModelId: 'doubao-seedance-2-0-fast-260128',
    videoDefaults: {
      generateAudio: true,
      resolution: '720p',
    },
  },
  seedance15Pro: {
    id: 'doubao-seedance-1-5-pro-251215',
    externalModelId: 'doubao-seedance-1-5-pro-251215',
    videoDefaults: {
      generateAudio: true,
      resolution: '1080p',
    },
  },
  seedance10Pro: {
    id: 'doubao-seedance-1-0-pro-fast-251015',
    externalModelId: 'doubao-seedance-1-0-pro-fast-251015',
    videoDefaults: {
      resolution: '720p',
    },
  },
} satisfies Record<string, VolcVideoFixture>

function buildInput(
  model: VolcVideoFixture,
  referenceImage?: string,
): ProviderQueueSubmitInput {
  return {
    prompt: PROMPT,
    modelId: model.id,
    aspectRatio: '16:9',
    providerConfig: {
      label: 'VolcEngine',
      baseUrl: AI_PROVIDER_ENDPOINTS.VOLCENGINE,
    },
    apiKey: API_KEY,
    duration: 5,
    referenceImage,
    videoDefaults: model.videoDefaults,
  }
}

const volcBodyCases: VolcBodyCase[] = [
  {
    label: 'Seedance 2.0 Volc T2V',
    model: VOLC_VIDEO_FIXTURES.seedance20,
    expectedResolution: '720p',
    expectedGenerateAudio: true,
  },
  {
    label: 'Seedance 2.0 Volc I2V',
    model: VOLC_VIDEO_FIXTURES.seedance20,
    referenceImage: REF,
    expectedResolution: '720p',
    expectedGenerateAudio: true,
  },
  {
    label: 'Seedance 2.0 Fast Volc T2V',
    model: VOLC_VIDEO_FIXTURES.seedance20Fast,
    expectedResolution: '720p',
    expectedGenerateAudio: true,
  },
  {
    label: 'Seedance 2.0 Fast Volc I2V',
    model: VOLC_VIDEO_FIXTURES.seedance20Fast,
    referenceImage: REF,
    expectedResolution: '720p',
    expectedGenerateAudio: true,
  },
  {
    label: 'Seedance 1.5 Pro T2V',
    model: VOLC_VIDEO_FIXTURES.seedance15Pro,
    expectedResolution: '1080p',
    expectedGenerateAudio: true,
  },
  {
    label: 'Seedance 1.5 Pro I2V',
    model: VOLC_VIDEO_FIXTURES.seedance15Pro,
    referenceImage: REF,
    expectedResolution: '1080p',
    expectedGenerateAudio: true,
  },
  {
    label: 'Seedance 1.0 Pro T2V',
    model: VOLC_VIDEO_FIXTURES.seedance10Pro,
    expectedResolution: '720p',
  },
  {
    label: 'Seedance 1.0 Pro I2V',
    model: VOLC_VIDEO_FIXTURES.seedance10Pro,
    referenceImage: REF,
    expectedResolution: '720p',
  },
]

describe('buildVolcEngineVideoQueueBody', () => {
  it.each(volcBodyCases)('builds $label body', (testCase) => {
    const body = buildVolcEngineVideoQueueBody(
      buildInput(testCase.model, testCase.referenceImage),
    )

    expect(body).toMatchObject({
      model: testCase.model.externalModelId,
      ratio: '16:9',
      duration: 5,
      resolution: testCase.expectedResolution,
      return_last_frame: true,
      watermark: false,
    })

    if (testCase.expectedGenerateAudio === undefined) {
      expect(body).not.toHaveProperty('generate_audio')
    } else {
      expect(body).toMatchObject({
        generate_audio: testCase.expectedGenerateAudio,
      })
    }

    if (testCase.referenceImage) {
      expect(body.content).toEqual([
        { type: 'text', text: PROMPT },
        {
          type: 'image_url',
          image_url: { url: REF },
          role: 'first_frame',
        },
      ])
    } else {
      expect(body.content).toEqual([{ type: 'text', text: PROMPT }])
    }
  })

  it('filters unsupported 1080p for Seedance 2.0 Fast Volc', () => {
    const body = buildVolcEngineVideoQueueBody({
      ...buildInput(VOLC_VIDEO_FIXTURES.seedance20Fast),
      resolution: '1080p',
    })

    expect(body.resolution).toBe('720p')
  })

  it('exposes the direct VolcEngine Seedance video models', () => {
    const volcVideoModels = MODEL_OPTIONS.filter(
      (model) =>
        model.adapterType === AI_ADAPTER_TYPES.VOLCENGINE &&
        model.outputType === 'VIDEO',
    )

    const expectedIds = [
      AI_MODELS.SEEDANCE_20_FAST_VOLCENGINE,
      AI_MODELS.SEEDANCE_20_VOLCENGINE,
      AI_MODELS.SEEDANCE_20_FAST_REFERENCE_VOLCENGINE,
      AI_MODELS.SEEDANCE_20_REFERENCE_VOLCENGINE,
    ]

    expect(volcVideoModels).toHaveLength(expectedIds.length)
    expect(new Set(volcVideoModels.map((model) => model.id))).toEqual(
      new Set(expectedIds),
    )
    for (const model of volcVideoModels) {
      expect(model.outputType).toBe('VIDEO')
      expect(model.adapterType).toBe(AI_ADAPTER_TYPES.VOLCENGINE)
    }
  })
})

describe('buildVolcEngineVideoQueueBody reference-to-video', () => {
  const IMG1 = 'https://example.com/a.png'
  const IMG2 = 'https://example.com/b.png'
  const VID1 = 'https://example.com/clip.mp4'
  const AUD1 = 'https://example.com/voice.mp3'

  it('sends multiple images as reference_image (not first_frame)', () => {
    const body = buildVolcEngineVideoQueueBody({
      ...buildInput(VOLC_VIDEO_FIXTURES.seedance20),
      referenceImages: [IMG1, IMG2],
    })

    expect(body.content).toEqual([
      { type: 'text', text: PROMPT },
      { type: 'image_url', image_url: { url: IMG1 }, role: 'reference_image' },
      { type: 'image_url', image_url: { url: IMG2 }, role: 'reference_image' },
    ])
  })

  it('combines reference image, video and audio entries', () => {
    const body = buildVolcEngineVideoQueueBody({
      ...buildInput(VOLC_VIDEO_FIXTURES.seedance20, IMG1),
      videoUrls: [VID1],
      audioUrls: [AUD1],
    })

    expect(body.content).toEqual([
      { type: 'text', text: PROMPT },
      { type: 'image_url', image_url: { url: IMG1 }, role: 'reference_image' },
      { type: 'video_url', video_url: { url: VID1 }, role: 'reference_video' },
      { type: 'audio_url', audio_url: { url: AUD1 }, role: 'reference_audio' },
    ])
  })

  it('keeps a lone first frame as i2v (no reference roles)', () => {
    const body = buildVolcEngineVideoQueueBody(
      buildInput(VOLC_VIDEO_FIXTURES.seedance20, IMG1),
    )

    expect(body.content).toEqual([
      { type: 'text', text: PROMPT },
      { type: 'image_url', image_url: { url: IMG1 }, role: 'first_frame' },
    ])
  })

  it('drops reference audio when no image or video accompanies it', () => {
    const body = buildVolcEngineVideoQueueBody({
      ...buildInput(VOLC_VIDEO_FIXTURES.seedance20),
      audioUrls: [AUD1],
    })

    expect(body.content).toEqual([{ type: 'text', text: PROMPT }])
  })

  it('caps references at 9 images / 3 videos / 3 audio', () => {
    const body = buildVolcEngineVideoQueueBody({
      ...buildInput(VOLC_VIDEO_FIXTURES.seedance20),
      referenceImages: Array.from(
        { length: 12 },
        (_, index) => `https://img/${index}.png`,
      ),
      videoUrls: Array.from(
        { length: 5 },
        (_, index) => `https://vid/${index}.mp4`,
      ),
      audioUrls: Array.from(
        { length: 5 },
        (_, index) => `https://aud/${index}.mp3`,
      ),
    })

    const content = body.content as Array<{ role?: string }>
    expect(
      content.filter((item) => item.role === 'reference_image'),
    ).toHaveLength(9)
    expect(
      content.filter((item) => item.role === 'reference_video'),
    ).toHaveLength(3)
    expect(
      content.filter((item) => item.role === 'reference_audio'),
    ).toHaveLength(3)
  })
})
