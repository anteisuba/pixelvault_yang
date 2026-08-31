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

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import type { StudioModelOption } from '@/components/business/ModelSelector'
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
  }> = {},
) {
  const merged = {
    audio: 10,
    audioRequiresVisual: false,
    sound: true,
    ...overrides,
  }
  mockGetVideoModelSendContract.mockReturnValue({
    slots: {
      images: 30,
      videos: 10,
      audio: merged.audio,
      audioRequiresVisual: merged.audioRequiresVisual,
    },
    parameters: { generateAudio: merged.sound },
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
