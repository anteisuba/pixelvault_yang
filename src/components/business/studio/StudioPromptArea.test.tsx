import type { ComponentProps, ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AUDIO_PROMPT_PAYLOAD_MAX_CHARS } from '@/constants/audio-options'
import { CARD_RECIPE } from '@/constants/cards/card-types'
import { AI_MODELS } from '@/constants/models'
import { NO_STYLE_PRESET_ID } from '@/constants/style-presets'
import { WORKFLOW_IDS, type WorkflowId } from '@/constants/workflows'
import type { StudioFormState } from '@/contexts/studio-context'
import type { VoiceCardRecord } from '@/types'

import { StudioPromptArea } from './StudioPromptArea'

const mockDispatch = vi.hoisted(() => vi.fn())
const mockGenerate = vi.hoisted(() => vi.fn())
const mockUseStudioForm = vi.hoisted(() => vi.fn())
const mockUseImageModelOptions = vi.hoisted(() => vi.fn())
const mockUseAudioModelOptions = vi.hoisted(() => vi.fn())
const mockUseVoiceCards = vi.hoisted(() => vi.fn())
const mockImageUploadHandleDrop = vi.hoisted(() => vi.fn())
import { SAMPLE_PROMPT_STORAGE_KEY } from '@/constants/sample-prompts'
const SAMPLE_PROMPT_FLAG_KEY = SAMPLE_PROMPT_STORAGE_KEY

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
  spec: false,
  videoSpec: false,
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

vi.mock('sonner', () => {
  // ⚠ 光有 `toast()` 不够：组件在被闸挡住时调 `toast.info(...)`，
  //   缺这几个方法会在测试里抛 `toast.info is not a function`，而且是
  //   unhandled rejection —— 报错指向 React 的 dispatch 栈，很难联想到替身。
  const toast = Object.assign(vi.fn(), {
    info: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  })
  return { toast }
})

vi.mock('@/contexts/studio-context', () => ({
  STUDIO_TOOL_PANEL_NAMES: [
    'enhance',
    'reverse',
    'cardSelector',
    'advanced',
    'stylePreset',
    'refImage',
    'loraSelector',
    'civitai',
    'aspectRatio',
    'resolution',
    'batchCount',
    'spec',
    'videoParams',
    'script',
    'voiceSelector',
    'voiceTrainer',
    'audioTranscribe',
  ],
  useStudioForm: mockUseStudioForm,
  useStudioData: () => ({
    styles: {
      activeCard: null,
      activeCardId: null,
    },
    characters: {
      activeCardIds: [],
      activeCards: [],
    },
    backgrounds: {
      activeCardId: null,
    },
    imageUpload: {
      referenceEntries: [],
      referenceImages: [],
      handleFileChange: vi.fn(),
      handleDragEnter: vi.fn(),
      handleDragOver: vi.fn(),
      handleDragLeave: vi.fn(),
      handleDrop: mockImageUploadHandleDrop,
      removeReferenceImage: vi.fn(),
      isDragging: false,
    },
    projects: {
      activeProjectId: null,
    },
  }),
  useStudioGen: () => ({
    isGenerating: false,
    generate: mockGenerate,
    elapsedSeconds: 0,
    // ⚠ 手写镜像少一个字段就等于把闸关上：`canQueueMoreVideo` 缺席时
    //   `!undefined` 为真，视频模态的生成按钮会被判成「队列已满」，三条视频
    //   提交测试同时红。这类漏字段是这个仓库反复踩的一类（见 VideoComposer
    //   的夹具脱节）。
    canQueueMoreVideo: true,
  }),
}))

vi.mock('@/hooks/use-studio-shortcuts', () => ({
  useStudioShortcuts: vi.fn(),
}))

vi.mock('@/hooks/use-image-model-options', () => ({
  useImageModelOptions: mockUseImageModelOptions,
}))

vi.mock('@/hooks/use-audio-model-options', () => ({
  useAudioModelOptions: mockUseAudioModelOptions,
}))

vi.mock('@/hooks/use-video-model-options', () => ({
  useVideoModelOptions: () => {
    const selectedModel = {
      optionId: 'video-option',
      modelId: 'fal-video-model',
      keyId: 'api-key-1',
      keyLabel: 'FAL video',
      adapterType: 'fal',
      providerConfig: {
        label: 'fal.ai',
        baseUrl: 'https://fal.ai',
      },
      sourceType: 'saved',
      requestCount: 2,
    }

    return {
      selectedModel,
      modelOptions: [selectedModel],
    }
  },
}))

