import { describe, expect, it } from 'vitest'

import { AI_MODELS, MODEL_OPTIONS, type ModelOption } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'

import {
  buildFalVideoQueueRequest,
  type FalVideoRequestBuilderInput,
} from '@/services/providers/fal/video-request-builders'
import { buildFalWorkerQueueRequest } from '../../../../workers/execution/src/models/fal/video-request-builders'

const PROMPT = 'A precise cinematic prompt'
const REF = 'https://example.com/reference.png'

interface FalBodyCase {
  label: string
  modelId: AI_MODELS
  referenceImage?: string
  expectedEndpoint: string
  expectedMode: 'text-to-video' | 'image-to-video'
  expectedBody: Record<string, unknown>
  absentFields?: string[]
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
): FalVideoRequestBuilderInput {
  const model = getModel(modelId)
  return {
    prompt: PROMPT,
    modelId,
    externalModelId: model.externalModelId,
    aspectRatio: '16:9',
    duration: 5,
    referenceImage,
    i2vModelId: model.i2vModelId,
    videoDefaults: model.videoDefaults,
  }
}

function buildWorkerInput(modelId: AI_MODELS, referenceImage?: string) {
  const input = buildInput(modelId, referenceImage)
  return {
    providerInput: {
      prompt: input.prompt,
      modelId: input.modelId,
      externalModelId: input.externalModelId,
      aspectRatio: input.aspectRatio,
      duration: input.duration,
      referenceImage: input.referenceImage,
      i2vModelId: input.i2vModelId,
      videoDefaults: input.videoDefaults,
    },
  }
}

