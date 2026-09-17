import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * ⚠ 契约表全部桩掉：这一层要验的是**构造器的判断**（哪一节给、哪一节不给、
 * 渠道有没有印出来），不是目录里今天有哪些型号。用真目录写死一组值的下场是
 * 「加一个模型就红一片」，而那时红的不是这份逻辑。
 */
const mockGetVideoModelParameterOptions = vi.fn()
const mockGetVideoModelSendContract = vi.fn()
vi.mock('@/constants/video-model-send-plan', () => ({
  getVideoModelParameterOptions: (...args: unknown[]) =>
    mockGetVideoModelParameterOptions(...args),
  getVideoModelSendContract: (...args: unknown[]) =>
    mockGetVideoModelSendContract(...args),
}))

const mockGetNodeModeForModel = vi.fn()
vi.mock('@/constants/video-node-modes', () => ({
  getNodeModeForModel: (...args: unknown[]) => mockGetNodeModeForModel(...args),
}))

/**
 * ⚠ `@/constants/models` 必须**部分**桩：`constants/api-keys.ts` 在模块加载期就
 * 调 `getAvailableModels()`，整个换掉会让 `types/index.ts` 那条 import 链直接崩
 * （表现是「0 test」而不是断言失败）。
 */
const mockGetModelById = vi.fn()
vi.mock(import('@/constants/models'), async (importOriginal) => ({
  ...(await importOriginal()),
  getModelById: (...args: unknown[]) =>
    mockGetModelById(...args) as ReturnType<
      Awaited<ReturnType<typeof importOriginal>>['getModelById']
    >,
}))

const mockGetCapabilityConfig = vi.fn()
vi.mock('@/constants/provider-capabilities', () => ({
  getCapabilityConfig: (...args: unknown[]) => mockGetCapabilityConfig(...args),
}))

import { ASSISTANT_OPERATOR_LIMITS } from '@/constants/assistant-operator'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import type { StudioModelOption } from '@/types/model-option'
import {
  buildImageOperatorSnapshot,
  buildLoraOperatorSnapshot,
  buildVideoOperatorSnapshot,
  type StudioOperatorSnapshotForm,
} from '@/lib/studio-operator-snapshot'
import { AssistantOperatorSnapshotSchema } from '@/types/assistant-operator'

const FORM: StudioOperatorSnapshotForm = {
  prompt: '雨里撑伞的少女',
  negativePrompt: undefined,
  aspectRatio: '16:9',
  imageResolution: 'auto',
  imageBatchCount: 1,
  videoDurationSeconds: 5,
  videoResolution: '720p',
  videoAudioRefs: [],
  videoFrameSlots: { first: null, last: null },
  videoReferenceVideos: [],
  videoSoundEnabled: null,
}

function option(
  overrides: Partial<StudioModelOption> & { optionId: string; modelId: string },
): StudioModelOption {
  return {
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: { label: 'fal.ai' } as StudioModelOption['providerConfig'],
    requestCount: 30,
    isBuiltIn: true,
    sourceType: 'workspace',
    keyId: 'key-1',
    ...overrides,
  }
}

const SEEDANCE_ON_BYTEPLUS = option({
  optionId: 'workspace:seedance-2.5-byteplus',
  modelId: 'seedance-2.5-byteplus',
  displayLabel: 'Seedance 2.5',
  adapterType: AI_ADAPTER_TYPES.BYTEPLUS,
  providerConfig: { label: 'BytePlus' } as StudioModelOption['providerConfig'],
  requestCount: 22,
})
const SEEDANCE_ON_FAL = option({
  optionId: 'workspace:seedance-2.5',
  modelId: 'seedance-2.5',
  displayLabel: 'Seedance 2.5',
  requestCount: 48,
})

function videoParams(
  overrides: Partial<{
    durations: number[]
    resolutions: string[]
    aspectRatios: string[]
  }> = {},
) {
  mockGetVideoModelParameterOptions.mockReturnValue({
    durations: [5, 10],
    resolutions: ['720p', '1080p'],
    aspectRatios: ['16:9', '9:16'],
    ...overrides,
  })
}

