import { describe, expect, it } from 'vitest'

import { ASSISTANT_OPERATOR_LIMITS } from '@/constants/assistant-operator'
import {
  AI_MODELS,
  getAvailableVideoModels,
  getModelById,
} from '@/constants/models'
import {
  AI_ADAPTER_TYPES,
  getDefaultProviderConfig,
} from '@/constants/providers'
import {
  getVideoModelParameterOptions,
  getVideoModelSendContract,
} from '@/constants/video-model-send-plan'
import {
  isVideoPickerModel,
  resolveVideoSendModelId,
} from '@/constants/video-node-modes'
import {
  buildImageOperatorSnapshot,
  buildLoraOperatorSnapshot,
  buildVideoOperatorSnapshot,
  type StudioOperatorSnapshotForm,
} from '@/lib/studio-operator-snapshot'
import { getStudioVideoCapacity } from '@/lib/studio/video-workbench-slots'
import { AssistantOperatorSnapshotSchema } from '@/types/assistant-operator'
import type { StudioModelOption } from '@/types/model-option'

/**
 * 快照构造器（纯函数，L1）。⭐ 全部跑在**真目录**上：契约表、素材轨容量、能力表、
 * 模型默认值一律不替。视频那几组用「能力对得上的真型号」——按谓词从目录里挑
 * （`videoModelWhere`），挑不到就直接红（说明目录变了，换一条能力对得上的）。
 * 图片那几组点名用今天目录里的真型号，期望值就是它们在能力表里的样子。
 */

const FORM: StudioOperatorSnapshotForm = {
  prompt: '雨里撑伞的少女',
  negativePrompt: undefined,
  aspectRatio: '16:9',
  imageResolution: 'auto',
  imageBatchCount: 1,
  advancedParams: {},
  videoDurationSeconds: 5,
  videoResolution: '720p',
  videoAudioRefs: [],
  videoFrameSlots: { first: null, last: null },
  videoReferenceVideos: [],
  videoSoundEnabled: null,
}

/** 目录里一个真型号的选项行；渠道默认是它在目录里的 adapter。 */
function option(
  modelId: string,
  overrides: Partial<StudioModelOption> = {},
): StudioModelOption {
  const adapterType =
    overrides.adapterType ??
    (getModelById(modelId)?.adapterType as AI_ADAPTER_TYPES | undefined) ??
    AI_ADAPTER_TYPES.FAL
  return {
    optionId: `workspace:${modelId}`,
    modelId,
    adapterType,
    providerConfig: getDefaultProviderConfig(adapterType),
    requestCount: 30,
    isBuiltIn: true,
    sourceType: 'workspace',
    keyId: 'key-1',
    ...overrides,
  }
}

interface VideoTraits {
  frames: number
  references: number | null
  videos: number
  audios: number
  sound: boolean
  negativePrompt: boolean
  aspectRatioLock: string | null
  audioRequiresVisual: boolean
  resolutions: readonly string[]
}

function traitsOf(modelId: string, adapterType: AI_ADAPTER_TYPES) {
  const capacity = getStudioVideoCapacity(modelId, adapterType)
  const contract = getVideoModelSendContract(modelId, adapterType)
  const referenceId = resolveVideoSendModelId(modelId, adapterType, true)
  return {
    ...capacity,
    sound: contract.parameters.generateAudio,
    negativePrompt: contract.parameters.negativePrompt,
    aspectRatioLock: contract.imageAspectRatioLock,
    audioRequiresVisual: Boolean(
      getVideoModelSendContract(referenceId, adapterType).slots
        .audioRequiresVisual,
    ),
    resolutions: getVideoModelParameterOptions(modelId, adapterType)
      .resolutions,
  } satisfies VideoTraits
}

/** 选择器里点得到、且能力对得上的第一个真视频型号。 */
function videoModelWhere(
  describe: string,
  predicate: (traits: VideoTraits) => boolean,
): StudioModelOption {
  for (const model of getAvailableVideoModels()) {
    const adapterType = model.adapterType as AI_ADAPTER_TYPES
    if (!isVideoPickerModel(model.id, adapterType)) continue
    if (predicate(traitsOf(model.id, adapterType)))
      return option(model.id, { adapterType, displayLabel: model.id })
  }
  throw new Error(`目录里已经没有「${describe}」的视频型号，换一条能力对得上的`)
}