const falBodyCases: FalBodyCase[] = [
  {
    label: 'Kling V3 Pro T2V',
    modelId: AI_MODELS.KLING_V3_PRO,
    expectedEndpoint: 'fal-ai/kling-video/v3/pro/text-to-video',
    expectedMode: 'text-to-video',
    expectedBody: {
      prompt: PROMPT,
      duration: '5',
      generate_audio: true,
      aspect_ratio: '16:9',
      negative_prompt: 'blur, distort, and low quality',
      cfg_scale: 0.5,
    },
    absentFields: ['image_url', 'start_image_url'],
  },
  {
    label: 'Kling V3 Pro I2V',
    modelId: AI_MODELS.KLING_V3_PRO,
    referenceImage: REF,
    expectedEndpoint: 'fal-ai/kling-video/v3/pro/image-to-video',
    expectedMode: 'image-to-video',
    expectedBody: {
      prompt: PROMPT,
      start_image_url: REF,
      duration: '5',
      generate_audio: true,
      negative_prompt: 'blur, distort, and low quality',
      cfg_scale: 0.5,
    },
    absentFields: ['image_url', 'aspect_ratio'],
  },
  {
    label: 'Veo 3.1 T2V',
    modelId: AI_MODELS.VEO_31,
    expectedEndpoint: 'fal-ai/veo3.1',
    expectedMode: 'text-to-video',
    expectedBody: {
      prompt: PROMPT,
      aspect_ratio: '16:9',
      duration: '6s',
      resolution: '1080p',
      generate_audio: true,
    },
  },
  {
    label: 'Veo 3.1 reference-to-video',
    modelId: AI_MODELS.VEO_31,
    referenceImage: REF,
    expectedEndpoint: 'fal-ai/veo3.1/reference-to-video',
    expectedMode: 'image-to-video',
    expectedBody: {
      prompt: PROMPT,
      image_urls: [REF],
      aspect_ratio: '16:9',
      duration: '6s',
      resolution: '1080p',
      generate_audio: true,
    },
    absentFields: ['image_url'],
  },
  {
    label: 'Seedance 2.0 Fast T2V',
    modelId: AI_MODELS.SEEDANCE_20_FAST,
    expectedEndpoint: 'bytedance/seedance-2.0/fast/text-to-video',
    expectedMode: 'text-to-video',
    expectedBody: {
      prompt: PROMPT,
      resolution: '720p',
      duration: '5',
      aspect_ratio: '16:9',
      generate_audio: true,
    },
  },
  {
    label: 'Seedance 2.0 Fast I2V',
    modelId: AI_MODELS.SEEDANCE_20_FAST,
    referenceImage: REF,
    expectedEndpoint: 'bytedance/seedance-2.0/fast/image-to-video',
    expectedMode: 'image-to-video',
    expectedBody: {
      prompt: PROMPT,
      image_url: REF,
      resolution: '720p',
      duration: '5',
      aspect_ratio: '16:9',
      generate_audio: true,
    },
  },
  {
    label: 'Seedance 2.0 T2V',
    modelId: AI_MODELS.SEEDANCE_20,
    expectedEndpoint: 'bytedance/seedance-2.0/text-to-video',
    expectedMode: 'text-to-video',
    expectedBody: {
      prompt: PROMPT,
      resolution: '720p',
      duration: '5',
      aspect_ratio: '16:9',
      generate_audio: true,
    },
  },
  {
    label: 'Seedance 2.0 I2V',
    modelId: AI_MODELS.SEEDANCE_20,
    referenceImage: REF,
    expectedEndpoint: 'bytedance/seedance-2.0/image-to-video',
    expectedMode: 'image-to-video',
    expectedBody: {
      prompt: PROMPT,
      image_url: REF,
      resolution: '720p',
      duration: '5',
      aspect_ratio: '16:9',
      generate_audio: true,
    },
  },
  {
    label: 'HappyHorse 1.0 T2V',
    modelId: AI_MODELS.HAPPYHORSE_10,
    expectedEndpoint: 'alibaba/happy-horse/text-to-video',
    expectedMode: 'text-to-video',
    expectedBody: {
      prompt: PROMPT,
      resolution: '720p',
      duration: 5,
      aspect_ratio: '16:9',
    },
    absentFields: ['image_url', 'generate_audio'],
  },
  {
    label: 'HappyHorse 1.0 I2V',
    modelId: AI_MODELS.HAPPYHORSE_10,
    referenceImage: REF,
    expectedEndpoint: 'alibaba/happy-horse/image-to-video',
    expectedMode: 'image-to-video',
    expectedBody: {
      prompt: PROMPT,
      image_url: REF,
      resolution: '720p',
      duration: 5,
    },
    absentFields: ['aspect_ratio', 'generate_audio'],
  },
  {
    label: 'Seedance 2.0 Fast Reference',
    modelId: AI_MODELS.SEEDANCE_20_FAST_REFERENCE,
    referenceImage: REF,
    expectedEndpoint: 'bytedance/seedance-2.0/fast/reference-to-video',
    expectedMode: 'text-to-video',
    expectedBody: {
      prompt: PROMPT,
      image_urls: [REF],
      resolution: '720p',
      duration: '5',
      aspect_ratio: '16:9',
      generate_audio: true,
    },
    absentFields: ['image_url'],
  },
  {
    label: 'Seedance 2.0 Reference',
    modelId: AI_MODELS.SEEDANCE_20_REFERENCE,
    referenceImage: REF,
    expectedEndpoint: 'bytedance/seedance-2.0/reference-to-video',
    expectedMode: 'text-to-video',
    expectedBody: {
      prompt: PROMPT,
      image_urls: [REF],
      resolution: '720p',
      duration: '5',
      aspect_ratio: '16:9',
      generate_audio: true,
    },
    absentFields: ['image_url'],
  },
  {
    label: 'LTX 2.3 T2V',
    modelId: AI_MODELS.LTX_23,
    expectedEndpoint: 'fal-ai/ltx-2.3/text-to-video',
    expectedMode: 'text-to-video',
    expectedBody: {
      prompt: PROMPT,
      duration: '6',
      resolution: '1080p',
      generate_audio: true,
      aspect_ratio: '16:9',
    },
  },
  {
    label: 'LTX 2.3 I2V',
    modelId: AI_MODELS.LTX_23,
    referenceImage: REF,
    expectedEndpoint: 'fal-ai/ltx-2.3/image-to-video',
    expectedMode: 'image-to-video',
    expectedBody: {
      prompt: PROMPT,
      image_url: REF,
      duration: '6',
      resolution: '1080p',
      generate_audio: true,
    },
    absentFields: ['aspect_ratio'],
  },
]