vi.mock('@/hooks/cards/use-voice-cards', () => ({
  useVoiceCards: mockUseVoiceCards,
}))

vi.mock('@/contexts/api-keys-context', () => ({
  useApiKeysContext: () => ({
    keys: [],
    healthMap: {},
  }),
}))

vi.mock('@/components/business/ApiKeyHealthDot', () => ({
  ApiKeyHealthDot: () => <span data-testid="api-key-health-dot" />,
}))

vi.mock('@/components/business/ModelSelector', () => ({
  ModelSelector: () => <div data-testid="model-selector" />,
}))

vi.mock('@/components/business/studio-shared/setup/QuickSetupDialog', () => ({
  QuickSetupDialog: () => null,
}))

vi.mock('@/components/business/studio/PromptTemplatePicker', () => ({
  PromptTemplatePicker: () => (
    <button type="button" aria-label="templatePicker">
      templatePicker
    </button>
  ),
}))

vi.mock('@/components/business/studio/StudioEnhanceButton', () => ({
  StudioEnhanceButton: () => <button type="button">enhance</button>,
}))

// 卡片那两颗拖着整条卡片管理链（角色卡管理 → LoRA 训练对话框 → …），
// 与本文件要验的提示词 / 负面提示词 / 模型名单无关，替身掉保持单测聚焦。
vi.mock('@/components/business/studio/StudioCardsButton', () => ({
  StudioCardsButton: () => <button type="button">cards</button>,
}))

vi.mock('@/components/business/studio/StudioCardSection', () => ({
  StudioCardSection: () => <div data-testid="studio-card-section" />,
}))

vi.mock('@/components/ui/prompt-input', () => ({
  // ⚠ 必须复刻真组件那一手：根容器在**任何冒泡上来的点击**时把焦点抢给主输入框
  //   （真实现见 `ui/prompt-input.tsx` 的 handleClick → focusUnlessTouch）。
  //   ⛔ 别简化成光秃秃的 `<div {...props}>` —— 2026-08-22 就是因为这个，
  //   「点了负面提示词框、打的字全进主提示词框」在测试里完全看不见，
  //   owner 真机撞到时的原话是「甚至无法点击」。
  PromptInput: ({
    children,
    ...props
  }: { children: ReactNode } & ComponentProps<'div'>) => (
    <div
      {...props}
      onClick={(event) => {
        props.onClick?.(event)
        // 第一个 textarea = 主提示词框（DOM 顺序），与真组件的 textareaRef 等价。
        event.currentTarget.querySelector('textarea')?.focus()
      }}
    >
      {children}
    </div>
  ),
  PromptInputTextarea: (props: ComponentProps<'textarea'>) => (
    <textarea {...props} />
  ),
  PromptInputActions: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}))

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    onClick,
  }: {
    children: ReactNode
    onClick?: () => void
  }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
  DropdownMenuLabel: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}))

function setupStudioForm(
  workflowId: WorkflowId,
  overrides: Partial<StudioFormState> = {},
) {
  const state: StudioFormState = {
    selectedWorkflowId: workflowId,
    outputType: 'video',
    workflowMode: 'quick',
    selectedOptionId: 'video-option',
    prompt: 'Make a cinematic establishing shot',
    recipeUsage: null,
    aspectRatio: '16:9',
    advancedParams: {},
    imageBatchCount: 1,
    extraModelOptionIds: [],
    tokenInput: '',
    voiceId: null,
    voiceCardId: null,
    audioKind: 'speech',
    audioEmotion: 'none',
    audioExpressiveness: 'auto',
    audioSfxDurationSeconds: 5,
    audioMusicDurationSeconds: 30,
    audioSfxLoop: false,
    audioSfxPromptInfluence: 0.3,
    audioSfxVariantCount: 1,
    audioPace: 'normal',
    audioPauseMarkers: [],
    pronunciationDictionary: {},
    audioVolume: 0,
    audioNormalizeLoudness: true,
    audioNormalizeText: true,
    audioWithTimestamps: false,
    audioFormat: 'mp3',
    audioSampleRate: 44100,
    audioMp3Bitrate: 128,
    audioOpusBitrate: 32000,
    audioLatency: 'normal',
    audioTemperature: 0.7,
    audioTopP: 0.7,
    audioChunkLength: 300,
    audioRepetitionPenalty: 1.2,
    audioSpeakerVoiceIds: [],
    audioReferenceUrl: null,
    audioReferenceFileName: null,
    audioReferenceText: '',
    videoMode: 'keyframe',
    videoDuration: 5,
    videoResolution: '720p',
    videoAudioRefs: [],
    videoGenerateAudio: null,
    longVideoMode: false,
    longVideoTargetDuration: 10,
    generateRequestId: 0,
    stylePresetId: NO_STYLE_PRESET_ID,
    panels: { ...EMPTY_PANELS },
    ...overrides,
  }

  mockUseStudioForm.mockReturnValue({
    state,
    dispatch: mockDispatch,
  })
}