/** 视频这几组的主角：首尾帧、参考视频 / 音频、出声开关都有的那条。 */
const FULL_VIDEO = videoModelWhere(
  '首尾帧 + 参考视频 + 参考音频 + 出声',
  (t) => t.frames === 2 && t.videos > 0 && t.audios > 0 && t.sound,
)

function buildVideo(
  selectedModel: StudioModelOption,
  form: Partial<StudioOperatorSnapshotForm> = {},
) {
  return buildVideoOperatorSnapshot({
    form: { ...FORM, ...form },
    modelOptions: [selectedModel],
    selectedModel,
    references: { items: [], limit: 4 },
  })
}

describe('buildVideoOperatorSnapshot', () => {
  const ON_BYTEPLUS = option('seedance-2.5-byteplus', {
    optionId: 'workspace:seedance-2.5-byteplus',
    displayLabel: 'Seedance 2.5',
    requestCount: 22,
  })
  const ON_FAL = option('seedance-2.5', {
    displayLabel: 'Seedance 2.5',
    requestCount: 48,
  })

  it('⭐ 模型目录按 optionId 给，每行带渠道与积分（K-3：同型号不同渠道差一倍多）', () => {
    const snapshot = buildVideoOperatorSnapshot({
      form: FORM,
      modelOptions: [ON_BYTEPLUS, ON_FAL],
      selectedModel: ON_BYTEPLUS,
      references: { items: [], limit: 4 },
    })

    // ⛔ 不按 modelId 去重：一个型号在几条渠道上就是几行。
    expect(snapshot.availableModels).toEqual([
      {
        id: 'workspace:seedance-2.5-byteplus',
        label: 'Seedance 2.5 · BytePlus · 22 credits',
        catalogId: 'seedance-2.5-byteplus',
      },
      {
        id: 'workspace:seedance-2.5',
        label: 'Seedance 2.5 · fal.ai · 48 credits',
        catalogId: 'seedance-2.5',
      },
    ])
    // 选中项也用 optionId —— `set_model` 落地那一跳按它查。
    expect(snapshot.model).toEqual({
      id: 'workspace:seedance-2.5-byteplus',
      label: 'Seedance 2.5 · BytePlus · 22 credits',
      // 目录 id —— 写法规则按它查（选项 id 查不到）。
      catalogId: 'seedance-2.5-byteplus',
    })
  })

  it('名单一行一个型号 × 渠道 —— 参考端点不单列（与左栏选择器同一个谓词，拍板 19）', () => {
    const referenceEndpoint = option('seedance-2.5-reference-byteplus')
    const snapshot = buildVideoOperatorSnapshot({
      form: FORM,
      modelOptions: [ON_BYTEPLUS, referenceEndpoint],
      selectedModel: ON_BYTEPLUS,
      references: { items: [], limit: 4 },
    })
    expect(snapshot.availableModels.map((model) => model.id)).toEqual([
      'workspace:seedance-2.5-byteplus',
    ])
  })

  it('⛔ 视频快照里没有 specs / count 两节 —— 缺席即拒，那正是它们该有的行为', () => {
    const plain = videoModelWhere(
      '能选 720p、带图不锁比例',
      (t) => t.resolutions.includes('720p') && t.aspectRatioLock === null,
    )
    const snapshot = buildVideo(plain)
    expect(snapshot.specs).toBeUndefined()
    expect(snapshot.count).toBeUndefined()
    const params = getVideoModelParameterOptions(
      plain.modelId,
      plain.adapterType,
    )
    expect(snapshot.videoSpecs).toMatchObject({
      durationSeconds: params.durations.includes(5) ? 5 : null,
      aspectRatio: '16:9',
      resolution: '720p',
      resolutionOptions: params.resolutions,
      // 带图锁（第二期）：契约里没有就是 `null`，⛔ 不缺席（缺席读起来像「没这回事」）。
      aspectRatioLock: null,
    })
    expect(snapshot.videoSpecs?.aspectRatioOptions).toContain('16:9')
  })

  it('现值不在档位表里就报 null —— ⛔ 不印一个弹层里点不回去的值', () => {
    const noResolution = videoModelWhere(
      '没有清晰度档位',
      (t) => t.resolutions.length === 0,
    )
    const snapshot = buildVideo(noResolution, {
      videoDurationSeconds: 999,
      aspectRatio: '7:3',
    })
    expect(snapshot.videoSpecs).toMatchObject({
      durationSeconds: null,
      aspectRatio: null,
      resolution: null,
      resolutionOptions: [],
    })
  })

  it('⭐ 出声开关三态：用户没设过时 value 是 null，effective 走目录默认', () => {
    const snapshot = buildVideo(FULL_VIDEO)
    // ⛔ 把「没设过」端上去成 false，在目录默认为开的模型上结果正好相反。
    expect(snapshot.sound).toEqual({
      value: null,
      effective:
        getModelById(FULL_VIDEO.modelId)?.videoDefaults?.generateAudio ?? true,
    })
    expect(buildVideo(FULL_VIDEO, { videoSoundEnabled: false }).sound).toEqual({
      value: false,
      effective: false,
    })
  })

  it('线路没有出声开关时整节缺席（界面上那颗 Switch 也不渲染）', () => {
    const silent = videoModelWhere('没有出声开关', (t) => !t.sound)
    expect(buildVideo(silent).sound).toBeUndefined()
  })

  it('音频参考位：上限与「能不能只挂声音」都按线路给（台账 A ②）', () => {
    const AUDIO_REF = {
      id: 'a1',
      url: 'https://cdn.example.com/line.mp3',
      fileName: '我不走',
      ownerName: '阿岚',
    }
    for (const requiresVisual of [true, false]) {
      const model = videoModelWhere(
        `收音频参考、${requiresVisual ? '不能' : '能'}只挂声音`,
        (t) => t.audios > 0 && t.audioRequiresVisual === requiresVisual,
      )
      expect(
        buildVideo(model, { videoAudioRefs: [AUDIO_REF] }).audioReferences,
      ).toEqual({
        items: [
          {
            url: 'https://cdn.example.com/line.mp3',
            label: '我不走',
            ownerName: '阿岚',
          },
        ],
        limit: getStudioVideoCapacity(model.modelId, model.adapterType).audios,
        requiresVisual,
      })
    }
  })

  it('线路不吃音频参考（槽 0）时整节缺席 —— 助手连试都不会试', () => {
    const deaf = videoModelWhere('不收音频参考', (t) => t.audios === 0)
    expect(buildVideo(deaf).audioReferences).toBeUndefined()
  })

  it('产出过得了契约 schema（服务端收的就是它）', () => {
    const snapshot = buildVideoOperatorSnapshot({
      form: FORM,
      modelOptions: [ON_BYTEPLUS, ON_FAL],
      selectedModel: ON_BYTEPLUS,
      references: {
        items: [
          { url: 'https://cdn.example.com/a.png' },
          // blob: 进不去 —— schema 要求合法 URL，混进去整个请求 400。
          { url: 'blob:http://localhost/abc' },
        ],
        limit: 4,
      },
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
  /** fal 上的 Seedream 5.0 Pro：今天能力表里一颗专属 chip 都没有，清晰度只有 2K。 */
  const PLAIN = 'seedream-5.0-pro'

  function buildImage(
    selected: StudioModelOption,
    input: Partial<Parameters<typeof buildImageOperatorSnapshot>[0]> = {},
  ) {
    return buildImageOperatorSnapshot({
      form: FORM,
      modelOptions: [selected],
      selectedModel: selected,
      runModels: [selected],
      references: { items: [], limit: 4 },
      ...input,
    })
  }

  it('形状不变：按 modelId 去重、给 specs 与 count、⛔ 不带任何视频节', () => {
    const onWorkspace = option(PLAIN, { displayLabel: 'Seedream 5.0 Pro' })
    const saved = { ...onWorkspace, optionId: `saved:${PLAIN}` }
    const snapshot = buildImage(onWorkspace, {
      modelOptions: [onWorkspace, saved],
    })

    expect(snapshot.availableModels).toEqual([
      { id: PLAIN, label: 'Seedream 5.0 Pro' },
    ])
    expect(snapshot.model).toEqual({ id: PLAIN, label: 'Seedream 5.0 Pro' })
    expect(snapshot.specs).toEqual({
      aspectRatio: '16:9',
      resolution: 'auto',
      aspectRatioOptions: expect.arrayContaining(['1:1', '16:9']),
      resolutionOptions: ['2K'],
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
    // 只跑主模型 = 没有 `extraModels` 这一节。
    expect(snapshot).not.toHaveProperty('extraModels')
  })

  it('specs 的质量 / 背景档位按选中模型的能力表给', () => {
    const snapshot = buildImage(option('gpt-image-2'))
    expect(snapshot.specs).toMatchObject({
      qualityOptions: ['auto', 'low', 'medium', 'high'],
      backgroundOptions: ['auto', 'transparent', 'opaque'],
      resolutionOptions: ['auto', '1K', '2K', '4K'],
    })
  })

  /**
   * 渠道（进度表 10 + 21）—— **只在多渠道型号上给**，且折叠判据与选择器共用。
   */
  it('单渠道型号不给 channels —— 那上面「选渠道」这件事不存在', () => {
    const snapshot = buildImage(option(PLAIN))
    expect(snapshot.availableModels[0]).not.toHaveProperty('channels')
    expect(snapshot.model).not.toHaveProperty('channelId')
  })

  it('NovelAI V5 带上角色构图一节（现有名单原样）；没有角色构图的模型整节不给', () => {
    const nai = option(AI_MODELS.NOVELAI_V5_FULL)
    const layout = {
      positioning: 'auto' as const,
      characters: [
        { prompt: '', negativePrompt: '', position: { x: 0.5, y: 0.5 } },
      ],
    }
    const snapshot = buildImage(nai, {
      form: { ...FORM, advancedParams: { novelAiLayout: layout } },
      references: { items: [], limit: 1 },
    })
    expect(snapshot.novelAiCharacters).toEqual({
      mode: 'free',
      max: 22,
      layout,
    })
    const plain = buildImage(option(PLAIN))
    expect(plain).not.toHaveProperty('novelAiCharacters')
    expect(plain).not.toHaveProperty('novelAiSceneTexts')
  })

  it('画面文字一节带上现有清单与这个模型的字数上限（V4.5 只认英文）', () => {
    const build = (modelId: string) =>
      buildImage(option(modelId), {
        form: {
          ...FORM,
          advancedParams: {
            novelAiSceneTexts: [{ kind: 'sign', text: 'CAFE' }],
          },
        },
        references: { items: [], limit: 1 },
      })
    expect(build(AI_MODELS.NOVELAI_V5_FULL).novelAiSceneTexts).toEqual({
      items: [{ kind: 'sign', text: 'CAFE' }],
      maxChars: 750,
      latinOnly: false,
    })
    expect(build(AI_MODELS.NOVELAI_V45_CURATED).novelAiSceneTexts).toEqual({
      items: [{ kind: 'sign', text: 'CAFE' }],
      maxChars: 118,
      latinOnly: true,
    })
  })

  it('另一台图片工作台的模型单列一节（去重、只给跑得了的），缺席时整节不给', () => {
    const base = option(PLAIN)
    expect(buildImage(base, { runModels: [] })).not.toHaveProperty(
      'otherWorkbenchModels',
    )
    const nai = option(AI_MODELS.NOVELAI_V5_FULL, {
      displayLabel: 'NovelAI V5 Full',
    })
    const snapshot = buildImage(base, {
      runModels: [],
      otherModelOptions: [
        nai,
        { ...nai, optionId: 'saved:nai' },
        option(AI_MODELS.NOVELAI_V45_CURATED, { keyId: undefined }),
      ],
    })
    expect(snapshot.otherWorkbenchModels).toEqual([
      { id: AI_MODELS.NOVELAI_V5_FULL, label: 'NovelAI V5 Full' },
    ])
  })

  it('⭐ 多渠道型号：channels 用的是选择器那一行的 optionId，并写出当前在跑哪条', () => {
    const onFal = option(PLAIN, { keyId: 'key-fal' })
    const onBytePlus = option(PLAIN, {
      optionId: `saved:${PLAIN}-byteplus`,
      adapterType: AI_ADAPTER_TYPES.BYTEPLUS,
      providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.BYTEPLUS),
      keyId: 'key-byteplus',
    })
    const snapshot = buildImage(onBytePlus, {
      modelOptions: [onFal, onBytePlus],
    })
    expect(snapshot.availableModels[0]?.channels).toEqual([
      { id: `workspace:${PLAIN}`, label: 'fal.ai' },
      { id: `saved:${PLAIN}-byteplus`, label: 'BytePlus' },
    ])
    expect(snapshot.model).toMatchObject({
      id: PLAIN,
      channelId: `saved:${PLAIN}-byteplus`,
    })
  })

  /**
   * 专属 chip 行（进度表 21）—— **白名单来自派生**，⛔ 不是这里写死的一张表。
   */
  it('capabilities 这一节从能力表派生：一颗都没有就整节缺席', () => {
    expect(buildImage(option(PLAIN)).capabilities).toBeUndefined()
  })

  /** 火山上的 Seedream 5.0 Pro：滑杆（引导）、下拉（背景）、开关（分层）各一颗，后两颗要参考图。 */
  const PRO_VOLC = 'seedream-5.0-pro-volcengine'
  const LITE_VOLC = 'seedream-5.0-lite-volcengine'

  it('⭐ 三种形态各自带上值域，参考图依赖那颗标 available=false', () => {
    const pro = option(PRO_VOLC)
    const snapshot = buildImage(pro, {
      form: { ...FORM, advancedParams: { background: 'transparent' } },
    })
    expect(snapshot.capabilities).toEqual([
      {
        key: 'guidanceScale',
        kind: 'slider',
        value: null,
        defaultValue: 8,
        range: { min: 1, max: 10, step: 0.5 },
        available: true,
      },
      {
        key: 'background',
        kind: 'select',
        // ⚠ 现值是**原始值**：助手要分得清「没设过」与「选了缺省值」。
        value: 'transparent',
        defaultValue: 'opaque',
        options: ['opaque', 'transparent'],
        // 没挂参考图 = 画着但点不动（⛔ 不隐藏）。
        available: false,
      },
      {
        key: 'layerDecomposition',
        kind: 'toggle',
        value: null,
        defaultValue: false,
        available: false,
      },
    ])

    const mounted = buildImage(pro, {
      references: {
        items: [{ url: 'https://cdn.example.com/a.png' }],
        limit: 4,
      },
    })
    expect(
      mounted.capabilities
        ?.filter((chip) => chip.key !== 'guidanceScale')
        .map((chip) => chip.available),
    ).toEqual([true, true])
  })

  /**
   * 一轮多个模型（owner 2026-09-26）—— 与界面那行 chip 同一份并集。
   * 火山上的 Lite 只有引导，Pro 多出背景 / 分层。
   */
  it('⭐ 主模型是 Lite 也看得见 Pro 才有的项，并注明只对谁生效', () => {
    const lite = option(LITE_VOLC, { displayLabel: 'Seedream Lite' })
    const pro = option(PRO_VOLC, { displayLabel: 'Seedream Pro' })
    const snapshot = buildImage(lite, {
      form: { ...FORM, advancedParams: { background: 'transparent' } },
      modelOptions: [lite, pro],
      runModels: [lite, pro],
    })

    expect(
      snapshot.capabilities?.map(({ key, models }) => ({ key, models })),
    ).toEqual([
      // 两个都认 = 不带 `models`。
      { key: 'guidanceScale', models: undefined },
      { key: 'background', models: [PRO_VOLC] },
      { key: 'layerDecomposition', models: [PRO_VOLC] },
    ])
    expect(
      snapshot.capabilities?.find((chip) => chip.key === 'background')?.value,
    ).toBe('transparent')
    // 服务端 `set_model` 之后按「新主模型 + 这几个」重算 —— 主模型不在里面。
    expect(snapshot.extraModels).toEqual([
      { id: PRO_VOLC, label: 'Seedream Pro' },
    ])
    expect(AssistantOperatorSnapshotSchema.safeParse(snapshot).success).toBe(
      true,
    )
  })

  it('⭐ 主线路没有专属项、另一个模型有 → 这一节照样给（⛔ 不整节缺席）', () => {
    const onFal = option(PLAIN)
    const pro = option(PRO_VOLC)
    const snapshot = buildImage(onFal, {
      modelOptions: [onFal, pro],
      runModels: [onFal, pro],
    })
    expect(snapshot.capabilities?.map((chip) => chip.key)).toEqual([
      'guidanceScale',
      'background',
      'layerDecomposition',
    ])
    expect(
      snapshot.capabilities?.every((chip) => chip.models?.join() === PRO_VOLC),
    ).toBe(true)
  })

  it('这一轮一个模型都跑不了（跨台陈旧选择）→ 与界面一样没有专属行', () => {
    const lite = option(LITE_VOLC)
    expect(buildImage(lite, { runModels: [] }).capabilities).toBeUndefined()
  })

  /**
   * 种子（10-21 真机：助手说「这个工作台没有种子选项，我没法替你锁」）。
   * 判据与标签台参数弹层那格同源；自然语言台没有那一格，⛔ 不给。
   */
  it('⭐ 标签台多一格种子，自然语言台的模型认 seed 也不给', () => {
    const nai = option(AI_MODELS.NOVELAI_V5_FULL)
    const tags = buildImage(nai, {
      form: { ...FORM, advancedParams: { seed: 3513516593 } },
      references: { items: [], limit: 1 },
    })
    // 种子排在 chip 后面。
    expect(tags.capabilities?.at(-1)).toEqual({
      key: 'seed',
      kind: 'seed',
      value: 3513516593,
      range: { min: 0, max: 4294967295, step: 1 },
      available: true,
    })
    expect(AssistantOperatorSnapshotSchema.safeParse(tags).success).toBe(true)

    // 火山 Seedream 的能力表认 seed，但它在自然语言台。
    const natural = buildImage(option('seedream-5.0-volcengine'), {
      form: { ...FORM, advancedParams: { seed: 7 } },
    })
    expect(natural.capabilities?.map((chip) => chip.key)).not.toContain('seed')
  })

  it('只放用户真能跑的模型 —— 推荐一个跑不了的等于把人推去配置页', () => {
    const snapshot = buildImageOperatorSnapshot({
      form: FORM,
      modelOptions: [
        option('gpt-image-2', { keyId: undefined }),
        option(PLAIN),
      ],
      selectedModel: undefined,
      runModels: [],
      references: { items: [], limit: 4 },
    })
    expect(snapshot.availableModels.map((model) => model.id)).toEqual([PLAIN])
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
  const FRAMES = {
    videoFrameSlots: {
      first: 'https://cdn.example.com/first.png',
      last: 'https://cdn.example.com/last.png',
    },
  }

  it('关键帧档给 frameReferences，槽数来自契约的 keyframeSlots', () => {
    expect(buildVideo(FULL_VIDEO, FRAMES).frameReferences).toEqual({
      first: { url: 'https://cdn.example.com/first.png' },
      last: { url: 'https://cdn.example.com/last.png' },
      slots: 2,
    })
  })

  it('⛔ 只有首帧的模型上尾帧整格不给（声明得比实现宽 = 用户填了被静默丢掉）', () => {
    const firstOnly = videoModelWhere('只有首帧', (t) => t.frames === 1)
    expect(buildVideo(firstOnly, FRAMES).frameReferences).toEqual({
      first: { url: 'https://cdn.example.com/first.png' },
      slots: 1,
    })
  })

  it('⛔ 型号不吃首尾帧时帧槽整节缺席', () => {
    const noFrames = videoModelWhere('不吃首尾帧', (t) => t.frames === 0)
    expect(
      buildVideo(noFrames, {
        videoFrameSlots: {
          first: 'https://cdn.example.com/first.png',
          last: null,
        },
      }).frameReferences,
    ).toBeUndefined()
  })

  it('参考视频：槽位为 0 时整节缺席，>0 时带上限', () => {
    const noVideos = videoModelWhere('不收参考视频', (t) => t.videos === 0)
    expect(buildVideo(noVideos).videoReferences).toBeUndefined()

    expect(
      buildVideo(FULL_VIDEO, {
        videoReferenceVideos: ['https://cdn.example.com/a.mp4', 'blob:nope'],
      }).videoReferences,
    ).toEqual({
      // ⚠ 非 http(s) 的照旧滤掉（与参考图那条同一道闸：schema 要求合法 URL）。
      items: [{ url: 'https://cdn.example.com/a.mp4' }],
      limit: getStudioVideoCapacity(FULL_VIDEO.modelId, FULL_VIDEO.adapterType)
        .videos,
    })
  })

  it('⭐ 负面框只在实际端点收这个字段时给（视频画板 W6）—— 否则缺席，助手改写进正文', () => {
    const without = videoModelWhere('不收负面', (t) => !t.negativePrompt)
    expect(
      buildVideo(without, { negativePrompt: '字幕' }).negativePrompt,
    ).toBeUndefined()

    const withField = videoModelWhere('收负面', (t) => t.negativePrompt)
    expect(
      buildVideo(withField, { negativePrompt: '字幕' }).negativePrompt,
    ).toBe('字幕')
  })

  it('带图锁原样透传契约 —— ⛔ 这一层不判「现在有没有图」', () => {
    const locked = videoModelWhere(
      '带图锁成 adaptive',
      (t) => t.aspectRatioLock === 'adaptive',
    )
    expect(buildVideo(locked).videoSpecs?.aspectRatioLock).toBe('adaptive')
  })
})