describe('buildFalVideoQueueRequest', () => {
  it.each(falBodyCases)('builds $label body', (testCase) => {
    const request = buildFalVideoQueueRequest(
      buildInput(testCase.modelId, testCase.referenceImage),
    )

    expect(request.endpointModelId).toBe(testCase.expectedEndpoint)
    expect(request.mode).toBe(testCase.expectedMode)
    expect(request.isDocumentationVerified).toBe(true)
    expect(request.input).toMatchObject(testCase.expectedBody)

    for (const field of testCase.absentFields ?? []) {
      expect(request.input).not.toHaveProperty(field)
    }
  })

  it('rejects Seedance Reference without a reference image before hitting provider', () => {
    expect(() =>
      buildFalVideoQueueRequest(buildInput(AI_MODELS.SEEDANCE_20_REFERENCE)),
    ).toThrow(/requires a reference image/)
  })

  it('filters unsupported 1080p resolution for Seedance 2.0 Fast', () => {
    const input = buildInput(AI_MODELS.SEEDANCE_20_FAST)
    const request = buildFalVideoQueueRequest({
      ...input,
      resolution: '1080p',
    })

    expect(request.input).toMatchObject({ resolution: '720p' })
  })

  it('normalizes legacy Veo public ID before building queue requests', () => {
    const legacyVeo = buildFalVideoQueueRequest({
      ...buildInput(AI_MODELS.VEO_31),
      modelId: 'veo-3',
    })

    expect(legacyVeo.endpointModelId).toBe('fal-ai/veo3.1')
    expect(legacyVeo.input).toMatchObject({
      prompt: PROMPT,
      aspect_ratio: '16:9',
      resolution: '1080p',
    })
  })

  it('emits audio_urls for Seedance 2.0 Reference when provided', () => {
    const result = buildFalVideoQueueRequest({
      ...buildInput(AI_MODELS.SEEDANCE_20_REFERENCE, REF),
      audioUrls: ['https://example.com/voice-a.mp3'],
    })

    expect(result.input.image_urls).toEqual([REF])
    expect(result.input.audio_urls).toEqual(['https://example.com/voice-a.mp3'])
  })

  it('caps audio_urls at 3 entries for Seedance Reference', () => {
    const audioUrls = [
      'https://example.com/a.mp3',
      'https://example.com/b.mp3',
      'https://example.com/c.mp3',
      'https://example.com/d.mp3',
    ]
    const result = buildFalVideoQueueRequest({
      ...buildInput(AI_MODELS.SEEDANCE_20_FAST_REFERENCE, REF),
      audioUrls,
    })

    expect((result.input.audio_urls as string[]).length).toBe(3)
  })

  it('omits audio_urls when not provided', () => {
    const result = buildFalVideoQueueRequest(
      buildInput(AI_MODELS.SEEDANCE_20_REFERENCE, REF),
    )

    expect(result.input.audio_urls).toBeUndefined()
  })

  it('ignores audioUrls on non-Reference Seedance endpoints', () => {
    const result = buildFalVideoQueueRequest({
      ...buildInput(AI_MODELS.SEEDANCE_20_FAST, REF),
      audioUrls: ['https://example.com/voice.mp3'],
    })

    expect(result.input.audio_urls).toBeUndefined()
  })

  describe('@AudioN prompt injection on Seedance Reference', () => {
    it('prepends @Audio1 when audioUrls is set but the prompt has no @AudioN', () => {
      const result = buildFalVideoQueueRequest({
        ...buildInput(AI_MODELS.SEEDANCE_20_REFERENCE, REF),
        audioUrls: ['https://example.com/voice-a.mp3'],
      })

      expect(result.input.prompt).toBe(`@Audio1 ${PROMPT}`)
    })

    it('prepends @Audio1 @Audio2 for two audio URLs', () => {
      const result = buildFalVideoQueueRequest({
        ...buildInput(AI_MODELS.SEEDANCE_20_FAST_REFERENCE, REF),
        audioUrls: [
          'https://example.com/voice-a.mp3',
          'https://example.com/voice-b.mp3',
        ],
      })

      expect(result.input.prompt).toBe(`@Audio1 @Audio2 ${PROMPT}`)
    })

    it('leaves the prompt alone when the user already wrote @Audio1', () => {
      const userPrompt = 'narrator: @Audio1 says "hi"'
      const result = buildFalVideoQueueRequest({
        ...buildInput(AI_MODELS.SEEDANCE_20_REFERENCE, REF),
        prompt: userPrompt,
        audioUrls: ['https://example.com/voice-a.mp3'],
      })

      expect(result.input.prompt).toBe(userPrompt)
    })

    it('does not inject when audioUrls is empty', () => {
      const result = buildFalVideoQueueRequest(
        buildInput(AI_MODELS.SEEDANCE_20_REFERENCE, REF),
      )

      expect(result.input.prompt).toBe(PROMPT)
    })

    it('caps the prefix at @Audio3 even when 4 URLs are supplied', () => {
      const result = buildFalVideoQueueRequest({
        ...buildInput(AI_MODELS.SEEDANCE_20_REFERENCE, REF),
        audioUrls: [
          'https://example.com/a.mp3',
          'https://example.com/b.mp3',
          'https://example.com/c.mp3',
          'https://example.com/d.mp3',
        ],
      })

      expect(result.input.prompt).toBe(`@Audio1 @Audio2 @Audio3 ${PROMPT}`)
    })
  })

  describe('character-bound @AudioN injection on Seedance Reference', () => {
    it('labels @AudioN with the character name when audioBindings carries one', () => {
      const result = buildFalVideoQueueRequest({
        ...buildInput(AI_MODELS.SEEDANCE_20_REFERENCE, REF),
        audioBindings: [
          { url: 'https://example.com/alice.mp3', characterName: 'Alice' },
          { url: 'https://example.com/bob.mp3', characterName: 'Bob' },
        ],
      })

      expect(result.input.prompt).toBe(
        `Alice (@Audio1) Bob (@Audio2) ${PROMPT}`,
      )
      expect(result.input.audio_urls).toEqual([
        'https://example.com/alice.mp3',
        'https://example.com/bob.mp3',
      ])
    })

    it('mixes labeled and unlabeled bindings within the same prompt', () => {
      const result = buildFalVideoQueueRequest({
        ...buildInput(AI_MODELS.SEEDANCE_20_REFERENCE, REF),
        audioBindings: [
          { url: 'https://example.com/narrator.mp3' },
          { url: 'https://example.com/alice.mp3', characterName: 'Alice' },
        ],
      })

      expect(result.input.prompt).toBe(`@Audio1 Alice (@Audio2) ${PROMPT}`)
    })

    it('falls back to bare audioUrls when audioBindings is absent', () => {
      const result = buildFalVideoQueueRequest({
        ...buildInput(AI_MODELS.SEEDANCE_20_REFERENCE, REF),
        audioUrls: ['https://example.com/x.mp3'],
      })

      expect(result.input.prompt).toBe(`@Audio1 ${PROMPT}`)
    })

    it('prefers audioBindings when both audioBindings and audioUrls are given', () => {
      const result = buildFalVideoQueueRequest({
        ...buildInput(AI_MODELS.SEEDANCE_20_REFERENCE, REF),
        audioUrls: ['https://example.com/ignored.mp3'],
        audioBindings: [
          { url: 'https://example.com/alice.mp3', characterName: 'Alice' },
        ],
      })

      expect(result.input.audio_urls).toEqual(['https://example.com/alice.mp3'])
      expect(result.input.prompt).toBe(`Alice (@Audio1) ${PROMPT}`)
    })
  })

  describe('video_urls + @VideoN injection on Seedance Reference', () => {
    it('emits video_urls and prepends @Video1 when videoUrls is set', () => {
      const result = buildFalVideoQueueRequest({
        ...buildInput(AI_MODELS.SEEDANCE_20_REFERENCE, REF),
        videoUrls: ['https://example.com/clip-a.mp4'],
      })

      expect(result.input.video_urls).toEqual([
        'https://example.com/clip-a.mp4',
      ])
      expect(result.input.prompt).toBe(`@Video1 ${PROMPT}`)
    })

    it('caps video_urls at 3 and prepends @Video1 @Video2 @Video3', () => {
      const result = buildFalVideoQueueRequest({
        ...buildInput(AI_MODELS.SEEDANCE_20_FAST_REFERENCE, REF),
        videoUrls: [
          'https://example.com/a.mp4',
          'https://example.com/b.mp4',
          'https://example.com/c.mp4',
          'https://example.com/d.mp4',
        ],
      })

      expect((result.input.video_urls as string[]).length).toBe(3)
      expect(result.input.prompt).toBe(`@Video1 @Video2 @Video3 ${PROMPT}`)
    })

    it('leaves the prompt alone when the user already wrote @Video1', () => {
      const userPrompt = 'continue from @Video1 with new motion'
      const result = buildFalVideoQueueRequest({
        ...buildInput(AI_MODELS.SEEDANCE_20_REFERENCE, REF),
        prompt: userPrompt,
        videoUrls: ['https://example.com/clip.mp4'],
      })

      expect(result.input.prompt).toBe(userPrompt)
    })

    it('omits video_urls when not provided', () => {
      const result = buildFalVideoQueueRequest(
        buildInput(AI_MODELS.SEEDANCE_20_REFERENCE, REF),
      )

      expect(result.input.video_urls).toBeUndefined()
    })

    it('ignores videoUrls on non-Reference Seedance endpoints', () => {
      const result = buildFalVideoQueueRequest({
        ...buildInput(AI_MODELS.SEEDANCE_20_FAST, REF),
        videoUrls: ['https://example.com/clip.mp4'],
      })

      expect(result.input.video_urls).toBeUndefined()
    })

    it('combines @AudioN and @VideoN prefixes when both are supplied', () => {
      const result = buildFalVideoQueueRequest({
        ...buildInput(AI_MODELS.SEEDANCE_20_REFERENCE, REF),
        audioUrls: ['https://example.com/voice.mp3'],
        videoUrls: ['https://example.com/clip.mp4'],
      })

      expect(result.input.prompt).toBe(`@Video1 @Audio1 ${PROMPT}`)
      expect(result.input.audio_urls).toEqual(['https://example.com/voice.mp3'])
      expect(result.input.video_urls).toEqual(['https://example.com/clip.mp4'])
    })

    it('trims image_urls before video/audio when total exceeds fal cap of 12', () => {
      const nineImages = Array.from(
        { length: 9 },
        (_, i) => `https://example.com/img-${i}.png`,
      )
      const result = buildFalVideoQueueRequest({
        ...buildInput(AI_MODELS.SEEDANCE_20_REFERENCE, REF),
        referenceImages: nineImages,
        audioUrls: [
          'https://example.com/a.mp3',
          'https://example.com/b.mp3',
          'https://example.com/c.mp3',
        ],
        videoUrls: [
          'https://example.com/x.mp4',
          'https://example.com/y.mp4',
          'https://example.com/z.mp4',
        ],
      })

      expect((result.input.image_urls as string[]).length).toBe(6)
      expect((result.input.audio_urls as string[]).length).toBe(3)
      expect((result.input.video_urls as string[]).length).toBe(3)
    })
  })
})

