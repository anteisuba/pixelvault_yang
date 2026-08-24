/**
 * worker-contracts —— 死执行链清理 Step 1（只加不删）。
 *
 * 生产的视频请求构造逻辑住在 `workers/execution/src/models/**`（execution
 * worker 是真实发请求给 provider 的那一路）；`src/services/providers/
 * volcengine.adapter.ts` 里的 `buildVolcEngineVideoQueueBody` 是已经漂移的死
 * fork，不再被生产调用（volcengine video 走的是 worker-only 路径）。
 *
 * 但 worker 自己的 vitest（`workers/execution/vitest.config.ts`）不解析 `@/`
 * 别名，测不了依赖 `MODEL_OPTIONS` / `getVideoModelSendContract` 这类 fixture
 * 的用例 —— 所以这类契约测试只能住在根 vitest suite 里，靠跨目录相对路径直接
 * import worker 的源文件（根 `vitest.config.ts` 的 `exclude: ['workers/**']`
 * 只排除该目录下的**测试文件**，不阻止 import）。
 *
 * 本文件断言的是 `workers/execution/src/models/volcengine/video-request-builder.ts`
 * 的真实导出 `buildVolcEngineVideoRequest`，不再调用 src 侧的死 fork。
 *
 * worker 里 `REFERENCE_ENDPOINT_MODEL_IDS` / `ADAPTIVE_RATIO_MODEL_IDS` 是私有
 * 常量，手抄自 `getVideoModelSendContract` 的事实（worker 拿不到 `@/` 别名，
 * import 不了那份契约）——本文件末尾额外加了一条「遍历全目录」的漂移闸，通过
 * 可观察行为反推这两个私有集合是否还和契约一致。
 */
import { describe, expect, it } from 'vitest'

import { VIDEO_GENERATION } from '@/constants/config'
import { getVideoModelSendContract } from '@/constants/video-model-send-plan'
import { AI_MODELS, MODEL_OPTIONS } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import type { VideoDefaults } from '@/constants/models'

import {
  buildVolcEngineVideoRequest,
  type VolcEngineVideoBuilderInput,
} from '../../../workers/execution/src/models/volcengine/video-request-builder'

