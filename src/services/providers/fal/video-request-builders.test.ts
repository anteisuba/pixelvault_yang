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
  isDocumentationVerified?: boolean
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
    label: 'Seedance Pro T2V',
    modelId: AI_MODELS.SEEDANCE_PRO,
    expectedEndpoint: 'fal-ai/bytedance/seedance/v1/pro/text-to-video',
    expectedMode: 'text-to-video',
    expectedBody: {
      prompt: PROMPT,
      duration: '5',
      aspect_ratio: '16:9',
    },
  },
  {
    label: 'Seedance Pro I2V',
    modelId: AI_MODELS.SEEDANCE_PRO,
    referenceImage: REF,
    expectedEndpoint: 'fal-ai/bytedance/seedance/v1/pro/image-to-video',
    expectedMode: 'image-to-video',
    expectedBody: {
      prompt: PROMPT,
      image_url: REF,
      duration: '5',
    },
    absentFields: ['aspect_ratio'],
  },
  {
    label: 'MiniMax Hailuo 2.3 T2V',
    modelId: AI_MODELS.MINIMAX_VIDEO,
    expectedEndpoint: 'fal-ai/minimax/hailuo-2.3/standard/text-to-video',
    expectedMode: 'text-to-video',
    expectedBody: {
      prompt: PROMPT,
      duration: '6',
      prompt_optimizer: true,
    },
    absentFields: ['aspect_ratio'],
  },
  {
    label: 'MiniMax Hailuo 2.3 I2V',
    modelId: AI_MODELS.MINIMAX_VIDEO,
    referenceImage: REF,
    expectedEndpoint: 'fal-ai/minimax/hailuo-2.3/standard/image-to-video',
    expectedMode: 'image-to-video',
    expectedBody: {
      prompt: PROMPT,
      image_url: REF,
      duration: '6',
      prompt_optimizer: true,
    },
    absentFields: ['aspect_ratio'],
  },
  {
    label: 'Luma Ray 2 T2V',
    modelId: AI_MODELS.LUMA_RAY_2,
    expectedEndpoint: 'fal-ai/luma-dream-machine/ray-2',
    expectedMode: 'text-to-video',
    expectedBody: {
      prompt: PROMPT,
      aspect_ratio: '16:9',
      duration: '5s',
      resolution: '720p',
    },
  },
  {
    label: 'Pika 2.5 T2V',
    modelId: AI_MODELS.PIKA_V25,
    expectedEndpoint: 'fal-ai/pika/v2.5/text-to-video',
    expectedMode: 'text-to-video',
    expectedBody: {
      prompt: PROMPT,
      duration: 5,
    },
    absentFields: ['aspect_ratio', 'image_url'],
  },
  {
    label: 'Pika 2.5 I2V',
    modelId: AI_MODELS.PIKA_V25,
    referenceImage: REF,
    expectedEndpoint: 'fal-ai/pika/v2.5/image-to-video',
    expectedMode: 'image-to-video',
    expectedBody: {
      prompt: PROMPT,
      image_url: REF,
      duration: 5,
    },
    absentFields: ['aspect_ratio'],
  },
  {
    label: 'Kling V2.1 Master T2V',
    modelId: AI_MODELS.KLING_VIDEO,
    expectedEndpoint: 'fal-ai/kling-video/v2.1/master/text-to-video',
    expectedMode: 'text-to-video',
    expectedBody: {
      prompt: PROMPT,
      duration: '5',
      aspect_ratio: '16:9',
      negative_prompt: 'blur, distort, and low quality',
      cfg_scale: 0.5,
    },
  },
  {
    label: 'Kling V2.1 Master I2V',
    modelId: AI_MODELS.KLING_VIDEO,
    referenceImage: REF,
    expectedEndpoint: 'fal-ai/kling-video/v2.1/master/image-to-video',
    expectedMode: 'image-to-video',
    expectedBody: {
      prompt: PROMPT,
      image_url: REF,
      duration: '5',
      negative_prompt: 'blur, distort, and low quality',
      cfg_scale: 0.5,
    },
    absentFields: ['aspect_ratio'],
  },
  {
    label: 'Runway Gen3 I2V',
    modelId: AI_MODELS.RUNWAY_GEN3,
    referenceImage: REF,
    expectedEndpoint: 'fal-ai/runway-gen3/turbo/image-to-video',
    expectedMode: 'image-to-video',
    expectedBody: {
      prompt: PROMPT,
      image_url: REF,
      aspect_ratio: '16:9',
      duration: '5',
    },
    isDocumentationVerified: false,
  },
  {
    label: 'Wan 2.6 T2V',
    modelId: AI_MODELS.WAN_VIDEO,
    expectedEndpoint: 'wan/v2.6/text-to-video',
    expectedMode: 'text-to-video',
    expectedBody: {
      prompt: PROMPT,
      aspect_ratio: '16:9',
      resolution: '720p',
      duration: '5',
    },
  },
  {
    label: 'Wan 2.6 I2V',
    modelId: AI_MODELS.WAN_VIDEO,
    referenceImage: REF,
    expectedEndpoint: 'wan/v2.6/image-to-video',
    expectedMode: 'image-to-video',
    expectedBody: {
      prompt: PROMPT,
      image_url: REF,
      resolution: '720p',
      duration: '5',
    },
    absentFields: ['aspect_ratio'],
  },
  {
    label: 'Hunyuan T2V',
    modelId: AI_MODELS.HUNYUAN_VIDEO,
    expectedEndpoint: 'fal-ai/hunyuan-video',
    expectedMode: 'text-to-video',
    expectedBody: {
      prompt: PROMPT,
      aspect_ratio: '16:9',
    },
    absentFields: ['duration', 'resolution'],
  },
  {
    label: 'Hunyuan I2V',
    modelId: AI_MODELS.HUNYUAN_VIDEO,
    referenceImage: REF,
    expectedEndpoint: 'fal-ai/hunyuan-video-image-to-video',
    expectedMode: 'image-to-video',
    expectedBody: {
      prompt: PROMPT,
      image_url: REF,
      aspect_ratio: '16:9',
      resolution: '720p',
    },
    absentFields: ['duration'],
  },
]

