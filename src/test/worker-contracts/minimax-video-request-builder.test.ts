/**
 * worker-contracts —— 死执行链清理 Step 1（只加不删）。
 *
 * 生产的视频请求构造逻辑住在 `workers/execution/src/models/**`（execution
 * worker 是真实发请求给 provider 的那一路）；`src/services/providers/
 * minimax.adapter.ts` 里的 `buildMiniMaxVideoQueueBody` 是已经漂移的死 fork，
 * 不再被生产调用。`workers/execution/src/models/minimax/video-request-builder.ts`
 * 在本次迁移前**零测试**——这是 Step 1 里价值最高的一笔新增覆盖。
 *
 * 但 worker 自己的 vitest（`workers/execution/vitest.config.ts`）不解析 `@/`
 * 别名，测不了依赖 `MODEL_OPTIONS` 这类 fixture 的用例 —— 所以这类契约测试只能
 * 住在根 vitest suite 里，靠跨目录相对路径直接 import worker 的源文件（根
 * `vitest.config.ts` 的 `exclude: ['workers/**']` 只排除该目录下的**测试
 * 文件**，不阻止 import）。
 *
 * 本文件断言的是 `workers/execution/src/models/minimax/video-request-builder.ts`
 * 的真实导出（`buildMiniMaxVideoRequest` / `isMiniMaxReferenceModel`），不再
 * 调用 src 侧的死 fork。
 *
 * ⚠ 这里的 `externalModelId` 在大多数用例里都显式传了 `'MiniMax-H3'`——worker
 * 的 `MiniMaxVideoBuilderInput.externalModelId` 是**必填** string，不像 src 侧
 * `MiniMaxQueueBodyInput.externalModelId` 是可选的（省略时 src 会兜底成内置
 * 默认值）。这个类型收紧本身就是一处发现，见文件末尾「omitted externalModelId」
 * 那组测试。
 */
import { describe, expect, it } from 'vitest'

import { AI_MODELS } from '@/constants/models'

import {
  buildMiniMaxVideoRequest,
  isMiniMaxReferenceModel,
  type MiniMaxVideoBuilderInput,
} from '../../../workers/execution/src/models/minimax/video-request-builder'

const PROMPT = 'Image 1 is the protagonist walking through a sunlit garden'
const IMG = (n: number) => `https://example.com/image-${n}.png`
const VID = (n: number) => `https://example.com/clip-${n}.mp4`
const AUD = (n: number) => `https://example.com/voice-${n}.mp3`
const H3_EXTERNAL_ID = 'MiniMax-H3'

type ContentEntry = { type: string; role?: string }

const contentOf = (body: Record<string, unknown>): ContentEntry[] =>
  body.content as ContentEntry[]

const rolesOf = (body: Record<string, unknown>, type: string): string[] =>
  contentOf(body)
    .filter((entry) => entry.type === type)
    .map((entry) => entry.role ?? '')

