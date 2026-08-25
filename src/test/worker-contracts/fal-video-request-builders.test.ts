/**
 * worker-contracts —— 死执行链清理 Step 1（只加不删）。
 *
 * 生产的视频请求构造逻辑住在 `workers/execution/src/models/**`（execution
 * worker 是真实发请求给 provider 的那一路）；`src/services/providers/**` 下
 * 同名的 builder（这里是 `fal/video-request-builders.ts` 的
 * `buildFalVideoQueueRequest`）是已经漂移的死 fork，不再被生产调用。
 *
 * 但 worker 自己的 vitest（`workers/execution/vitest.config.ts`）不解析 `@/`
 * 别名，测不了依赖 `MODEL_OPTIONS` 这类 fixture 的用例 —— 所以这类契约测试只能
 * 住在根 vitest suite 里，靠跨目录相对路径直接 import worker 的源文件（根
 * `vitest.config.ts` 的 `exclude: ['workers/**']` 只排除该目录下的**测试文件**，
 * 不阻止 import，`src/services/providers/fal/video-request-builders.test.ts`
 * 已经这么做了）。
 *
 * 本文件断言的是 `workers/execution/src/models/fal/video-request-builders.ts`
 * 的真实导出 `buildFalWorkerQueueRequest`，不再调用 src 侧的死 fork——
 * `falBodyCases` 里的期望值就是业务真相（两侧此前逐条 `.toEqual` 比对全绿，
 * 详见被这份文件取代的差分测试）。
 */
import { describe, expect, it } from 'vitest'

import { AI_MODELS, MODEL_OPTIONS, type ModelOption } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'

import {
  buildFalWorkerQueueRequest,
  type FalWorkerVideoRequestContext,
} from '../../../workers/execution/src/models/fal/video-request-builders'

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

type ProviderInputOverrides = Partial<
  FalWorkerVideoRequestContext['providerInput']
>

/**
 * 直接产出 worker 的 `FalWorkerVideoRequestContext` —— 不再像原 src 测试那样
 * 先造一份 src 侧输入再转换一次，因为这份契约文件根本不碰 src 的死 fork。
 */
