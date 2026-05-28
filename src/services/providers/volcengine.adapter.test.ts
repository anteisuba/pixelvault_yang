import { describe, expect, it, vi } from 'vitest'

import { AI_MODELS, MODEL_OPTIONS, type ModelOption } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import type { ProviderQueueSubmitInput } from '@/services/providers/types'

vi.mock('server-only', () => ({}))

import { buildVolcEngineVideoQueueBody } from './volcengine.adapter'

const PROMPT = 'A precise cinematic prompt'
const REF = 'https://example.com/reference.png'
const API_KEY = 'ark-test-key'

interface VolcBodyCase {
  label: string
  modelId: AI_MODELS
  referenceImage?: string
  expectedResolution: string
  expectedGenerateAudio?: boolean
}

function getModel(id: AI_MODELS): ModelOption {
  const model = MODEL_OPTIONS.find((item) => item.id === id)
  if (!model) {
    throw new Error(`Missing model fixture: ${id}`)
  }
  return model
}

function buildInput(
  modelId: AI_MODELS,
  referenceImage?: string,
): ProviderQueueSubmitInput {
  const model = getModel(modelId)
  return {
    prompt: PROMPT,
    modelId,
    aspectRatio: '16:9',
    providerConfig: model.providerConfig,
    apiKey: API_KEY,
    duration: 5,
    referenceImage,
    videoDefaults: model.videoDefaults,
  }
}

const volcBodyCases: VolcBodyCase[] = [
  {
    label: 'Seedance 2.0 Volc T2V',
    modelId: AI_MODELS.SEEDANCE_20_VOLC,
    expectedResolution: '720p',
    expectedGenerateAudio: true,
  },
  {
    label: 'Seedance 2.0 Volc I2V',
    modelId: AI_MODELS.SEEDANCE_20_VOLC,
    referenceImage: REF,
    expectedResolution: '720p',
    expectedGenerateAudio: true,
  },
  {
    label: 'Seedance 2.0 Fast Volc T2V',
    modelId: AI_MODELS.SEEDANCE_20_FAST_VOLC,
    expectedResolution: '720p',
    expectedGenerateAudio: true,
  },
  {
    label: 'Seedance 2.0 Fast Volc I2V',
    modelId: AI_MODELS.SEEDANCE_20_FAST_VOLC,
    referenceImage: REF,
    expectedResolution: '720p',
    expectedGenerateAudio: true,
  },
  {
    label: 'Seedance 1.5 Pro T2V',
    modelId: AI_MODELS.SEEDANCE_15_PRO,
    expectedResolution: '1080p',
    expectedGenerateAudio: true,
  },
  {
    label: 'Seedance 1.5 Pro I2V',
    modelId: AI_MODELS.SEEDANCE_15_PRO,
    referenceImage: REF,
    expectedResolution: '1080p',
    expectedGenerateAudio: true,
  },
  {
    label: 'Seedance 1.0 Pro T2V',
    modelId: AI_MODELS.SEEDANCE_10_PRO,
    expectedResolution: '720p',
  },
  {
    label: 'Seedance 1.0 Pro I2V',
    modelId: AI_MODELS.SEEDANCE_10_PRO,
    referenceImage: REF,
    expectedResolution: '720p',
  },
]

describe('buildVolcEngineVideoQueueBody', () => {
  it.each(volcBodyCases)('builds $label body', (testCase) => {
    const model = getModel(testCase.modelId)
    const body = buildVolcEngineVideoQueueBody(
      buildInput(testCase.modelId, testCase.referenceImage),
    )

    expect(body).toMatchObject({
      model: model.externalModelId,
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
      ...buildInput(AI_MODELS.SEEDANCE_20_FAST_VOLC),
      resolution: '1080p',
    })

    expect(body.resolution).toBe('720p')
  })

  it('keeps the source-of-truth VolcEngine video model list fully covered', () => {
    const covered = new Set(volcBodyCases.map((testCase) => testCase.modelId))
    const volcVideoModels = MODEL_OPTIONS.filter(
      (model) =>
        model.adapterType === AI_ADAPTER_TYPES.VOLCENGINE &&
        model.outputType === 'VIDEO',
    )

    expect(volcVideoModels.map((model) => model.id).sort()).toEqual(
      Array.from(covered).sort(),
    )
  })
})

describe('buildVolcEngineVideoQueueBody reference-to-video', () => {
  const IMG1 = 'https://example.com/a.png'
  const IMG2 = 'https://example.com/b.png'
  const VID1 = 'https://example.com/clip.mp4'
  const AUD1 = 'https://example.com/voice.mp3'

  it('sends multiple images as reference_image (not first_frame)', () => {
    const body = buildVolcEngineVideoQueueBody({
      ...buildInput(AI_MODELS.SEEDANCE_20_VOLC),
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
      ...buildInput(AI_MODELS.SEEDANCE_20_VOLC, IMG1),
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
      buildInput(AI_MODELS.SEEDANCE_20_VOLC, IMG1),
    )

    expect(body.content).toEqual([
      { type: 'text', text: PROMPT },
      { type: 'image_url', image_url: { url: IMG1 }, role: 'first_frame' },
    ])
  })

  it('drops reference audio when no image or video accompanies it', () => {
    const body = buildVolcEngineVideoQueueBody({
      ...buildInput(AI_MODELS.SEEDANCE_20_VOLC),
      audioUrls: [AUD1],
    })

    // ark rejects audio-only reference input, so the builder omits it.
    expect(body.content).toEqual([{ type: 'text', text: PROMPT }])
  })

  it('caps references at 9 images / 3 videos / 3 audio', () => {
    const body = buildVolcEngineVideoQueueBody({
      ...buildInput(AI_MODELS.SEEDANCE_20_VOLC),
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