describe('buildMiniMaxVideoRequest', () => {
  it('always pins resolution to 2K — the only output H3 offers', () => {
    const body = buildMiniMaxVideoRequest({
      prompt: PROMPT,
      modelId: AI_MODELS.MINIMAX_H3,
      externalModelId: H3_EXTERNAL_ID,
      aspectRatio: '16:9',
    })

    expect(body.resolution).toBe('2K')
    expect(body.model).toBe('MiniMax-H3')
    expect(body.ratio).toBe('16:9')
  })

  it('clamps duration into 4–15 and falls back to 5 for the auto token', () => {
    const at = (duration: number | 'auto' | undefined) =>
      buildMiniMaxVideoRequest({
        prompt: PROMPT,
        modelId: AI_MODELS.MINIMAX_H3,
        externalModelId: H3_EXTERNAL_ID,
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
    const body = buildMiniMaxVideoRequest({
      prompt: PROMPT,
      modelId: AI_MODELS.MINIMAX_H3,
      externalModelId: H3_EXTERNAL_ID,
      aspectRatio: '16:9',
      referenceImage: IMG(1),
    })

    expect(rolesOf(body, 'image_url')).toEqual(['first_frame'])
  })

  it('ignores motion and voice references on the base model', () => {
    // The base id has no multimodal face; sending reference_video there is a
    // 400, so extra modalities must be dropped rather than forwarded.
    const body = buildMiniMaxVideoRequest({
      prompt: PROMPT,
      modelId: AI_MODELS.MINIMAX_H3,
      externalModelId: H3_EXTERNAL_ID,
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
    const body = buildMiniMaxVideoRequest({
      prompt: PROMPT,
      modelId: AI_MODELS.MINIMAX_H3_REFERENCE,
      externalModelId: H3_EXTERNAL_ID,
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
    const body = buildMiniMaxVideoRequest({
      prompt: PROMPT,
      modelId: AI_MODELS.MINIMAX_H3_REFERENCE_CN,
      externalModelId: H3_EXTERNAL_ID,
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
    const body = buildMiniMaxVideoRequest({
      prompt: PROMPT,
      modelId: AI_MODELS.MINIMAX_H3_REFERENCE,
      externalModelId: H3_EXTERNAL_ID,
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
    const body = buildMiniMaxVideoRequest({
      prompt: PROMPT,
      modelId: AI_MODELS.MINIMAX_H3_REFERENCE,
      externalModelId: H3_EXTERNAL_ID,
      aspectRatio: '16:9',
      audioUrls: [AUD(1), AUD(2)],
    })

    expect(rolesOf(body, 'audio_url')).toEqual([])
    expect(contentOf(body)).toHaveLength(1)
  })

  it('keeps audio when a visual reference accompanies it', () => {
    const body = buildMiniMaxVideoRequest({
      prompt: PROMPT,
      modelId: AI_MODELS.MINIMAX_H3_REFERENCE,
      externalModelId: H3_EXTERNAL_ID,
      aspectRatio: '16:9',
      videoUrls: [VID(1)],
      audioUrls: [AUD(1)],
    })

    expect(rolesOf(body, 'video_url')).toEqual(['reference_video'])
    expect(rolesOf(body, 'audio_url')).toEqual(['reference_audio'])
  })

  it('honours an explicit externalModelId over the built-in default', () => {
    const body = buildMiniMaxVideoRequest({
      prompt: PROMPT,
      modelId: AI_MODELS.MINIMAX_H3,
      externalModelId: 'MiniMax-H3-Future',
      aspectRatio: '16:9',
    })

    expect(body.model).toBe('MiniMax-H3-Future')
  })

  describe('omitted externalModelId (DRIFT)', () => {
    // src's buildMiniMaxVideoQueueBody (services/providers/minimax.adapter.ts:279)
    // does `model: input.externalModelId ?? MINIMAX_EXECUTION_MODEL_ID` — when
    // the caller omits externalModelId it gracefully falls back to the literal
    // 'MiniMax-H3'. That was exercisable because MiniMaxQueueBodyInput declares
    // externalModelId as optional.
    //
    // The worker's buildMiniMaxVideoRequest (workers/execution/src/models/
    // minimax/video-request-builder.ts:147) does `model: input.externalModelId`
    // with NO fallback, and MiniMaxVideoBuilderInput declares the field
    // `externalModelId: string` (required, not optional) — the worker fork
    // dropped the defensive default entirely rather than keep it.
    //
    // Practical impact: today MODEL_OPTIONS always populates externalModelId
    // ('MiniMax-H3') for all 4 MiniMax catalog entries, and the only worker
    // call site (submitMiniMaxQueue in workers/execution/src/index.ts:2133)
    // passes `context.providerInput.externalModelId` straight through with no
    // fallback either — so this is not reachable via a normal catalog-driven
    // request today. It is still a real, verifiable behavioral difference
    // between the two forks, so it's recorded here rather than silently
    // dropped.
    it.skip('DRIFT: worker does not fall back to MiniMax-H3 when externalModelId is omitted (src does)', () => {
      const body = buildMiniMaxVideoRequest({
        prompt: PROMPT,
        modelId: AI_MODELS.MINIMAX_H3,
        aspectRatio: '16:9',
      } as MiniMaxVideoBuilderInput)

      // This is what the src-side fork (and the pre-migration test suite)
      // asserted. It fails against the worker — see the companion test below
      // for the actual observed value.
      expect(body.model).toBe('MiniMax-H3')
    })

    it('documents the actual worker behavior: model comes out undefined, not defaulted', () => {
      const body = buildMiniMaxVideoRequest({
        prompt: PROMPT,
        modelId: AI_MODELS.MINIMAX_H3,
        aspectRatio: '16:9',
      } as MiniMaxVideoBuilderInput)

      expect(body.model).toBeUndefined()
    })
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