function buildWorkerInput(
  modelId: AI_MODELS,
  referenceImage?: string,
  overrides: ProviderInputOverrides = {},
): FalWorkerVideoRequestContext {
  const model = getModel(modelId)
  return {
    providerInput: {
      prompt: PROMPT,
      modelId,
      externalModelId: model.externalModelId,
      aspectRatio: '16:9',
      duration: 5,
      referenceImage,
      i2vModelId: model.i2vModelId,
      videoDefaults: model.videoDefaults,
      ...overrides,
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
    label: 'Kling O3 Pro T2V',
    modelId: AI_MODELS.KLING_O3_PRO,
    expectedEndpoint: 'fal-ai/kling-video/o3/pro/text-to-video',
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
    label: 'Kling O3 Pro I2V',
    modelId: AI_MODELS.KLING_O3_PRO,
    referenceImage: REF,
    expectedEndpoint: 'fal-ai/kling-video/o3/pro/image-to-video',
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
    label: 'HappyHorse v1.1 T2V',
    modelId: AI_MODELS.HAPPYHORSE_10,
    expectedEndpoint: 'alibaba/happy-horse/v1.1/text-to-video',
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
    label: 'HappyHorse v1.1 I2V',
    modelId: AI_MODELS.HAPPYHORSE_10,
    referenceImage: REF,
    expectedEndpoint: 'alibaba/happy-horse/v1.1/image-to-video',
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
    label: 'Wan 3.0 T2V',
    modelId: AI_MODELS.WAN_30,
    expectedEndpoint: 'alibaba/wan-3.0/text-to-video',
    expectedMode: 'text-to-video',
    expectedBody: {
      prompt: PROMPT,
      resolution: '720p',
      duration: 5,
      audio: true,
      aspect_ratio: '16:9',
    },
    // `audio` is Wan's switch — `generate_audio` is Seedance/LTX naming and
    // must never leak in. `negative_prompt` is absent from all three Wan
    // schemas, so it must never be emitted either.
    absentFields: [
      'generate_audio',
      'image_url',
      'start_image_url',
      'negative_prompt',
    ],
  },
  {
    label: 'Wan 3.0 I2V',
    modelId: AI_MODELS.WAN_30,
    referenceImage: REF,
    expectedEndpoint: 'alibaba/wan-3.0/image-to-video',
    expectedMode: 'image-to-video',
    expectedBody: {
      prompt: PROMPT,
      start_image_url: REF,
      resolution: '720p',
      duration: 5,
      audio: true,
    },
    // `image_url` would be the wrong field name; `aspect_ratio` is omitted so
    // fal's `adaptive` default follows the input frame.
    absentFields: [
      'image_url',
      'aspect_ratio',
      'end_image_url',
      'generate_audio',
      'negative_prompt',
    ],
  },
  {
    label: 'Wan 3.0 Reference',
    modelId: AI_MODELS.WAN_30_REFERENCE,
    referenceImage: REF,
    expectedEndpoint: 'alibaba/wan-3.0/reference-to-video',
    // No i2vModelId on this entry, so the reference endpoint stays in
    // text-to-video mode and carries its references as arrays instead.
    expectedMode: 'text-to-video',
    expectedBody: {
      prompt: PROMPT,
      resolution: '720p',
      duration: 5,
      audio: true,
      aspect_ratio: '16:9',
      reference_image_urls: [REF],
    },
    absentFields: [
      'image_urls',
      'start_image_url',
      'generate_audio',
      'negative_prompt',
    ],
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
    label: 'Seedance 2.5 T2V',
    modelId: AI_MODELS.SEEDANCE_25,
    expectedEndpoint: 'bytedance/seedance-2.5/text-to-video',
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
    label: 'Seedance 2.5 Reference',
    modelId: AI_MODELS.SEEDANCE_25_REFERENCE,
    referenceImage: REF,
    expectedEndpoint: 'bytedance/seedance-2.5/reference-to-video',
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

describe('buildFalWorkerQueueRequest — per-model bodies', () => {
  it.each(falBodyCases)('builds $label body', (testCase) => {
    const request = buildFalWorkerQueueRequest(
      buildWorkerInput(testCase.modelId, testCase.referenceImage),
    )

    expect(request.endpointModelId).toBe(testCase.expectedEndpoint)
    expect(request.mode).toBe(testCase.expectedMode)
    expect(request.isDocumentationVerified).toBe(true)
    expect(request.input).toMatchObject(testCase.expectedBody)

    for (const field of testCase.absentFields ?? []) {
      expect(request.input).not.toHaveProperty(field)
    }
  })

  it('rejects Seedance Reference without a reference image or video before hitting provider', () => {
    expect(() =>
      buildFalWorkerQueueRequest(
        buildWorkerInput(AI_MODELS.SEEDANCE_20_REFERENCE),
      ),
    ).toThrow(/requires at least one reference image or video/)
  })

  it('accepts a video-only Seedance Reference request', () => {
    const result = buildFalWorkerQueueRequest(
      buildWorkerInput(AI_MODELS.SEEDANCE_20_REFERENCE, undefined, {
        videoUrls: ['https://example.com/clip.mp4'],
      }),
    )

    expect(result.input.image_urls).toBeUndefined()
    expect(result.input.video_urls).toEqual(['https://example.com/clip.mp4'])
    expect(result.input.prompt).toBe(`@Video1 ${PROMPT}`)
  })

  it('filters unsupported 1080p resolution for Seedance 2.0 Fast', () => {
    const request = buildFalWorkerQueueRequest(
      buildWorkerInput(AI_MODELS.SEEDANCE_20_FAST, undefined, {
        resolution: '1080p',
      }),
    )

    expect(request.input).toMatchObject({ resolution: '720p' })
  })

  it('uses the public Seedance 2.5 I2V schema, including an optional end frame', () => {
    const endFrame = 'https://example.com/end.png'
    const result = buildFalWorkerQueueRequest(
      buildWorkerInput(AI_MODELS.SEEDANCE_25, REF, {
        duration: 30,
        referenceImages: [REF, endFrame],
      }),
    )

    expect(result.endpointModelId).toBe('bytedance/seedance-2.5/image-to-video')
    expect(result.input).toMatchObject({
      image_url: REF,
      end_image_url: endFrame,
      aspect_ratio: 'auto',
      duration: '30',
      resolution: '720p',
    })
  })

  it('keeps Seedance 2.5 reference limits at 30/10/10 with a 50-file cap', () => {
    const images = Array.from(
      { length: 35 },
      (_, i) => `https://example.com/image-${i}.png`,
    )
    const videos = Array.from(
      { length: 12 },
      (_, i) => `https://example.com/video-${i}.mp4`,
    )
    const audio = Array.from(
      { length: 12 },
      (_, i) => `https://example.com/audio-${i}.mp3`,
    )
    const result = buildFalWorkerQueueRequest(
      buildWorkerInput(AI_MODELS.SEEDANCE_25_REFERENCE, REF, {
        duration: 30,
        referenceImages: images,
        videoUrls: videos,
        audioUrls: audio,
      }),
    )

    expect(result.input.duration).toBe('30')
    expect(result.input.image_urls).toHaveLength(30)
    expect(result.input.video_urls).toHaveLength(10)
    expect(result.input.audio_urls).toHaveLength(10)
  })

  it('sends a Wan 3.0 end frame from referenceImages[1]', () => {
    const endFrame = 'https://example.com/end.png'
    const result = buildFalWorkerQueueRequest(
      buildWorkerInput(AI_MODELS.WAN_30, REF, {
        referenceImages: [REF, endFrame],
      }),
    )

    expect(result.endpointModelId).toBe('alibaba/wan-3.0/image-to-video')
    expect(result.input).toMatchObject({
      start_image_url: REF,
      end_image_url: endFrame,
    })
  })

  it('clamps Wan 3.0 duration into the published [2, 30] range', () => {
    const long = buildFalWorkerQueueRequest(
      buildWorkerInput(AI_MODELS.WAN_30, undefined, { duration: 45 }),
    )
    const short = buildFalWorkerQueueRequest(
      buildWorkerInput(AI_MODELS.WAN_30, undefined, { duration: 1 }),
    )

    expect(long.input.duration).toBe(30)
    expect(short.input.duration).toBe(2)
  })

  it('keeps every Wan 3.0 resolution tier the schema publishes', () => {
    for (const resolution of ['480p', '720p', '1080p'] as const) {
      const result = buildFalWorkerQueueRequest(
        buildWorkerInput(AI_MODELS.WAN_30, undefined, { resolution }),
      )
      expect(result.input.resolution).toBe(resolution)
    }
  })

  it('uses Wan 3.0 reference_* field names, not the Seedance ones', () => {
    const result = buildFalWorkerQueueRequest(
      buildWorkerInput(AI_MODELS.WAN_30_REFERENCE, REF, {
        videoUrls: ['https://example.com/clip.mp4'],
        audioUrls: ['https://example.com/voice.mp3'],
      }),
    )

    expect(result.endpointModelId).toBe('alibaba/wan-3.0/reference-to-video')
    expect(result.input).toMatchObject({
      reference_image_urls: [REF],
      reference_video_urls: ['https://example.com/clip.mp4'],
      reference_audio_urls: ['https://example.com/voice.mp3'],
    })
    expect(result.input).not.toHaveProperty('image_urls')
    expect(result.input).not.toHaveProperty('video_urls')
    expect(result.input).not.toHaveProperty('audio_urls')
  })

  it('leaves the Wan 3.0 reference prompt untouched — no @ImageN injection', () => {
    // Wan addresses references as `Image 1`, not `@Image1`. Until that is
    // verified against a live run, the builder must not invent either form.
    const result = buildFalWorkerQueueRequest(
      buildWorkerInput(AI_MODELS.WAN_30_REFERENCE, REF, {
        audioUrls: ['https://example.com/voice.mp3'],
        videoUrls: ['https://example.com/clip.mp4'],
      }),
    )

    expect(result.input.prompt).toBe(PROMPT)
  })

  it('caps Wan 3.0 reference inputs at 10 images / 5 videos / 5 audio', () => {
    const result = buildFalWorkerQueueRequest(
      buildWorkerInput(AI_MODELS.WAN_30_REFERENCE, REF, {
        referenceImages: Array.from(
          { length: 14 },
          (_, i) => `https://example.com/image-${i}.png`,
        ),
        videoUrls: Array.from(
          { length: 8 },
          (_, i) => `https://example.com/video-${i}.mp4`,
        ),
        audioUrls: Array.from(
          { length: 8 },
          (_, i) => `https://example.com/audio-${i}.mp3`,
        ),
      }),
    )

    expect(result.input.reference_image_urls).toHaveLength(10)
    expect(result.input.reference_video_urls).toHaveLength(5)
    expect(result.input.reference_audio_urls).toHaveLength(5)
  })

  it('rejects a Wan 3.0 reference request with no references at all', () => {
    expect(() =>
      buildFalWorkerQueueRequest(buildWorkerInput(AI_MODELS.WAN_30_REFERENCE)),
    ).toThrow(/requires at least one reference image, video, or audio clip/)
  })

  it('accepts an audio-only Wan 3.0 reference request', () => {
    // Unlike Seedance, Wan publishes no "audio needs a visual" rule — so the
    // builder must not invent one.
    const result = buildFalWorkerQueueRequest(
      buildWorkerInput(AI_MODELS.WAN_30_REFERENCE, undefined, {
        audioUrls: ['https://example.com/voice.mp3'],
      }),
    )

    expect(result.input.reference_audio_urls).toEqual([
      'https://example.com/voice.mp3',
    ])
    expect(result.input).not.toHaveProperty('reference_image_urls')
  })

  it('normalizes legacy Veo public ID before building queue requests', () => {
    const result = buildFalWorkerQueueRequest(
      buildWorkerInput(AI_MODELS.VEO_31, undefined, { modelId: 'veo-3' }),
    )

    expect(result.endpointModelId).toBe('fal-ai/veo3.1')
    expect(result.input).toMatchObject({
      prompt: PROMPT,
      aspect_ratio: '16:9',
      resolution: '1080p',
    })
  })

  it('emits audio_urls for Seedance 2.0 Reference when provided', () => {
    const result = buildFalWorkerQueueRequest(
      buildWorkerInput(AI_MODELS.SEEDANCE_20_REFERENCE, REF, {
        audioUrls: ['https://example.com/voice-a.mp3'],
      }),
    )

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
    const result = buildFalWorkerQueueRequest(
      buildWorkerInput(AI_MODELS.SEEDANCE_20_FAST_REFERENCE, REF, {
        audioUrls,
      }),
    )

    expect((result.input.audio_urls as string[]).length).toBe(3)
  })

  it('omits audio_urls when not provided', () => {
    const result = buildFalWorkerQueueRequest(
      buildWorkerInput(AI_MODELS.SEEDANCE_20_REFERENCE, REF),
    )

    expect(result.input.audio_urls).toBeUndefined()
  })

  it('ignores audioUrls on non-Reference Seedance endpoints', () => {
    const result = buildFalWorkerQueueRequest(
      buildWorkerInput(AI_MODELS.SEEDANCE_20_FAST, REF, {
        audioUrls: ['https://example.com/voice.mp3'],
      }),
    )

    expect(result.input.audio_urls).toBeUndefined()
  })

  describe('@AudioN prompt injection on Seedance Reference', () => {
    it('prepends @Audio1 when audioUrls is set but the prompt has no @AudioN', () => {
      const result = buildFalWorkerQueueRequest(
        buildWorkerInput(AI_MODELS.SEEDANCE_20_REFERENCE, REF, {
          audioUrls: ['https://example.com/voice-a.mp3'],
        }),
      )

      expect(result.input.prompt).toBe(`@Audio1 ${PROMPT}`)
    })

    it('prepends @Audio1 @Audio2 for two audio URLs', () => {
      const result = buildFalWorkerQueueRequest(
        buildWorkerInput(AI_MODELS.SEEDANCE_20_FAST_REFERENCE, REF, {
          audioUrls: [
            'https://example.com/voice-a.mp3',
            'https://example.com/voice-b.mp3',
          ],
        }),
      )

      expect(result.input.prompt).toBe(`@Audio1 @Audio2 ${PROMPT}`)
    })

    it('leaves the prompt alone when the user already wrote @Audio1', () => {
      const userPrompt = 'narrator: @Audio1 says "hi"'
      const result = buildFalWorkerQueueRequest(
        buildWorkerInput(AI_MODELS.SEEDANCE_20_REFERENCE, REF, {
          prompt: userPrompt,
          audioUrls: ['https://example.com/voice-a.mp3'],
        }),
      )

      expect(result.input.prompt).toBe(userPrompt)
    })

    it('does not inject when audioUrls is empty', () => {
      const result = buildFalWorkerQueueRequest(
        buildWorkerInput(AI_MODELS.SEEDANCE_20_REFERENCE, REF),
      )

      expect(result.input.prompt).toBe(PROMPT)
    })

    it('caps the prefix at @Audio3 even when 4 URLs are supplied', () => {
      const result = buildFalWorkerQueueRequest(
        buildWorkerInput(AI_MODELS.SEEDANCE_20_REFERENCE, REF, {
          audioUrls: [
            'https://example.com/a.mp3',
            'https://example.com/b.mp3',
            'https://example.com/c.mp3',
            'https://example.com/d.mp3',
          ],
        }),
      )

      expect(result.input.prompt).toBe(`@Audio1 @Audio2 @Audio3 ${PROMPT}`)
    })
  })

  describe('character-bound @AudioN injection on Seedance Reference', () => {
    it('labels @AudioN with the character name when audioBindings carries one', () => {
      const result = buildFalWorkerQueueRequest(
        buildWorkerInput(AI_MODELS.SEEDANCE_20_REFERENCE, REF, {
          audioBindings: [
            { url: 'https://example.com/alice.mp3', characterName: 'Alice' },
            { url: 'https://example.com/bob.mp3', characterName: 'Bob' },
          ],
        }),
      )

      expect(result.input.prompt).toBe(
        `Alice (@Audio1) Bob (@Audio2) ${PROMPT}`,
      )
      expect(result.input.audio_urls).toEqual([
        'https://example.com/alice.mp3',
        'https://example.com/bob.mp3',
      ])
    })

    it('mixes labeled and unlabeled bindings within the same prompt', () => {
      const result = buildFalWorkerQueueRequest(
        buildWorkerInput(AI_MODELS.SEEDANCE_20_REFERENCE, REF, {
          audioBindings: [
            { url: 'https://example.com/narrator.mp3' },
            { url: 'https://example.com/alice.mp3', characterName: 'Alice' },
          ],
        }),
      )

      expect(result.input.prompt).toBe(`@Audio1 Alice (@Audio2) ${PROMPT}`)
    })

    it('falls back to bare audioUrls when audioBindings is absent', () => {
      const result = buildFalWorkerQueueRequest(
        buildWorkerInput(AI_MODELS.SEEDANCE_20_REFERENCE, REF, {
          audioUrls: ['https://example.com/x.mp3'],
        }),
      )

      expect(result.input.prompt).toBe(`@Audio1 ${PROMPT}`)
    })

    it('prefers audioBindings when both audioBindings and audioUrls are given', () => {
      const result = buildFalWorkerQueueRequest(
        buildWorkerInput(AI_MODELS.SEEDANCE_20_REFERENCE, REF, {
          audioUrls: ['https://example.com/ignored.mp3'],
          audioBindings: [
            { url: 'https://example.com/alice.mp3', characterName: 'Alice' },
          ],
        }),
      )

      expect(result.input.audio_urls).toEqual(['https://example.com/alice.mp3'])
      expect(result.input.prompt).toBe(`Alice (@Audio1) ${PROMPT}`)
    })
  })

  describe('video_urls + @VideoN injection on Seedance Reference', () => {
    it('emits video_urls and prepends @Video1 when videoUrls is set', () => {
      const result = buildFalWorkerQueueRequest(
        buildWorkerInput(AI_MODELS.SEEDANCE_20_REFERENCE, REF, {
          videoUrls: ['https://example.com/clip-a.mp4'],
        }),
      )

      expect(result.input.video_urls).toEqual([
        'https://example.com/clip-a.mp4',
      ])
      expect(result.input.prompt).toBe(`@Video1 ${PROMPT}`)
    })

    it('caps video_urls at 3 and prepends @Video1 @Video2 @Video3', () => {
      const result = buildFalWorkerQueueRequest(
        buildWorkerInput(AI_MODELS.SEEDANCE_20_FAST_REFERENCE, REF, {
          videoUrls: [
            'https://example.com/a.mp4',
            'https://example.com/b.mp4',
            'https://example.com/c.mp4',
            'https://example.com/d.mp4',
          ],
        }),
      )

      expect((result.input.video_urls as string[]).length).toBe(3)
      expect(result.input.prompt).toBe(`@Video1 @Video2 @Video3 ${PROMPT}`)
    })

    it('leaves the prompt alone when the user already wrote @Video1', () => {
      const userPrompt = 'continue from @Video1 with new motion'
      const result = buildFalWorkerQueueRequest(
        buildWorkerInput(AI_MODELS.SEEDANCE_20_REFERENCE, REF, {
          prompt: userPrompt,
          videoUrls: ['https://example.com/clip.mp4'],
        }),
      )

      expect(result.input.prompt).toBe(userPrompt)
    })

    it('omits video_urls when not provided', () => {
      const result = buildFalWorkerQueueRequest(
        buildWorkerInput(AI_MODELS.SEEDANCE_20_REFERENCE, REF),
      )

      expect(result.input.video_urls).toBeUndefined()
    })

    it('ignores videoUrls on non-Reference Seedance endpoints', () => {
      const result = buildFalWorkerQueueRequest(
        buildWorkerInput(AI_MODELS.SEEDANCE_20_FAST, REF, {
          videoUrls: ['https://example.com/clip.mp4'],
        }),
      )

      expect(result.input.video_urls).toBeUndefined()
    })

    it('combines @AudioN and @VideoN prefixes when both are supplied', () => {
      const result = buildFalWorkerQueueRequest(
        buildWorkerInput(AI_MODELS.SEEDANCE_20_REFERENCE, REF, {
          audioUrls: ['https://example.com/voice.mp3'],
          videoUrls: ['https://example.com/clip.mp4'],
        }),
      )

      expect(result.input.prompt).toBe(`@Video1 @Audio1 ${PROMPT}`)
      expect(result.input.audio_urls).toEqual(['https://example.com/voice.mp3'])
      expect(result.input.video_urls).toEqual(['https://example.com/clip.mp4'])
    })

    it('trims image_urls before video/audio when total exceeds fal cap of 12', () => {
      const nineImages = Array.from(
        { length: 9 },
        (_, i) => `https://example.com/img-${i}.png`,
      )
      const result = buildFalWorkerQueueRequest(
        buildWorkerInput(AI_MODELS.SEEDANCE_20_REFERENCE, REF, {
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
        }),
      )

      expect((result.input.image_urls as string[]).length).toBe(6)
      expect((result.input.audio_urls as string[]).length).toBe(3)
      expect((result.input.video_urls as string[]).length).toBe(3)
    })
  })

  it('honors explicit audio and seed parameters on the worker builder', () => {
    const happyHorse = buildFalWorkerQueueRequest(
      buildWorkerInput(AI_MODELS.HAPPYHORSE_10, REF, {
        generateAudio: false,
        seed: 31415,
      }),
    )

    expect(happyHorse.input.seed).toBe(31415)
    // HappyHorse's public v1.1 schema has native audio but no generate_audio
    // switch, so the unsupported override is deliberately absent.
    expect(happyHorse.input.generate_audio).toBeUndefined()

    const seedance = buildFalWorkerQueueRequest(
      buildWorkerInput(AI_MODELS.SEEDANCE_20_FAST, undefined, {
        generateAudio: false,
        seed: 2718,
      }),
    )
    expect(seedance.input).toMatchObject({
      generate_audio: false,
      seed: 2718,
    })
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

  describe('Veo 3.1 multi-reference', () => {
    const REF_A = 'https://example.com/a.png'
    const REF_B = 'https://example.com/b.png'
    const REF_C = 'https://example.com/c.png'
    const REF_D = 'https://example.com/d.png'

    function buildVeoWorkerInput(
      referenceImages: string[],
    ): FalWorkerVideoRequestContext {
      return buildWorkerInput(AI_MODELS.VEO_31, referenceImages[0], {
        referenceImages,
      })
    }

    it('passes the full referenceImages array through to image_urls', () => {
      const result = buildFalWorkerQueueRequest(
        buildVeoWorkerInput([REF_A, REF_B, REF_C]),
      )
      expect(result.mode).toBe('image-to-video')
      expect(result.input.image_urls).toEqual([REF_A, REF_B, REF_C])
    })

    it('caps image_urls at 3 even when more references are supplied', () => {
      const result = buildFalWorkerQueueRequest(
        buildVeoWorkerInput([REF_A, REF_B, REF_C, REF_D]),
      )
      expect(result.input.image_urls).toEqual([REF_A, REF_B, REF_C])
    })

    it('falls back to [referenceImage] when referenceImages is empty', () => {
      const result = buildFalWorkerQueueRequest(
        buildWorkerInput(AI_MODELS.VEO_31, REF_A, { referenceImages: [] }),
      )
      expect(result.input.image_urls).toEqual([REF_A])
    })
  })
})