function videoContract(
  overrides: Partial<{
    audio: number
    audioRequiresVisual: boolean
    sound: boolean
    videos: number
    keyframeSlots: 1 | 2
    imageAspectRatioLock: string | null
  }> = {},
) {
  const merged = {
    audio: 10,
    audioRequiresVisual: false,
    sound: true,
    videos: 10,
    keyframeSlots: 2 as 1 | 2,
    imageAspectRatioLock: null as string | null,
    ...overrides,
  }
  mockGetVideoModelSendContract.mockReturnValue({
    slots: {
      images: 30,
      videos: merged.videos,
      audio: merged.audio,
      audioRequiresVisual: merged.audioRequiresVisual,
    },
    parameters: { generateAudio: merged.sound },
    keyframeSlots: merged.keyframeSlots,
    imageAspectRatioLock: merged.imageAspectRatioLock,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetNodeModeForModel.mockReturnValue('keyframe')
  mockGetModelById.mockReturnValue({ videoDefaults: { generateAudio: true } })
  mockGetCapabilityConfig.mockReturnValue({ resolutionOptions: ['auto', '2K'] })
  videoParams()
  videoContract()
})

describe('buildVideoOperatorSnapshot', () => {
  it('⭐ 模型目录按 optionId 给，每行带渠道与积分（K-3：同型号不同渠道差一倍多）', () => {
    const snapshot = buildVideoOperatorSnapshot({
      form: FORM,
      modelOptions: [SEEDANCE_ON_BYTEPLUS, SEEDANCE_ON_FAL],
      selectedModel: SEEDANCE_ON_BYTEPLUS,
      references: { items: [], limit: 4 },
      videoMode: 'keyframe',
    })

    // ⛔ 不按 modelId 去重：一个型号在几条渠道上就是几行。
    expect(snapshot.availableModels).toEqual([
      {
        id: 'workspace:seedance-2.5-byteplus',
        label: 'Seedance 2.5 · BytePlus · 22 credits',
      },
      {
        id: 'workspace:seedance-2.5',
        label: 'Seedance 2.5 · fal.ai · 48 credits',
      },
    ])
    // 选中项也用 optionId —— `set_model` 落地那一跳按它查。
    expect(snapshot.model).toEqual({
      id: 'workspace:seedance-2.5-byteplus',
      label: 'Seedance 2.5 · BytePlus · 22 credits',
    })
  })

  it('名单按当前「用途」档筛 —— 界面上点不到的模型助手也不该选得到（拍板 19）', () => {
    mockGetNodeModeForModel.mockImplementation((modelId: string) =>
      modelId === 'seedance-2.5-byteplus' ? 'keyframe' : 'multimodal',
    )
    const snapshot = buildVideoOperatorSnapshot({
      form: FORM,
      modelOptions: [SEEDANCE_ON_BYTEPLUS, SEEDANCE_ON_FAL],
      selectedModel: SEEDANCE_ON_BYTEPLUS,
      references: { items: [], limit: 4 },
      videoMode: 'keyframe',
    })
    expect(snapshot.availableModels.map((model) => model.id)).toEqual([
      'workspace:seedance-2.5-byteplus',
    ])
  })

  it('⛔ 视频快照里没有 specs / count 两节 —— 缺席即拒，那正是它们该有的行为', () => {
    const snapshot = buildVideoOperatorSnapshot({
      form: FORM,
      modelOptions: [SEEDANCE_ON_BYTEPLUS],
      selectedModel: SEEDANCE_ON_BYTEPLUS,
      references: { items: [], limit: 4 },
      videoMode: 'keyframe',
    })
    expect(snapshot.specs).toBeUndefined()
    expect(snapshot.count).toBeUndefined()
    expect(snapshot.videoSpecs).toEqual({
      durationSeconds: 5,
      aspectRatio: '16:9',
      resolution: '720p',
      durationOptions: [5, 10],
      aspectRatioOptions: ['16:9', '9:16'],
      resolutionOptions: ['720p', '1080p'],
      // 带图锁（第二期）：契约里没有就是 `null`，⛔ 不缺席（缺席读起来像「没这回事」）。
      aspectRatioLock: null,
    })
  })

  it('现值不在档位表里就报 null —— ⛔ 不印一个弹层里点不回去的值', () => {
    videoParams({ durations: [8], resolutions: [], aspectRatios: ['1:1'] })
    const snapshot = buildVideoOperatorSnapshot({
      form: FORM,
      modelOptions: [SEEDANCE_ON_BYTEPLUS],
      selectedModel: SEEDANCE_ON_BYTEPLUS,
      references: { items: [], limit: 4 },
      videoMode: 'keyframe',
    })
    expect(snapshot.videoSpecs).toMatchObject({
      durationSeconds: null,
      aspectRatio: null,
      resolution: null,
      resolutionOptions: [],
    })
  })

  it('⭐ 出声开关三态：用户没设过时 value 是 null，effective 走目录默认', () => {
    const snapshot = buildVideoOperatorSnapshot({
      form: FORM,
      modelOptions: [SEEDANCE_ON_BYTEPLUS],
      selectedModel: SEEDANCE_ON_BYTEPLUS,
      references: { items: [], limit: 4 },
      videoMode: 'keyframe',
    })
    // ⛔ 把「没设过」端上去成 false，在目录默认为开的模型上结果正好相反。
    expect(snapshot.sound).toEqual({ value: null, effective: true })
  })

  it('线路没有出声开关时整节缺席（界面上那颗 Switch 也不渲染）', () => {
    videoContract({ sound: false })
    const snapshot = buildVideoOperatorSnapshot({
      form: FORM,
      modelOptions: [SEEDANCE_ON_BYTEPLUS],
      selectedModel: SEEDANCE_ON_BYTEPLUS,
      references: { items: [], limit: 4 },
      videoMode: 'keyframe',
    })
    expect(snapshot.sound).toBeUndefined()
  })

  it('音频参考位：上限与「能不能只挂声音」都按线路给（台账 A ②）', () => {
    videoContract({ audio: 3, audioRequiresVisual: true })
    const snapshot = buildVideoOperatorSnapshot({
      form: {
        ...FORM,
        videoAudioRefs: [
          {
            id: 'a1',
            url: 'https://cdn.example.com/line.mp3',
            fileName: '我不走',
            ownerName: '阿岚',
          },
        ],
      },
      modelOptions: [SEEDANCE_ON_BYTEPLUS],
      selectedModel: SEEDANCE_ON_BYTEPLUS,
      references: { items: [], limit: 4 },
      videoMode: 'keyframe',
    })
    expect(snapshot.audioReferences).toEqual({
      items: [
        {
          url: 'https://cdn.example.com/line.mp3',
          label: '我不走',
          ownerName: '阿岚',
        },
      ],
      limit: 3,
      requiresVisual: true,
    })
  })

  it('线路不吃音频参考（槽 0）时整节缺席 —— 助手连试都不会试', () => {
    videoContract({ audio: 0 })
    const snapshot = buildVideoOperatorSnapshot({
      form: FORM,
      modelOptions: [SEEDANCE_ON_BYTEPLUS],
      selectedModel: SEEDANCE_ON_BYTEPLUS,
      references: { items: [], limit: 4 },
      videoMode: 'keyframe',
    })
    expect(snapshot.audioReferences).toBeUndefined()
  })

  it('产出过得了契约 schema（服务端收的就是它）', () => {
    const snapshot = buildVideoOperatorSnapshot({
      form: FORM,
      modelOptions: [SEEDANCE_ON_BYTEPLUS, SEEDANCE_ON_FAL],
      selectedModel: SEEDANCE_ON_BYTEPLUS,
      references: {
        items: [
          { url: 'https://cdn.example.com/a.png' },
          // blob: 进不去 —— schema 要求合法 URL，混进去整个请求 400。
          { url: 'blob:http://localhost/abc' },
        ],
        limit: 4,
      },
      videoMode: 'keyframe',
    })
    expect(AssistantOperatorSnapshotSchema.safeParse(snapshot).success).toBe(
      true,
    )
    expect(snapshot.references?.items).toEqual([
      { url: 'https://cdn.example.com/a.png' },
    ])
  })
})

describe('buildImageOperatorSnapshot', () => {
  it('形状不变：按 modelId 去重、给 specs 与 count、⛔ 不带任何视频节', () => {
    const snapshot = buildImageOperatorSnapshot({
      form: FORM,
      modelOptions: [
        option({
          optionId: 'workspace:seedream-4',
          modelId: 'seedream-4',
          displayLabel: 'Seedream 4',
        }),
        option({
          optionId: 'saved:seedream-4',
          modelId: 'seedream-4',
          displayLabel: 'Seedream 4',
        }),
      ],
      selectedModel: option({
        optionId: 'workspace:seedream-4',
        modelId: 'seedream-4',
        displayLabel: 'Seedream 4',
      }),
      references: { items: [], limit: 4 },
    })

    expect(snapshot.availableModels).toEqual([
      { id: 'seedream-4', label: 'Seedream 4' },
    ])
    expect(snapshot.model).toEqual({ id: 'seedream-4', label: 'Seedream 4' })
    expect(snapshot.specs).toEqual({
      aspectRatio: '16:9',
      resolution: 'auto',
      aspectRatioOptions: expect.arrayContaining(['1:1', '16:9']),
      resolutionOptions: ['auto', '2K'],
      quality: undefined,
      background: undefined,
      preview: undefined,
      qualityOptions: [],
      backgroundOptions: [],
    })
    expect(snapshot.count).toEqual({ value: 1, options: [1, 2, 4] })
    expect(snapshot.videoSpecs).toBeUndefined()
    expect(snapshot.audioReferences).toBeUndefined()
    expect(snapshot.sound).toBeUndefined()
  })

  it('只放用户真能跑的模型 —— 推荐一个跑不了的等于把人推去配置页', () => {
    const snapshot = buildImageOperatorSnapshot({
      form: FORM,
      modelOptions: [
        option({
          optionId: 'workspace:no-key',
          modelId: 'no-key',
          keyId: undefined,
        }),
        option({ optionId: 'workspace:has-key', modelId: 'has-key' }),
      ],
      selectedModel: undefined,
      references: { items: [], limit: 4 },
    })
    expect(snapshot.availableModels.map((model) => model.id)).toEqual([
      'has-key',
    ])
    // 没选模型 = `null`（明确「还没选」），⛔ 不是字段缺席（那是「这台机器不选模型」）。
    expect(snapshot.model).toBeNull()
  })
})
describe('buildLoraOperatorSnapshot（P4-C）', () => {
  const BASE_INPUT = {
    prompt: '水彩，雨天',
    negativePrompt: '',
    base: { id: 'illustrious-xl', label: 'Illustrious XL' },
    availableBases: [
      { id: 'illustrious-xl', label: 'Illustrious XL' },
      { id: 'anima-dit', label: 'Anima DiT' },
    ],
    baseFamily: 'illustrious',
    loras: [
      {
        id: 'lora-1',
        name: 'Ink Lines',
        weight: 0.8,
        enabled: true,
        family: 'illustrious',
        compatible: true,
        triggerWord: 'ink lines',
        triggerEnabled: true,
        recommendedPrompt: 'ink lines, rainy street',
        sourcePrompts: ['ink lines, rainy street, neon signage'],
      },
    ],
    references: { items: [{ url: 'https://cdn.example.com/a.png' }], limit: 2 },
    minWeight: 0.1,
    maxWeight: 2,
  }

  /**
   * ⭐ 这条用例是拍板 19 在 LoRA 域的落点：**缺席的那几节都是真的没有那个控件**。
   * 补一个空的 `specs` 会让助手去调一条这台机器上永远无解的工具
   * （装配台有比例、没有清晰度，而 `set_specs` 两个字段都是必填）。
   */
  it('⛔ 不给 specs / count / videoSpecs / audioReferences / sound', () => {
    const snapshot = buildLoraOperatorSnapshot(BASE_INPUT)
    expect(snapshot.specs).toBeUndefined()
    expect(snapshot.count).toBeUndefined()
    expect(snapshot.videoSpecs).toBeUndefined()
    expect(snapshot.audioReferences).toBeUndefined()
    expect(snapshot.sound).toBeUndefined()
  })

  it('挂载栈、底模家族、权重值域一起给；参考图节照给', () => {
    const snapshot = buildLoraOperatorSnapshot(BASE_INPUT)
    expect(snapshot.loras).toEqual({
      items: [
        {
          id: 'lora-1',
          name: 'Ink Lines',
          weight: 0.8,
          enabled: true,
          family: 'illustrious',
          compatible: true,
          triggerWord: 'ink lines',
          triggerEnabled: true,
          recommendedPrompt: 'ink lines, rainy street',
          sourcePrompts: ['ink lines, rainy street, neon signage'],
        },
      ],
      baseFamily: 'illustrious',
      minWeight: 0.1,
      maxWeight: 2,
    })
    expect(snapshot.references).toEqual({
      items: [{ url: 'https://cdn.example.com/a.png' }],
      limit: 2,
    })
  })

  /**
   * ⚠ 底模没选时 `model` 是 `null` **不是缺席**：装配台上那颗选择器一直在，
   * 「还没选」与「这台机器不选模型」在协议里是两档。
   */
  it('底模没选时 model 是 null（不是字段缺席）', () => {
    const snapshot = buildLoraOperatorSnapshot({ ...BASE_INPUT, base: null })
    expect(snapshot.model).toBeNull()
    expect('model' in snapshot).toBe(true)
  })

  /**
   * ⚠ 空串与 `null` 必须落在同一档：库记录上的 `triggerWord` 是个可以为空串的
   * `string`，原样带上去会被状态块印成一对空引号，而模型会照着往正文里写。
   */
  it('触发词空白归一成 null，⛔ 不把空串当「有一个空的触发词」', () => {
    const snapshot = buildLoraOperatorSnapshot({
      ...BASE_INPUT,
      loras: [
        { ...BASE_INPUT.loras[0], triggerWord: '' },
        {
          ...BASE_INPUT.loras[0],
          id: 'lora-2',
          triggerWord: '   ',
          recommendedPrompt: '',
        },
        { ...BASE_INPUT.loras[0], id: 'lora-3', triggerWord: ' ink lines ' },
      ],
    })
    expect(
      snapshot.loras?.items.map((item) => [
        item.triggerWord,
        item.recommendedPrompt,
      ]),
    ).toEqual([
      [null, 'ink lines, rainy street'],
      [null, null],
      ['ink lines', 'ink lines, rainy street'],
    ])
  })

  /** chip 的开关**从入参照抄**，⛔ 不在这里按有没有触发词重算。 */
  it('触发词 chip 关着时 triggerEnabled 是 false', () => {
    const snapshot = buildLoraOperatorSnapshot({
      ...BASE_INPUT,
      loras: [{ ...BASE_INPUT.loras[0], triggerEnabled: false }],
    })
    expect(snapshot.loras?.items[0]?.triggerEnabled).toBe(false)
  })

  it('推荐提示词按 maxPromptChars 截断（⛔ 不让整条快照因为一把 LoRA 落不了库）', () => {
    const max = ASSISTANT_OPERATOR_LIMITS.maxPromptChars
    const snapshot = buildLoraOperatorSnapshot({
      ...BASE_INPUT,
      loras: [
        { ...BASE_INPUT.loras[0], recommendedPrompt: 'a'.repeat(max + 20) },
      ],
    })
    expect(snapshot.loras?.items[0]?.recommendedPrompt).toHaveLength(max)
  })

  /**
   * 来源图提示词（取材阶梯第二档的料）：**空白的丢掉、逐条截断、按条数封顶**。
   *
   * ⚠ 钉的是「顺序不能反」：先截条数的话，前几条恰好是空白时名额就被空白吃掉了，
   * 表现是助手手上一条来源配方都没有，而缓存里明明有。
   */
  it('来源图提示词：空白丢掉、逐条截断、按条数封顶', () => {
    const max = ASSISTANT_OPERATOR_LIMITS.maxPromptChars
    const cap = ASSISTANT_OPERATOR_LIMITS.maxLoraSourcePrompts
    const snapshot = buildLoraOperatorSnapshot({
      ...BASE_INPUT,
      loras: [
        {
          ...BASE_INPUT.loras[0],
          sourcePrompts: [
            '   ',
            ' rainy street ',
            'b'.repeat(max + 20),
            ...Array.from({ length: cap }, (_, i) => `extra ${i}`),
          ],
        },
      ],
    })
    const prompts = snapshot.loras?.items[0]?.sourcePrompts ?? []
    expect(prompts).toHaveLength(cap)
    expect(prompts[0]).toBe('rainy street')
    expect(prompts[1]).toHaveLength(max)
  })

  it('一条来源图提示词都没有时给空数组（⛔ 不是缺席：那格恒在）', () => {
    const snapshot = buildLoraOperatorSnapshot({
      ...BASE_INPUT,
      loras: [{ ...BASE_INPUT.loras[0], sourcePrompts: [] }],
    })
    expect(snapshot.loras?.items[0]?.sourcePrompts).toEqual([])
  })

  it('挂载栈是空的时候给空数组，⛔ 不是整节缺席（那是「没有挂载栈」）', () => {
    const snapshot = buildLoraOperatorSnapshot({ ...BASE_INPUT, loras: [] })
    expect(snapshot.loras?.items).toEqual([])
  })

  it('负面框有就给（空串 = 框在但空着）', () => {
    expect(buildLoraOperatorSnapshot(BASE_INPUT).negativePrompt).toBe('')
    expect(
      buildLoraOperatorSnapshot({ ...BASE_INPUT, negativePrompt: undefined })
        .negativePrompt,
    ).toBe('')
  })

  it('整份快照过得了协议 schema', () => {
    expect(
      AssistantOperatorSnapshotSchema.safeParse(
        buildLoraOperatorSnapshot(BASE_INPUT),
      ).success,
    ).toBe(true)
  })
})

/**
 * 视频参考槽（第二期）。⭐ 这一组锁的全是**「缺席即拒」**那条纪律的落点：
 * 一节给出来就等于告诉助手「这里有个格子」，而它会去填。
 */
describe('buildVideoOperatorSnapshot · 具名帧槽与参考视频（第二期）', () => {
  it('关键帧档给 frameReferences，槽数来自契约的 keyframeSlots', () => {
    const snapshot = buildVideoOperatorSnapshot({
      form: {
        ...FORM,
        videoFrameSlots: {
          first: 'https://cdn.example.com/first.png',
          last: 'https://cdn.example.com/last.png',
        },
      },
      modelOptions: [SEEDANCE_ON_BYTEPLUS],
      selectedModel: SEEDANCE_ON_BYTEPLUS,
      references: { items: [], limit: 4 },
      videoMode: 'keyframe',
    })
    expect(snapshot.frameReferences).toEqual({
      first: { url: 'https://cdn.example.com/first.png' },
      last: { url: 'https://cdn.example.com/last.png' },
      slots: 2,
    })
  })

  it('⛔ 只有首帧的模型上尾帧整格不给（声明得比实现宽 = 用户填了被静默丢掉）', () => {
    videoContract({ keyframeSlots: 1 })
    const snapshot = buildVideoOperatorSnapshot({
      form: {
        ...FORM,
        videoFrameSlots: {
          first: 'https://cdn.example.com/first.png',
          last: 'https://cdn.example.com/last.png',
        },
      },
      modelOptions: [SEEDANCE_ON_BYTEPLUS],
      selectedModel: SEEDANCE_ON_BYTEPLUS,
      references: { items: [], limit: 4 },
      videoMode: 'keyframe',
    })
    expect(snapshot.frameReferences).toEqual({
      first: { url: 'https://cdn.example.com/first.png' },
      slots: 1,
    })
  })

  it('⛔ 另外两档没有帧槽这回事 —— 整节缺席', () => {
    mockGetNodeModeForModel.mockReturnValue('multimodal')
    const snapshot = buildVideoOperatorSnapshot({
      form: {
        ...FORM,
        videoFrameSlots: {
          first: 'https://cdn.example.com/first.png',
          last: null,
        },
      },
      modelOptions: [SEEDANCE_ON_BYTEPLUS],
      selectedModel: SEEDANCE_ON_BYTEPLUS,
      references: { items: [], limit: 4 },
      videoMode: 'multimodal',
    })
    expect(snapshot.frameReferences).toBeUndefined()
  })

  it('参考视频：槽位为 0 时整节缺席，>0 时带上限', () => {
    videoContract({ videos: 0 })
    expect(
      buildVideoOperatorSnapshot({
        form: FORM,
        modelOptions: [SEEDANCE_ON_BYTEPLUS],
        selectedModel: SEEDANCE_ON_BYTEPLUS,
        references: { items: [], limit: 4 },
        videoMode: 'keyframe',
      }).videoReferences,
    ).toBeUndefined()

    videoContract({ videos: 3 })
    expect(
      buildVideoOperatorSnapshot({
        form: {
          ...FORM,
          videoReferenceVideos: ['https://cdn.example.com/a.mp4', 'blob:nope'],
        },
        modelOptions: [SEEDANCE_ON_BYTEPLUS],
        selectedModel: SEEDANCE_ON_BYTEPLUS,
        references: { items: [], limit: 4 },
        videoMode: 'keyframe',
      }).videoReferences,
    ).toEqual({
      // ⚠ 非 http(s) 的照旧滤掉（与参考图那条同一道闸：schema 要求合法 URL）。
      items: [{ url: 'https://cdn.example.com/a.mp4' }],
      limit: 3,
    })
  })

  it('带图锁原样透传契约 —— ⛔ 这一层不判「现在有没有图」', () => {
    videoContract({ imageAspectRatioLock: 'adaptive' })
    const snapshot = buildVideoOperatorSnapshot({
      form: FORM,
      modelOptions: [SEEDANCE_ON_BYTEPLUS],
      selectedModel: SEEDANCE_ON_BYTEPLUS,
      references: { items: [], limit: 4 },
      videoMode: 'keyframe',
    })
    expect(snapshot.videoSpecs?.aspectRatioLock).toBe('adaptive')
  })
})
