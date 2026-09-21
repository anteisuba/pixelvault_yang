import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import type { StudioFormState } from '@/contexts/studio-context'
import type { StudioModelOption } from '@/types/model-option'

import {
  modelPickerGateKey,
  resetModelPickerGate,
  setPendingModel,
  subscribeModelPickerOpen,
} from '@/lib/model-picker-gate'

import { useStudioGenerateAction } from './use-studio-generate-action'

/**
 * `useStudioGenerateAction` 是**两个**生成按钮共用的那份闸门与请求组装
 * （桌面参数栏底部那颗 + 移动端 composer 的 44×44 方形键）。这里锁的就是
 * 「两处共用」这件事的判据本身：缺什么 → 哪一条 `blockedReason`，
 * 不缺 → `generate()` 收到什么载荷。
 */

const mockDispatch = vi.hoisted(() => vi.fn())
const mockGenerate = vi.hoisted(() => vi.fn())
const mockUseStudioForm = vi.hoisted(() => vi.fn())
const mockUseImageModelOptions = vi.hoisted(() => vi.fn())
const mockToastInfo = vi.hoisted(() => vi.fn())

const EMPTY_PANELS: StudioFormState['panels'] = {
  cardManagement: false,
  projectHistory: false,
  modelSelector: false,
  civitai: false,
  cardSelector: false,
  enhance: false,
  stylePreset: false,
  reverse: false,
  refImage: false,
  audioReading: false,
  musicSpec: false,
  loraSelector: false,
  voiceSelector: false,
  voiceTrainer: false,
  audioTranscribe: false,
  sfxParams: false,
  script: false,
  videoAudio: false,
  keepChange: false,
}

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}))

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    info: mockToastInfo,
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  }),
}))

vi.mock('@/lib/focus-studio-prompt', () => ({
  focusStudioPrompt: vi.fn(),
}))

vi.mock('@/contexts/studio-context', () => ({
  useStudioForm: mockUseStudioForm,
  useStudioData: () => ({
    styles: { activeCard: null, activeCardId: null },
    characters: { activeCardIds: [], activeCards: [] },
    backgrounds: { activeCardId: null },
    imageUpload: { referenceEntries: [], referenceImages: [] },
    projects: { activeProjectId: null },
  }),
  useStudioGen: () => ({
    isGenerating: false,
    generate: mockGenerate,
    elapsedSeconds: 0,
    // ⚠ 少这一个字段就等于把闸关上：`!undefined` 为真 → 视频档恒判「队列已满」。
    canQueueMoreVideo: true,
  }),
}))

// ⚠ 显式标成 `StudioModelOption`：这份夹具会原样喂给 `handleToggleRunModel`，
// 缺字段的话错会报在调用点而不是这里。
const IMAGE_OPTION: StudioModelOption = {
  optionId: 'image-option',
  modelId: 'gpt-image-2.5-flare',
  keyId: 'api-key-1',
  keyLabel: 'OpenAI',
  adapterType: AI_ADAPTER_TYPES.OPENAI,
  providerConfig: { label: 'OpenAI', baseUrl: 'https://api.openai.com' },
  sourceType: 'saved',
  isBuiltIn: true,
  requestCount: 1,
}

vi.mock('@/hooks/use-image-model-options', () => ({
  useImageModelOptions: mockUseImageModelOptions,
}))

vi.mock('@/hooks/use-audio-model-options', () => ({
  useAudioModelOptions: () => ({ selectedModel: null, modelOptions: [] }),
}))

vi.mock('@/hooks/use-video-model-options', () => ({
  useVideoModelOptions: () => ({ selectedModel: null, modelOptions: [] }),
}))

vi.mock('@/hooks/cards/use-voice-cards', () => ({
  useVoiceCards: () => ({ findCard: () => null }),
}))

vi.mock('@/hooks/use-studio-video-mode', () => ({
  useStudioVideoMode: () => ({ mode: 'keyframe', setMode: vi.fn() }),
}))