describe('buildFalWorkerQueueRequest', () => {
  it.each(falBodyCases)('matches inline builder for $label', (testCase) => {
    const inline = buildFalVideoQueueRequest(
      buildInput(testCase.modelId, testCase.referenceImage),
    )
    const worker = buildFalWorkerQueueRequest(
      buildWorkerInput(testCase.modelId, testCase.referenceImage),
    )

    expect(worker).toEqual(inline)
  })

  it('keeps the source-of-truth FAL video model list fully covered', () => {
    const covered = new Set(falBodyCases.map((testCase) => testCase.modelId))
    const falVideoModels = MODEL_OPTIONS.filter(
      (model) =>
        model.adapterType === AI_ADAPTER_TYPES.FAL &&
        model.outputType === 'VIDEO',
    )

    expect(falVideoModels.map((model) => model.id).sort()).toEqual(
      Array.from(covered).sort(),
    )
  })

  it('matches inline legacy ID normalization for execution-worker requests', () => {
    const inline = buildFalVideoQueueRequest({
      ...buildInput(AI_MODELS.VEO_31),
      modelId: 'veo-3',
    })
    const worker = buildFalWorkerQueueRequest({
      providerInput: {
        ...buildWorkerInput(AI_MODELS.VEO_31).providerInput,
        modelId: 'veo-3',
      },
    })

    expect(worker).toEqual(inline)
  })

  describe('Veo 3.1 multi-reference', () => {
    const REF_A = 'https://example.com/a.png'
    const REF_B = 'https://example.com/b.png'
    const REF_C = 'https://example.com/c.png'
    const REF_D = 'https://example.com/d.png'

    function buildVeoInput(referenceImages: string[]) {
      const model = getModel(AI_MODELS.VEO_31)
      const input: FalVideoRequestBuilderInput = {
        prompt: PROMPT,
        modelId: AI_MODELS.VEO_31,
        externalModelId: model.externalModelId,
        aspectRatio: '16:9',
        duration: 5,
        referenceImage: referenceImages[0],
        referenceImages,
        i2vModelId: model.i2vModelId,
        videoDefaults: model.videoDefaults,
      }
      return input
    }

    it('passes the full referenceImages array through to image_urls', () => {
      const result = buildFalVideoQueueRequest(
        buildVeoInput([REF_A, REF_B, REF_C]),
      )
      expect(result.mode).toBe('image-to-video')
      expect(result.input.image_urls).toEqual([REF_A, REF_B, REF_C])
    })

    it('caps image_urls at 3 even when more references are supplied', () => {
      const result = buildFalVideoQueueRequest(
        buildVeoInput([REF_A, REF_B, REF_C, REF_D]),
      )
      expect(result.input.image_urls).toEqual([REF_A, REF_B, REF_C])
    })

    it('falls back to [referenceImage] when referenceImages is empty', () => {
      const model = getModel(AI_MODELS.VEO_31)
      const result = buildFalVideoQueueRequest({
        prompt: PROMPT,
        modelId: AI_MODELS.VEO_31,
        externalModelId: model.externalModelId,
        aspectRatio: '16:9',
        duration: 5,
        referenceImage: REF_A,
        referenceImages: [],
        i2vModelId: model.i2vModelId,
        videoDefaults: model.videoDefaults,
      })
      expect(result.input.image_urls).toEqual([REF_A])
    })
  })
})