const PROMPT = 'A precise cinematic prompt'
const REF = 'https://example.com/reference.png'
const IMG1 = 'https://example.com/a.png'
const IMG2 = 'https://example.com/b.png'
const VID1 = 'https://example.com/clip.mp4'
const AUD1 = 'https://example.com/voice.mp3'

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
    id: AI_MODELS.SEEDANCE_20_VOLCENGINE,
    externalModelId: 'doubao-seedance-2-0-260128',
    videoDefaults: {
      generateAudio: true,
      resolution: '720p',
    },
  },
  seedance20Fast: {
    id: AI_MODELS.SEEDANCE_20_FAST_VOLCENGINE,
    externalModelId: 'doubao-seedance-2-0-fast-260128',
    videoDefaults: {
      generateAudio: true,
      resolution: '720p',
    },
  },
  seedance25: {
    id: AI_MODELS.SEEDANCE_25_VOLCENGINE,
    externalModelId: 'doubao-seedance-2-5-260628',
    videoDefaults: {
      generateAudio: true,
      resolution: '720p',
    },
  },
  seedance20Reference: {
    id: AI_MODELS.SEEDANCE_20_REFERENCE_VOLCENGINE,
    externalModelId: 'doubao-seedance-2-0-260128',
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

function buildWorkerInput(
  fixture: VolcVideoFixture,
  referenceImage?: string,
  overrides: Partial<VolcEngineVideoBuilderInput> = {},
): VolcEngineVideoBuilderInput {
  return {
    prompt: PROMPT,
    modelId: fixture.id,
    externalModelId: fixture.externalModelId,
    aspectRatio: '16:9',
    duration: 5,
    referenceImage,
    // The worker's input type is intentionally decoupled from src's
    // `VideoDefaults` (it can't import `@/constants/models` either) and
    // declares `videoDefaults?: Record<string, unknown>` — a plain-object
    // cast at this one boundary point, not a behavioral difference.
    videoDefaults: fixture.videoDefaults as Record<string, unknown> | undefined,
    ...overrides,
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

describe('buildVolcEngineVideoRequest', () => {
  it.each(volcBodyCases)('builds $label body', (testCase) => {
    const body = buildVolcEngineVideoRequest(
      buildWorkerInput(testCase.model, testCase.referenceImage),
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

  it('clamps duration to the Seedance 2.0 window of 4–15 seconds', () => {
    // Regression: this used to clamp to 2–12 (the 1.0-pro window), so a 15s
    // request — which the capability matrix openly offers — came back as 12s
    // with no error anywhere. Keep in step with the src-side (dead)
    // buildVolcEngineVideoQueueBody — both must clamp identically.
    const durationFor = (duration: number | 'auto' | undefined) =>
      buildVolcEngineVideoRequest({
        ...buildWorkerInput(VOLC_VIDEO_FIXTURES.seedance20),
        duration,
      }).duration

    expect(durationFor(15)).toBe(15)
    expect(durationFor(12)).toBe(12)
    expect(durationFor(1)).toBe(4)
    expect(durationFor(99)).toBe(15)
    expect(durationFor(7.4)).toBe(7)
    // 'auto' has no ark equivalent — it falls back to the configured default.
    expect(durationFor('auto')).toBe(VIDEO_GENERATION.DEFAULT_DURATION)
    expect(durationFor(undefined)).toBe(VIDEO_GENERATION.DEFAULT_DURATION)
  })

  it('is sendable — VolcEngine video now has an execution-worker branch', () => {
    // Before 2026-08-01 every VolcEngine video model was catalog-only: the
    // service 501'd on anything that wasn't fal. This is the tripwire for
    // that regressing. Pure catalog/contract check — doesn't touch either
    // builder fork.
    for (const model of MODEL_OPTIONS.filter(
      (candidate) =>
        candidate.adapterType === AI_ADAPTER_TYPES.VOLCENGINE &&
        candidate.outputType === 'VIDEO' &&
        candidate.available,
    )) {
      expect(
        getVideoModelSendContract(model.id, AI_ADAPTER_TYPES.VOLCENGINE)
          .execution,
        `${model.id} should be sendable`,
      ).toBe('ready')
    }
  })

  it('filters unsupported 1080p for Seedance 2.0 Fast Volc', () => {
    const body = buildVolcEngineVideoRequest(
      buildWorkerInput(VOLC_VIDEO_FIXTURES.seedance20Fast, undefined, {
        resolution: '1080p',
      }),
    )

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
      AI_MODELS.SEEDANCE_25_VOLCENGINE,
      AI_MODELS.SEEDANCE_25_REFERENCE_VOLCENGINE,
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

  it('drift guard: the reference-mode and aspect-ratio-lock hardcoded sets match the send contract for every catalog model', () => {
    // worker 里 REFERENCE_ENDPOINT_MODEL_IDS / ADAPTIVE_RATIO_MODEL_IDS 都是
    // 私有常量、没有导出，只能通过可观察行为（content 里的 role、返回的
    // ratio）反推它们是否还和 getVideoModelSendContract 这份源头事实一致。
    // 这条就是 Step 1 任务书里点名要保住的「防 worker 硬编码 id 集合漂移的
    // 唯一闸」。
    const volcVideoModels = MODEL_OPTIONS.filter(
      (model) =>
        model.adapterType === AI_ADAPTER_TYPES.VOLCENGINE &&
        model.outputType === 'VIDEO',
    )
    expect(volcVideoModels.length).toBeGreaterThan(0)

    for (const model of volcVideoModels) {
      const contract = getVideoModelSendContract(
        model.id,
        AI_ADAPTER_TYPES.VOLCENGINE,
      )
      const body = buildVolcEngineVideoRequest({
        prompt: PROMPT,
        modelId: model.id,
        externalModelId: model.externalModelId,
        aspectRatio: '16:9',
        duration: 5,
        referenceImages: [IMG1, IMG2],
        videoDefaults: model.videoDefaults as
          | Record<string, unknown>
          | undefined,
      })
      const imageRoles = (
        body.content as Array<{ type: string; role?: string }>
      )
        .filter((entry) => entry.type === 'image_url')
        .map((entry) => entry.role)

      if (contract.referenceMode === 'multimodal-reference') {
        expect(imageRoles, model.id).toEqual([
          'reference_image',
          'reference_image',
        ])
      } else {
        expect(imageRoles, model.id).toEqual(['first_frame', 'last_frame'])
      }

      expect(body.ratio, model.id).toBe(contract.imageAspectRatioLock ?? '16:9')
    }
  })
})

describe('buildVolcEngineVideoRequest reference-to-video', () => {
  it('reference endpoint: multiple images go out as reference_image', () => {
    const body = buildVolcEngineVideoRequest(
      buildWorkerInput(VOLC_VIDEO_FIXTURES.seedance20Reference, undefined, {
        referenceImages: [IMG1, IMG2],
      }),
    )

    expect(body.content).toEqual([
      { type: 'text', text: PROMPT },
      { type: 'image_url', image_url: { url: IMG1 }, role: 'reference_image' },
      { type: 'image_url', image_url: { url: IMG2 }, role: 'reference_image' },
    ])
  })

  it('keyframe endpoint: two images go out as first_frame + last_frame', () => {
    const body = buildVolcEngineVideoRequest(
      buildWorkerInput(VOLC_VIDEO_FIXTURES.seedance20, undefined, {
        referenceImages: [IMG1, IMG2],
      }),
    )

    expect(body.content).toEqual([
      { type: 'text', text: PROMPT },
      { type: 'image_url', image_url: { url: IMG1 }, role: 'first_frame' },
      { type: 'image_url', image_url: { url: IMG2 }, role: 'last_frame' },
    ])
  })

  it('两个端点共用同一个 externalModelId —— 只能按内部 modelId 分场景', () => {
    const keyframe = buildVolcEngineVideoRequest(
      buildWorkerInput(VOLC_VIDEO_FIXTURES.seedance20, IMG1),
    )
    const reference = buildVolcEngineVideoRequest(
      buildWorkerInput(VOLC_VIDEO_FIXTURES.seedance20Reference, IMG1),
    )

    // 发给火山的 model 字段完全一样 —— 这正是不能拿它当判据的原因。
    expect(keyframe.model).toBe(reference.model)
    expect(
      getVideoModelSendContract(VOLC_VIDEO_FIXTURES.seedance20.id)
        .referenceMode,
    ).toBe('text-or-first-frame')
    expect(
      getVideoModelSendContract(VOLC_VIDEO_FIXTURES.seedance20Reference.id)
        .referenceMode,
    ).toBe('multimodal-reference')
  })

  it('combines reference image, video and audio entries', () => {
    const body = buildVolcEngineVideoRequest(
      buildWorkerInput(VOLC_VIDEO_FIXTURES.seedance20, IMG1, {
        videoUrls: [VID1],
        audioUrls: [AUD1],
      }),
    )

    expect(body.content).toEqual([
      { type: 'text', text: PROMPT },
      { type: 'image_url', image_url: { url: IMG1 }, role: 'reference_image' },
      { type: 'video_url', video_url: { url: VID1 }, role: 'reference_video' },
      { type: 'audio_url', audio_url: { url: AUD1 }, role: 'reference_audio' },
    ])
  })

  it('keeps a lone first frame as i2v (no reference roles)', () => {
    const body = buildVolcEngineVideoRequest(
      buildWorkerInput(VOLC_VIDEO_FIXTURES.seedance20, IMG1),
    )

    expect(body.content).toEqual([
      { type: 'text', text: PROMPT },
      { type: 'image_url', image_url: { url: IMG1 }, role: 'first_frame' },
    ])
  })

  it('drops reference audio when no image or video accompanies it', () => {
    const body = buildVolcEngineVideoRequest(
      buildWorkerInput(VOLC_VIDEO_FIXTURES.seedance20, undefined, {
        audioUrls: [AUD1],
      }),
    )

    expect(body.content).toEqual([{ type: 'text', text: PROMPT }])
  })

  it('2.5 关键帧档 + 有图 → ratio 强制 adaptive（传具体宽高比会 400）', () => {
    const body = buildVolcEngineVideoRequest(
      buildWorkerInput(VOLC_VIDEO_FIXTURES.seedance25, IMG1),
    )

    expect(body.ratio).toBe('adaptive')
  })

  it('⚠ 2.5 纯文生视频 → 比例照发，不受首帧那条约束', () => {
    // 判据是「这次请求有没有图」，不是模型 id —— 只看 id 会把文生的比例也改掉。
    const body = buildVolcEngineVideoRequest(
      buildWorkerInput(VOLC_VIDEO_FIXTURES.seedance25),
    )

    expect(body.ratio).toBe('16:9')
  })

  it('2.0 + 有图 → 比例照发，这条约束只属于 2.5', () => {
    const body = buildVolcEngineVideoRequest(
      buildWorkerInput(VOLC_VIDEO_FIXTURES.seedance20, IMG1),
    )

    expect(body.ratio).toBe('16:9')
  })

  it('caps references at 9 images / 3 videos / 3 audio', () => {
    const body = buildVolcEngineVideoRequest(
      buildWorkerInput(VOLC_VIDEO_FIXTURES.seedance20, undefined, {
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
      }),
    )

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