function makeState(overrides: Partial<StudioFormState> = {}) {
  return {
    prompt: '',
    outputType: 'image',
    promptDialect: 'natural',
    tagChips: [],
    tagNegativeChips: [],
    activeTagCharacterIndex: null,
    workflowMode: 'quick',
    selectedWorkflowId: 'quick-image',
    selectedOptionId: null,
    extraModelOptionIds: [],
    aspectRatio: '1:1',
    imageBatchCount: 1,
    advancedParams: {},
    panels: EMPTY_PANELS,
    generateRequestId: 0,
    stylePresetId: 'none',
    recipeUsage: null,
    videoAudioRefs: [],
    videoGenerateAudio: null,
    videoDuration: 5,
    videoResolution: undefined,
    videoMode: 'keyframe',
    audioKind: 'speech',
    audioReferenceUrl: '',
    audioReferenceText: '',
    audioSpeakerVoiceIds: [],
    pronunciationDictionary: {},
    audioPace: 'normal',
    voiceCardId: null,
    ...overrides,
  } as unknown as StudioFormState
}

function setState(overrides: Partial<StudioFormState> = {}) {
  mockUseStudioForm.mockReturnValue({
    state: makeState(overrides),
    dispatch: mockDispatch,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  resetModelPickerGate()
  mockUseImageModelOptions.mockReturnValue({
    selectedModel: IMAGE_OPTION,
    modelOptions: [IMAGE_OPTION],
  })
  setState()
})

describe('useStudioGenerateAction', () => {
  it('blocks a missing image mention without submitting a generation', async () => {
    setState({
      prompt: 'Use @Image2',
      selectedOptionId: IMAGE_OPTION.optionId,
    } as Partial<StudioFormState>)
    const { result } = renderHook(() => useStudioGenerateAction())
    expect(result.current.canGenerate).toBe(false)
    expect(result.current.blockedReason?.message).toBe(
      'referenceMention.invalid',
    )
    await act(async () => {
      await result.current.handleGenerate()
    })
    expect(mockGenerate).not.toHaveBeenCalled()
  })

  it('blocks with modelRequired when no model is selected', () => {
    mockUseImageModelOptions.mockReturnValue({
      selectedModel: null,
      modelOptions: [],
    })
    setState({ prompt: 'a cat' } as Partial<StudioFormState>)

    const { result } = renderHook(() => useStudioGenerateAction())

    expect(result.current.canGenerate).toBe(false)
    expect(result.current.blockedReason?.message).toBe('blocked.modelRequired')
  })

  it('blocks with promptRequired when the prompt is empty', () => {
    setState({
      selectedOptionId: IMAGE_OPTION.optionId,
    } as Partial<StudioFormState>)

    const { result } = renderHook(() => useStudioGenerateAction())

    expect(result.current.blockedReason?.message).toBe('blocked.promptRequired')
    // 空提示词那条要把焦点送回输入框（桌面与移动端共用这一份判据）。
    expect(result.current.blockedReason?.focusPrompt).toBe('now')
  })

  it('clears the block and submits once model + prompt are both present', async () => {
    setState({
      prompt: 'a cat',
      selectedOptionId: IMAGE_OPTION.optionId,
    } as Partial<StudioFormState>)

    const { result } = renderHook(() => useStudioGenerateAction())

    expect(result.current.blockedReason).toBeNull()
    expect(result.current.canGenerate).toBe(true)

    await act(async () => {
      await result.current.handleGenerate()
    })

    expect(mockGenerate).toHaveBeenCalledTimes(1)
    expect(mockGenerate.mock.calls[0][0]).toMatchObject({
      mode: 'image',
      variantCount: 1,
      image: { modelId: IMAGE_OPTION.modelId, freePrompt: 'a cat' },
    })
  })

  it('surfaces the blocked reason as a toast instead of silently doing nothing', async () => {
    setState({
      selectedOptionId: IMAGE_OPTION.optionId,
    } as Partial<StudioFormState>)

    const { result } = renderHook(() => useStudioGenerateAction())

    await act(async () => {
      await result.current.handleGenerate()
    })

    expect(mockGenerate).not.toHaveBeenCalled()
    expect(mockToastInfo).toHaveBeenCalledWith('blocked.promptRequired')
  })

  it('carries the whole run list only when more than one model is picked', async () => {
    const second = {
      ...IMAGE_OPTION,
      optionId: 'image-option-2',
      modelId: 'gpt-image-2',
    }
    mockUseImageModelOptions.mockReturnValue({
      selectedModel: IMAGE_OPTION,
      modelOptions: [IMAGE_OPTION, second],
    })
    setState({
      prompt: 'a cat',
      selectedOptionId: IMAGE_OPTION.optionId,
      extraModelOptionIds: [second.optionId],
    } as Partial<StudioFormState>)

    const { result } = renderHook(() => useStudioGenerateAction())

    expect(result.current.runModels).toHaveLength(2)

    await act(async () => {
      await result.current.handleGenerate()
    })

    expect(mockGenerate.mock.calls[0][0].compareModels).toEqual([
      { modelId: IMAGE_OPTION.modelId, apiKeyId: IMAGE_OPTION.keyId },
      { modelId: second.modelId, apiKeyId: second.keyId },
    ])
  })

  // ⛔ 不跨方言（D10 ② Q3）：跨台留下来的陈旧选择不进这一轮的名单。
  it('drops a model from the other dialect', () => {
    const novelAi = {
      ...IMAGE_OPTION,
      optionId: 'nai-option',
      modelId: 'nai-diffusion-5-full',
      adapterType: 'novelai',
    }
    mockUseImageModelOptions.mockReturnValue({
      selectedModel: IMAGE_OPTION,
      modelOptions: [IMAGE_OPTION, novelAi],
    })
    setState({
      prompt: 'a cat',
      selectedOptionId: IMAGE_OPTION.optionId,
      extraModelOptionIds: [novelAi.optionId],
    } as Partial<StudioFormState>)

    const { result } = renderHook(() => useStudioGenerateAction())
    expect(result.current.runModels.map((o) => o.optionId)).toEqual([
      IMAGE_OPTION.optionId,
    ])
  })

  it('keeps only the tag-dialect models on the tag workbench', () => {
    const novelAi = {
      ...IMAGE_OPTION,
      optionId: 'nai-option',
      modelId: 'nai-diffusion-5-full',
      adapterType: 'novelai',
    }
    mockUseImageModelOptions.mockReturnValue({
      selectedModel: novelAi,
      modelOptions: [IMAGE_OPTION, novelAi],
    })
    setState({
      prompt: '1girl',
      promptDialect: 'tags',
      selectedOptionId: novelAi.optionId,
      extraModelOptionIds: [IMAGE_OPTION.optionId],
    } as Partial<StudioFormState>)

    const { result } = renderHook(() => useStudioGenerateAction())
    expect(result.current.runModels.map((o) => o.optionId)).toEqual([
      novelAi.optionId,
    ])
  })

  /**
   * ⭐ 真机 2026-09-20 的重复计费：名单里已有的那一条再点一次走了「新增」。
   * 名单长度必须**减一**，且任何时候不出现同一条路两份。
   */
  it('toggling a model already in the run list shortens it', async () => {
    const second = {
      ...IMAGE_OPTION,
      optionId: 'image-option-2',
      modelId: 'gpt-image-2',
    }
    mockUseImageModelOptions.mockReturnValue({
      selectedModel: IMAGE_OPTION,
      modelOptions: [IMAGE_OPTION, second],
    })
    setState({
      prompt: 'a cat',
      selectedOptionId: IMAGE_OPTION.optionId,
      extraModelOptionIds: [second.optionId],
    } as Partial<StudioFormState>)

    const { result } = renderHook(() => useStudioGenerateAction())
    expect(result.current.runModels).toHaveLength(2)

    // ⚠ 点的是**主模型**那一条 —— 它对 `TOGGLE_EXTRA_MODEL` 是个 no-op，
    // 「名单第一条点不掉」就是从这里来的。
    act(() => {
      result.current.handleToggleRunModel(IMAGE_OPTION)
    })
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'SET_OPTION_ID',
      payload: second.optionId,
    })
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'REMOVE_EXTRA_MODEL',
      payload: second.optionId,
    })
    expect(mockDispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'TOGGLE_EXTRA_MODEL' }),
    )
  })

  it('toggling a model that is not in the run list still adds it', () => {
    const second = {
      ...IMAGE_OPTION,
      optionId: 'image-option-2',
      modelId: 'gpt-image-2',
    }
    mockUseImageModelOptions.mockReturnValue({
      selectedModel: IMAGE_OPTION,
      modelOptions: [IMAGE_OPTION, second],
    })
    setState({
      prompt: 'a cat',
      selectedOptionId: IMAGE_OPTION.optionId,
    } as Partial<StudioFormState>)

    const { result } = renderHook(() => useStudioGenerateAction())
    act(() => {
      result.current.handleToggleRunModel(second)
    })
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'TOGGLE_EXTRA_MODEL',
      payload: second.optionId,
    })
  })

  it('replaces the entire family and clears its parameters even on the same provider', () => {
    const sibling = {
      ...IMAGE_OPTION,
      optionId: 'gpt-2',
      modelId: 'gpt-image-2',
    }
    const other = {
      ...IMAGE_OPTION,
      optionId: 'seedream',
      modelId: 'seedream-5.0',
    }
    mockUseImageModelOptions.mockReturnValue({
      selectedModel: IMAGE_OPTION,
      modelOptions: [IMAGE_OPTION, sibling, other],
    })
    setState({
      selectedOptionId: IMAGE_OPTION.optionId,
      extraModelOptionIds: [sibling.optionId],
    })
    const { result } = renderHook(() => useStudioGenerateAction())
    act(() => result.current.handleToggleRunModel(other))
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'REMOVE_EXTRA_MODEL',
      payload: sibling.optionId,
    })
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'SET_OPTION_ID',
      payload: other.optionId,
    })
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'RESET_ADVANCED_PARAMS' })
    expect(mockDispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'TOGGLE_EXTRA_MODEL' }),
    )
  })

  it('excludes stale cross-family selections from the generation request', async () => {
    const other = { ...IMAGE_OPTION, optionId: 'flux', modelId: 'flux-1' }
    mockUseImageModelOptions.mockReturnValue({
      selectedModel: IMAGE_OPTION,
      modelOptions: [IMAGE_OPTION, other],
    })
    setState({
      prompt: 'a cat',
      selectedOptionId: IMAGE_OPTION.optionId,
      extraModelOptionIds: [other.optionId],
    })
    const { result } = renderHook(() => useStudioGenerateAction())
    expect(result.current.runModels).toEqual([IMAGE_OPTION])
    await act(async () => {
      await result.current.handleGenerate()
    })
    expect(mockGenerate.mock.calls[0][0].compareModels).toBeUndefined()
    act(() => result.current.handleRemoveRunModel(IMAGE_OPTION.optionId))
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'SET_OPTION_ID',
      payload: null,
    })
  })

  // 同一条路的两个 optionId 若仍旧溜进 state，出图名单也只认一条 —— 算钱、
  // 裁剪 payload、画 chip 读的都是它。
  it('never runs the same route twice', () => {
    const twin: StudioModelOption = {
      ...IMAGE_OPTION,
      optionId: 'workspace:gpt-image-2.5-flare',
      sourceType: 'workspace',
      keyId: undefined,
    }
    mockUseImageModelOptions.mockReturnValue({
      selectedModel: IMAGE_OPTION,
      modelOptions: [IMAGE_OPTION, twin],
    })
    setState({
      prompt: 'a cat',
      selectedOptionId: IMAGE_OPTION.optionId,
      extraModelOptionIds: [twin.optionId],
    } as Partial<StudioFormState>)

    const { result } = renderHook(() => useStudioGenerateAction())
    expect(result.current.runModels).toHaveLength(1)
    expect(result.current.runModels[0].optionId).toBe(IMAGE_OPTION.optionId)
  })

  // 标签台那一枪要带着方言出门，翻译才发生在发请求那一跳。
  it('tells the generator which dialect the prompt came from', async () => {
    setState({
      prompt: '1girl, rain:1.2',
      promptDialect: 'tags',
      selectedOptionId: IMAGE_OPTION.optionId,
    } as Partial<StudioFormState>)
    mockUseImageModelOptions.mockReturnValue({
      selectedModel: { ...IMAGE_OPTION, adapterType: 'novelai' },
      modelOptions: [{ ...IMAGE_OPTION, adapterType: 'novelai' }],
    })

    const { result } = renderHook(() => useStudioGenerateAction())
    await act(async () => {
      await result.current.handleGenerate()
    })

    expect(mockGenerate.mock.calls[0][0].promptDialect).toBe('tags')
  })
})