function getSubmittedVideoPayload(): Record<string, unknown> {
  const payload = mockGenerate.mock.calls[0]?.[0]
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('generate was not called with an object payload')
  }
  if (!('video' in payload)) {
    throw new Error('generate payload did not include video input')
  }
  const video = payload.video
  if (typeof video !== 'object' || video === null) {
    throw new Error('generate payload video input was not an object')
  }
  return video
}

async function submitVideoFromPromptArea(
  workflowId: WorkflowId,
  overrides: Partial<StudioFormState> = {},
) {
  setupStudioForm(workflowId, overrides)
  render(<StudioPromptArea />)

  fireEvent.click(screen.getByRole('button', { name: /^generate$/ }))

  await waitFor(() => expect(mockGenerate).toHaveBeenCalled())
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

interface SetPromptAction {
  type: 'SET_PROMPT'
  payload: string
}

function isSetPromptAction(action: unknown): action is SetPromptAction {
  return (
    isRecord(action) &&
    action.type === 'SET_PROMPT' &&
    typeof action.payload === 'string'
  )
}

function getSetPromptActions(): SetPromptAction[] {
  return mockDispatch.mock.calls
    .map(([action]) => action)
    .filter(isSetPromptAction)
}

describe('StudioPromptArea', () => {
  // 2026-08-22 owner：「我没看到有负面提示词的地方」。查证结论 —— 输入框当时只长在
  // `panels.advanced` 对话框里，而那条链图片模态整条不挂载，于是命令面板的
  // 「切换高级设置」是个空开关；而生成管线一直在读 `advancedParams.negativePrompt`。
  // 字段活着、门没开。折叠行是补上的那道门。
  describe('负面提示词（图片参数栏）', () => {
    const setupImagePanel = (advancedParams: Record<string, unknown> = {}) =>
      setupStudioForm(WORKFLOW_IDS.QUICK_IMAGE, {
        outputType: 'image',
        selectedOptionId: null,
        advancedParams,
      })

    it('⭐ 图片参数栏里有入口（折叠行，收起时不渲染输入框）', () => {
      setupImagePanel()
      render(<StudioPromptArea />)

      const row = screen.getByRole('button', { name: /negativePromptLabel/ })
      expect(row).toHaveAttribute('aria-expanded', 'false')
      expect(row).toHaveAttribute(
        'aria-controls',
        'studio-negative-prompt-input',
      )
      expect(row).toHaveClass('rounded-lg', 'border-border', 'coarse:min-h-11')
      const reveal = row.nextElementSibling
      expect(reveal).toHaveAttribute('aria-hidden', 'true')
      expect(reveal).toHaveClass(
        'grid-rows-[0fr]',
        'opacity-0',
        'duration-base',
      )
      expect(
        screen.queryByRole('textbox', { name: 'negativePromptLabel' }),
      ).not.toBeInTheDocument()
    })

    it('展开后能输入，且写回 advancedParams', () => {
      setupImagePanel()
      render(<StudioPromptArea />)

      fireEvent.click(
        screen.getByRole('button', { name: /negativePromptLabel/ }),
      )
      const input = screen.getByRole('textbox', { name: 'negativePromptLabel' })
      const reveal = input.closest('[aria-hidden="false"]')
      expect(reveal).toHaveClass('grid-rows-[1fr]', 'opacity-100')
      expect(input).toHaveAttribute('id', 'studio-negative-prompt-input')
      expect(input).toHaveClass('h-[46px]', 'rounded-lg', 'border-border')
      fireEvent.change(input, { target: { value: 'bad hands' } })

      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'SET_ADVANCED_PARAMS',
        payload: { negativePrompt: 'bad hands' },
      })
    })

    it('⚠ 整个对象带过去，不清掉其余高级参数', () => {
      // `SET_ADVANCED_PARAMS` 是**整体替换** —— 只发 negativePrompt 会把 seed
      // 这类同住一个对象的参数一起抹掉。
      setupImagePanel({ seed: 1234 })
      render(<StudioPromptArea />)

      fireEvent.click(
        screen.getByRole('button', { name: /negativePromptLabel/ }),
      )
      fireEvent.change(
        screen.getByRole('textbox', { name: 'negativePromptLabel' }),
        { target: { value: 'blurry' } },
      )

      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'SET_ADVANCED_PARAMS',
        payload: { seed: 1234, negativePrompt: 'blurry' },
      })
    })

    // 2026-08-22 owner：「甚至无法点击」。根因不是命中区域，是 `PromptInput` 根容器
    // 在冒泡时把焦点抢回主提示词框 —— 点中了、也聚焦了，然后焦点被夺走，
    // 于是打的字全进主提示词框。同文件的 `PromptInputAction` 早就用
    // stopPropagation 防这一手。
    it('⛔ 点负面框时容器不许把焦点抢回主提示词框', () => {
      setupImagePanel()
      render(<StudioPromptArea />)

      fireEvent.click(
        screen.getByRole('button', { name: /negativePromptLabel/ }),
      )
      const negative = screen.getByRole('textbox', {
        name: 'negativePromptLabel',
      })
      const mainPrompt = screen.getByRole('textbox', { name: 'promptLabel' })

      fireEvent.click(negative)

      expect(document.activeElement).not.toBe(mainPrompt)
    })

    it('⛔ 展开后不再重复同一句 placeholder（同一句话不许一屏两遍）', () => {
      setupImagePanel()
      render(<StudioPromptArea />)

      const row = screen.getByRole('button', { name: /negativePromptLabel/ })
      expect(row.textContent).toContain('negativePromptPlaceholder')

      fireEvent.click(row)

      // 展开后同一句只由输入框的 placeholder 承担，摘要行不再重复。
      expect(row.textContent).not.toContain('negativePromptPlaceholder')
      expect(
        screen.getByRole('textbox', { name: 'negativePromptLabel' }),
      ).toHaveAttribute('placeholder', 'negativePromptPlaceholder')
    })

    it('清空写成 undefined 而不是空串（空串会被当成「设过一个空负面」带进请求）', () => {
      setupImagePanel({ negativePrompt: 'bad hands' })
      render(<StudioPromptArea />)

      fireEvent.click(
        screen.getByRole('button', { name: /negativePromptLabel/ }),
      )
      fireEvent.change(
        screen.getByRole('textbox', { name: 'negativePromptLabel' }),
        { target: { value: '' } },
      )

      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'SET_ADVANCED_PARAMS',
        payload: { negativePrompt: undefined },
      })
    })
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockGenerate.mockResolvedValue(null)
    mockImageUploadHandleDrop.mockResolvedValue(undefined)
    mockUseAudioModelOptions.mockReturnValue({
      selectedModel: null,
      modelOptions: [],
    })
    mockUseImageModelOptions.mockReturnValue({
      selectedModel: null,
      modelOptions: [],
    })
    mockUseVoiceCards.mockReturnValue({
      cards: [],
      isLoading: false,
      error: null,
      findCard: () => null,
      refresh: vi.fn(),
    })
    localStorage.clear()
  })

  it('prefills the sample prompt on first visit when prompt is empty', async () => {
    setupStudioForm(WORKFLOW_IDS.QUICK_IMAGE, {
      outputType: 'image',
      selectedOptionId: null,
      prompt: '',
    })

    render(<StudioPromptArea />)

    await waitFor(() => expect(getSetPromptActions()).toHaveLength(1))
    const [setPromptAction] = getSetPromptActions()
    expect(setPromptAction.payload.length).toBeGreaterThan(0)
    expect(localStorage.getItem(SAMPLE_PROMPT_FLAG_KEY)).toBe('1')
  })

  it('does not prefill the sample prompt after the first visit flag exists', () => {
    localStorage.setItem(SAMPLE_PROMPT_FLAG_KEY, '1')
    setupStudioForm(WORKFLOW_IDS.QUICK_IMAGE, {
      outputType: 'image',
      selectedOptionId: null,
      prompt: '',
    })

    render(<StudioPromptArea />)

    expect(getSetPromptActions()).toEqual([])
  })

  it('does not pre-close the open image surface when its panel trigger is pressed', () => {
    setupStudioForm(WORKFLOW_IDS.QUICK_IMAGE, {
      outputType: 'image',
      selectedOptionId: null,
      panels: { ...EMPTY_PANELS, refImage: true },
    })

    render(<StudioPromptArea />)
    mockDispatch.mockClear()

    fireEvent.pointerDown(screen.getByRole('button', { name: 'label' }))

    expect(mockDispatch).not.toHaveBeenCalledWith({
      type: 'CLOSE_TOOL_PANELS',
    })
  })

  it('does not pre-close the open spec surface when its panel trigger is pressed', () => {
    setupStudioForm(WORKFLOW_IDS.QUICK_IMAGE, {
      outputType: 'image',
      selectedOptionId: null,
      panels: { ...EMPTY_PANELS, spec: true },
    })

    render(<StudioPromptArea />)
    mockDispatch.mockClear()

    fireEvent.pointerDown(screen.getByRole('button', { name: 'specLabel' }))

    expect(mockDispatch).not.toHaveBeenCalledWith({
      type: 'CLOSE_TOOL_PANELS',
    })
  })

  it('routes dropped reference images through the prompt box', async () => {
    setupStudioForm(WORKFLOW_IDS.QUICK_IMAGE, {
      outputType: 'image',
      selectedOptionId: null,
    })

    render(<StudioPromptArea />)

    const promptGroup = screen.getByRole('group')

    fireEvent.drop(promptGroup, {
      dataTransfer: {
        types: ['application/x-studio-ref'],
        getData: () =>
          JSON.stringify({ url: 'https://cdn.example.com/reference.png' }),
        files: [],
      },
    })

    expect(mockImageUploadHandleDrop).toHaveBeenCalledTimes(1)
  })

  it('adds CINEMATIC_SHORT_VIDEO workflowId to the video submit payload', async () => {
    await submitVideoFromPromptArea(WORKFLOW_IDS.CINEMATIC_SHORT_VIDEO)

    expect(getSubmittedVideoPayload()).toEqual(
      expect.objectContaining({
        workflowId: WORKFLOW_IDS.CINEMATIC_SHORT_VIDEO,
      }),
    )
  })

  it('adds CHARACTER_TO_VIDEO workflowId to the video submit payload', async () => {
    await submitVideoFromPromptArea(WORKFLOW_IDS.CHARACTER_TO_VIDEO)

    expect(getSubmittedVideoPayload()).toEqual(
      expect.objectContaining({
        workflowId: WORKFLOW_IDS.CHARACTER_TO_VIDEO,
      }),
    )
  })

  it('omits workflowId from the video submit payload for image workflows', async () => {
    await submitVideoFromPromptArea(WORKFLOW_IDS.QUICK_IMAGE)

    expect(getSubmittedVideoPayload()).not.toHaveProperty('workflowId')
  })

  it('builds audio payload from selected VoiceCard and audio form params', async () => {
    const audioModel = {
      optionId: 'audio-option',
      modelId: 'fish-audio-s2-pro',
      keyId: 'fish-key-1',
      keyLabel: 'Fish key',
      adapterType: 'fish_audio',
      providerConfig: {
        label: 'Fish Audio',
        baseUrl: 'https://api.fish.audio',
      },
      sourceType: 'saved',
      requestCount: 1,
    }
    const voiceCard: VoiceCardRecord = {
      id: 'voice-card-1',
      userId: 'user-1',
      name: 'Narrator',
      provider: 'fish_audio',
      modelId: 'fish-audio-s2-pro',
      voiceId: 'fish-voice-1',
      coverImage: 'https://cdn.example.com/voice-cover.png',
      referenceAudioUrl: null,
      referenceAudioStorageKey: null,
      gender: null,
      age: null,
      tone: [],
      pace: 'normal',
      pitch: null,
      pronunciationDictionary: { AI: 'ay eye' },
      sampleAudioUrl: null,
      sampleText: null,
      isDeleted: false,
      createdAt: '2026-05-04T00:00:00.000Z',
      updatedAt: '2026-05-04T00:00:00.000Z',
    }
    mockUseAudioModelOptions.mockReturnValue({
      selectedModel: audioModel,
      modelOptions: [audioModel],
    })
    mockUseVoiceCards.mockReturnValue({
      cards: [voiceCard],
      isLoading: false,
      error: null,
      findCard: (id: string) => (id === voiceCard.id ? voiceCard : null),
      refresh: vi.fn(),
    })
    setupStudioForm(WORKFLOW_IDS.VOICE_NARRATION_DIALOGUE, {
      outputType: 'audio',
      selectedOptionId: 'audio-option',
      prompt: 'Hello AI',
      voiceCardId: voiceCard.id,
      audioEmotion: 'narration',
      audioPace: 'fast',
      audioPauseMarkers: ['after_sentence_1'],
      pronunciationDictionary: { Codex: 'koh-decks' },
      audioWithTimestamps: true,
      audioSpeakerVoiceIds: ['fish-voice-1', 'fish-voice-2'],
    })

    render(<StudioPromptArea />)
    fireEvent.click(screen.getByRole('button', { name: /^generate$/ }))

    await waitFor(() =>
      expect(mockGenerate).toHaveBeenCalledWith({
        mode: 'audio',
        audio: expect.objectContaining({
          modelId: 'fish-audio-s2-pro',
          apiKeyId: 'fish-key-1',
          freePrompt: 'Hello AI',
          voiceId: 'fish-voice-1',
          coverImageUrl: 'https://cdn.example.com/voice-cover.png',
          emotion: 'narration',
          pace: 'fast',
          pauseMarkers: ['after_sentence_1'],
          speed: 1.35,
          withTimestamps: true,
          speakerVoiceIds: ['fish-voice-1', 'fish-voice-2'],
          pronunciationDictionary: {
            AI: 'ay eye',
            Codex: 'koh-decks',
          },
        }),
      }),
    )
  })

  // ── 音乐档的时长（切片 E）───────────────────────────────────────
  //
  // ⚠ 这一组盯的是一个「字段活着、门没开」：适配器早就读 `durationSeconds` 并
  // 换算成 `music_length_ms`，而提交侧只在**音效**那一支传它 —— 于是所有音乐
  // 都是适配器兜底的 30 秒，用户没有任何办法改。
  const musicModelOption = {
    optionId: 'music-option',
    modelId: 'elevenlabs-music-v2',
    keyId: 'eleven-key-1',
    keyLabel: 'ElevenLabs key',
    adapterType: 'elevenlabs',
    providerConfig: {
      label: 'ElevenLabs',
      baseUrl: 'https://api.elevenlabs.io',
    },
    sourceType: 'saved',
    requestCount: 1,
  }

  it('⭐ 音乐档把时长发出去 —— 不再恒是适配器兜底的 30 秒', async () => {
    mockUseAudioModelOptions.mockReturnValue({
      selectedModel: musicModelOption,
      modelOptions: [musicModelOption],
    })
    setupStudioForm(WORKFLOW_IDS.VOICE_NARRATION_DIALOGUE, {
      outputType: 'audio',
      audioKind: 'music',
      selectedOptionId: 'music-option',
      prompt: 'a slow lo-fi loop for a rainy window',
      audioMusicDurationSeconds: 95,
    })

    render(<StudioPromptArea />)
    fireEvent.click(screen.getByRole('button', { name: /^generate$/ }))

    await waitFor(() =>
      expect(mockGenerate).toHaveBeenCalledWith({
        mode: 'audio',
        audio: expect.objectContaining({
          modelId: 'elevenlabs-music-v2',
          durationSeconds: 95,
        }),
      }),
    )
  })

  it('⚠ 音效与音乐共用 durationSeconds，但取值来自各自的 state', async () => {
    mockUseAudioModelOptions.mockReturnValue({
      selectedModel: musicModelOption,
      modelOptions: [musicModelOption],
    })
    setupStudioForm(WORKFLOW_IDS.VOICE_NARRATION_DIALOGUE, {
      outputType: 'audio',
      audioKind: 'music',
      selectedOptionId: 'music-option',
      prompt: 'a slow lo-fi loop',
      audioMusicDurationSeconds: 95,
      // 音效那条留着一个完全不同的值：拿错了这里就会露馅
      audioSfxDurationSeconds: 4,
    })

    render(<StudioPromptArea />)
    fireEvent.click(screen.getByRole('button', { name: /^generate$/ }))

    await waitFor(() => expect(mockGenerate).toHaveBeenCalled())
    const payload = mockGenerate.mock.calls.at(-1)?.[0] as {
      audio: { durationSeconds?: number; variantCount?: number }
    }
    expect(payload.audio.durationSeconds).toBe(95)
    // 变体只属于音效 —— 音乐一次只出一条
    expect(payload.audio.variantCount).toBeUndefined()
  })

  it('语音档不传时长 —— 长度由正文决定，没有这一档可选', async () => {
    const speechModel = { ...musicModelOption, modelId: 'fish-audio-s2-pro' }
    mockUseAudioModelOptions.mockReturnValue({
      selectedModel: speechModel,
      modelOptions: [speechModel],
    })
    setupStudioForm(WORKFLOW_IDS.VOICE_NARRATION_DIALOGUE, {
      outputType: 'audio',
      audioKind: 'speech',
      selectedOptionId: 'music-option',
      prompt: 'Hello',
      audioMusicDurationSeconds: 95,
    })

    render(<StudioPromptArea />)
    fireEvent.click(screen.getByRole('button', { name: /^generate$/ }))

    await waitFor(() => expect(mockGenerate).toHaveBeenCalled())
    const payload = mockGenerate.mock.calls.at(-1)?.[0] as {
      audio: { durationSeconds?: number }
    }
    expect(payload.audio.durationSeconds).toBeUndefined()
  })

  // ── Audio text limit is per model (L split, 2026-08-07) ─────────────
  // Fish publishes no per-request cap, ElevenLabs v3 publishes 5000. The gate
  // must read the selected model, not one shared number — 5001 chars is fine on
  // one and blocked on the other.
  const audioModelOption = (
    modelId: string,
    overrides: Record<string, unknown> = {},
  ) => ({
    optionId: 'audio-option',
    modelId,
    keyId: 'audio-key-1',
    keyLabel: 'Audio key',
    adapterType: 'fish_audio',
    providerConfig: {
      label: 'Fish Audio',
      baseUrl: 'https://api.fish.audio',
    },
    sourceType: 'saved',
    requestCount: 2,
    ...overrides,
  })

  const renderAudioPrompt = (modelId: string, promptLength: number) => {
    const audioModel = audioModelOption(modelId)
    mockUseAudioModelOptions.mockReturnValue({
      selectedModel: audioModel,
      modelOptions: [audioModel],
    })
    setupStudioForm(WORKFLOW_IDS.VOICE_NARRATION_DIALOGUE, {
      outputType: 'audio',
      selectedOptionId: 'audio-option',
      prompt: 'a'.repeat(promptLength),
    })

    render(<StudioPromptArea />)
  }

  it('lets Fish Audio past 5000 chars and prints no denominator (vendor documents no cap)', () => {
    renderAudioPrompt(AI_MODELS.FISH_AUDIO_S2_PRO, 5001)

    expect(screen.getByText('audioPromptMetaNoLimit')).toBeInTheDocument()
    expect(screen.queryByText('audioPromptMeta')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^generate$/ })).toBeEnabled()
  })

  it('still blocks Fish Audio at the payload guard', () => {
    renderAudioPrompt(
      AI_MODELS.FISH_AUDIO_S2_PRO,
      AUDIO_PROMPT_PAYLOAD_MAX_CHARS + 1,
    )

    expect(screen.getByRole('button', { name: /^generate$/ })).toBeDisabled()
    expect(mockGenerate).not.toHaveBeenCalled()
  })

  it('blocks ElevenLabs v3 at its own documented 5000 and shows it as the denominator', () => {
    renderAudioPrompt(AI_MODELS.ELEVENLABS_V3, 5001)

    expect(screen.getByText('audioPromptMeta')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^generate$/ })).toBeDisabled()
    expect(mockGenerate).not.toHaveBeenCalled()
  })

  // ⭐ owner 2026-08-24：取消那个 2000。它的主人是卡片配方里「动作 / 姿势」那个
  // 输入框，被借来当了 quick 模式的默认上限，于是一串正常的风格标签就能顶到
  // `2932/2000` 并锁死生成按钮 —— 而请求边界本来就是 32000。
  // 与音频侧 `resolveAudioTextLimit` 的两层同构：没声明就没有上限。
  it('⭐ 模型没声明上限时不设前置闸 —— 不印计数、不锁按钮', async () => {
    const imageModel = {
      optionId: 'image-option',
      // 目录里没有 maxPromptChars 声明的型号
      modelId: 'gpt-image-1',
      keyId: 'openai-key-1',
      keyLabel: 'OpenAI key',
      adapterType: 'openai',
      providerConfig: {
        label: 'OpenAI',
        baseUrl: 'https://api.openai.com',
      },
      sourceType: 'saved',
      requestCount: 1,
    }
    mockUseImageModelOptions.mockReturnValue({
      selectedModel: imageModel,
      modelOptions: [imageModel],
    })
    setupStudioForm(WORKFLOW_IDS.QUICK_IMAGE, {
      outputType: 'image',
      selectedOptionId: 'image-option',
      prompt: 'a'.repeat(2932),
    })

    render(<StudioPromptArea />)

    expect(screen.queryByText(/^2932\//)).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /^generate$/ }),
    ).not.toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: /^generate$/ }))
    await waitFor(() => expect(mockGenerate).toHaveBeenCalled())
  })

  it('卡片工作流仍按卡片配方自己的 2000 拦 —— 那条 freePrompt 就是它的字段', () => {
    setupStudioForm(WORKFLOW_IDS.CHARACTER_CONSISTENCY_IMAGE, {
      outputType: 'image',
      workflowMode: 'card',
      selectedOptionId: null,
      prompt: 'a'.repeat(CARD_RECIPE.FREE_PROMPT_MAX_LENGTH + 1),
    })

    render(<StudioPromptArea />)

    expect(
      screen.getByText(
        `${CARD_RECIPE.FREE_PROMPT_MAX_LENGTH + 1}/${CARD_RECIPE.FREE_PROMPT_MAX_LENGTH}`,
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^generate$/ })).toBeDisabled()
  })

  it('caps the prompt at the model-specific maxPromptChars (Ideogram V4 = 1000)', () => {
    const ideogram = {
      optionId: 'ideogram-option',
      modelId: AI_MODELS.IDEOGRAM_3,
      keyId: 'fal-key-1',
      keyLabel: 'fal key',
      adapterType: 'fal',
      providerConfig: {
        label: 'fal.ai',
        baseUrl: 'https://fal.run',
      },
      sourceType: 'saved',
      requestCount: 1,
    }
    mockUseImageModelOptions.mockReturnValue({
      selectedModel: ideogram,
      modelOptions: [ideogram],
    })
    // ⚠ 厂商声明的上限**保留**前置闸：那是真实的 encoder 限制，提前拦比让
    //   provider 回一句英文错更有用（与音频 declared 层同理）。
    setupStudioForm(WORKFLOW_IDS.QUICK_IMAGE, {
      outputType: 'image',
      selectedOptionId: 'ideogram-option',
      prompt: 'a'.repeat(1001),
    })

    render(<StudioPromptArea />)

    expect(screen.getByText('1001/1000')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^generate$/ })).toBeDisabled()
    expect(mockGenerate).not.toHaveBeenCalled()
  })
})