describe('buildFalVideoQueueRequest', () => {
  it.each(falBodyCases)('builds $label body', (testCase) => {
    const request = buildFalVideoQueueRequest(
      buildInput(testCase.modelId, testCase.referenceImage),
    )

    expect(request.endpointModelId).toBe(testCase.expectedEndpoint)
    expect(request.mode).toBe(testCase.expectedMode)
    expect(request.isDocumentationVerified).toBe(
      testCase.isDocumentationVerified ?? true,
    )
    expect(request.input).toMatchObject(testCase.expectedBody)

    for (const field of testCase.absentFields ?? []) {
      expect(request.input).not.toHaveProperty(field)
    }
  })

  it('rejects Runway Gen3 without a reference image before hitting provider', () => {
    expect(() =>
      buildFalVideoQueueRequest(buildInput(AI_MODELS.RUNWAY_GEN3)),
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

  it('normalizes legacy Veo and Pika public IDs before building queue requests', () => {
    const legacyVeo = buildFalVideoQueueRequest({
      ...buildInput(AI_MODELS.VEO_31),
      modelId: 'veo-3',
    })
    const legacyPika = buildFalVideoQueueRequest({
      ...buildInput(AI_MODELS.PIKA_V25, REF),
      modelId: 'pika-v2.2',
    })

    expect(legacyVeo.endpointModelId).toBe('fal-ai/veo3.1')
    expect(legacyVeo.input).toMatchObject({
      prompt: PROMPT,
      aspect_ratio: '16:9',
      resolution: '1080p',
    })
    expect(legacyPika.endpointModelId).toBe('fal-ai/pika/v2.5/image-to-video')
    expect(legacyPika.input).toMatchObject({
      prompt: PROMPT,
      image_url: REF,
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
})