/**
 * D2 Q1（owner 2026-09-17）：没有「自动」渠道 —— 多渠道型号没点过渠道就发不出去。
 * 桌面参数栏与移动端 composer 共用这一份判据（见本文件头注）。
 */
describe('useStudioGenerateAction — 未选渠道闸门', () => {
  it('型号在等渠道时不能生成，按钮上写「先选渠道」', () => {
    setState({
      prompt: 'a cat',
      selectedOptionId: IMAGE_OPTION.optionId,
    } as Partial<StudioFormState>)
    setPendingModel(modelPickerGateKey('image'), 'seedream-5.0-pro')

    const { result } = renderHook(() => useStudioGenerateAction())

    expect(result.current.canGenerate).toBe(false)
    expect(result.current.blockedReason?.message).toBe('pickChannel')
    expect(result.current.blockedReason?.action).toBe('pickChannel')
  })

  it('点这颗被挡住的按钮 → 打开选择器，⛔ 不发生成', async () => {
    const opened = vi.fn()
    subscribeModelPickerOpen(modelPickerGateKey('image'), opened)
    setState({
      prompt: 'a cat',
      selectedOptionId: IMAGE_OPTION.optionId,
    } as Partial<StudioFormState>)
    setPendingModel(modelPickerGateKey('image'), 'seedream-5.0-pro')

    const { result } = renderHook(() => useStudioGenerateAction())
    await act(async () => {
      await result.current.handleGenerate()
    })

    expect(opened).toHaveBeenCalledTimes(1)
    expect(mockGenerate).not.toHaveBeenCalled()
  })

  it('选定渠道之后闸门解除', () => {
    setState({
      prompt: 'a cat',
      selectedOptionId: IMAGE_OPTION.optionId,
    } as Partial<StudioFormState>)
    setPendingModel(modelPickerGateKey('image'), 'seedream-5.0-pro')
    setPendingModel(modelPickerGateKey('image'), null)

    const { result } = renderHook(() => useStudioGenerateAction())
    expect(result.current.canGenerate).toBe(true)
    expect(result.current.blockedReason).toBeNull()
  })

  /** ⚠ 画布卡的闸门带 gateId，⛔ 不能挡住工作台这一份。 */
  it('别的宿主（带 gateId）的待选渠道挡不住工作台', () => {
    setState({
      prompt: 'a cat',
      selectedOptionId: IMAGE_OPTION.optionId,
    } as Partial<StudioFormState>)
    setPendingModel(modelPickerGateKey('image', 'node-a'), 'seedream-5.0-pro')

    const { result } = renderHook(() => useStudioGenerateAction())
    expect(result.current.canGenerate).toBe(true)
  })
})