/**
 * 台账 A（owner 2026-08-29 拍板补齐）：视频工作台的音频通道。
 *
 * ⭐ 守的是**最容易白做的那一步**：schema / service / worker 三层早就收
 * `audioUrls` + `audioBindings`，断点是 `buildVideoInput` 不填它们。只加面板
 * 而不改这里，界面上挂得上、请求里一个字都没有 —— 而且三绿。
 */
describe('StudioPromptArea · 视频音频参考（台账 A）', () => {
  beforeEach(() => {
    mockGenerate.mockClear()
    mockGenerate.mockResolvedValue(undefined)
  })

  it('把挂上的音频送进 audioUrls，并按归属填 audioBindings.characterName', async () => {
    await submitVideoFromPromptArea(WORKFLOW_IDS.CINEMATIC_SHORT_VIDEO, {
      videoAudioRefs: [
        {
          id: 'a1',
          url: 'https://cdn.example.com/hinata.mp3',
          fileName: 'hinata.mp3',
          ownerName: 'ひなた',
        },
        {
          id: 'a2',
          url: 'https://cdn.example.com/narration.mp3',
          fileName: 'narration.mp3',
        },
      ],
    })

    const video = getSubmittedVideoPayload()
    expect(video.audioUrls).toEqual([
      'https://cdn.example.com/hinata.mp3',
      'https://cdn.example.com/narration.mp3',
    ])
    // ⚠ 没归属的那条**不带** characterName —— schema 上它是 `.min(1).optional()`，
    // 送空串会被服务端拒收；不带则退化成无标签 @Audio2。
    expect(video.audioBindings).toEqual([
      { url: 'https://cdn.example.com/hinata.mp3', characterName: 'ひなた' },
      { url: 'https://cdn.example.com/narration.mp3' },
    ])
  })

  it('一条都没挂时，两个字段都不出现在请求里', async () => {
    await submitVideoFromPromptArea(WORKFLOW_IDS.CINEMATIC_SHORT_VIDEO, {
      videoAudioRefs: [],
    })

    const video = getSubmittedVideoPayload()
    expect(video).not.toHaveProperty('audioUrls')
    expect(video).not.toHaveProperty('audioBindings')
  })

  /**
   * ⭐ `generateAudio` 的三态。发一个 `false` 与「没设过」在**目录默认为 true**
   * 的模型上是相反的结果 —— 用两态布尔会把「没设过」当成用户主动关掉了声音。
   */
  it('没设过就不发 generateAudio —— 最终值留给模型目录默认', async () => {
    await submitVideoFromPromptArea(WORKFLOW_IDS.CINEMATIC_SHORT_VIDEO, {
      videoGenerateAudio: null,
    })
    expect(getSubmittedVideoPayload()).not.toHaveProperty('generateAudio')
  })

  it('用户拨过就发那个显式布尔', async () => {
    await submitVideoFromPromptArea(WORKFLOW_IDS.CINEMATIC_SHORT_VIDEO, {
      videoGenerateAudio: false,
    })
    expect(getSubmittedVideoPayload().generateAudio).toBe(false)
  })
})
