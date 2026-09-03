import type { ComponentProps, ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { StudioFormState } from '@/contexts/studio-context'

import { StudioMobileComposer } from './StudioMobileComposer'

/**
 * 移动端底部 composer（owner 2026-09-03 方向 A）。这里锁三件事：
 *   1. chip 行照实反映当前选择（模型名 / `1:1 · ×1`），空模型时写的是**自己的**
 *      占位文案而不是禁用按钮那句话（需求卡 §默认模型选型规则第 4 条）。
 *   2. 被闸挡住时方形键是 `aria-disabled` 且 `aria-label` 就是那条原因 ——
 *      按钮上不印长文案（44×44 放不下），原因只从无障碍名与 toast 出去。
 *   3. 生成键与桌面那颗共用 `useStudioGenerateAction`：这里断言它调的是同一个
 *      `handleGenerate`，不是自己另写一遍判据。
 */

const mockDispatch = vi.hoisted(() => vi.fn())
const mockUseStudioForm = vi.hoisted(() => vi.fn())
const mockHandleGenerate = vi.hoisted(() => vi.fn())
const mockUseGenerateAction = vi.hoisted(() => vi.fn())
const mockUseImageModelOptions = vi.hoisted(() => vi.fn())
const mockVideoSpec = vi.hoisted(() => ({
  value: {
    summary: '5s · 720p · 16:9',
    supportsGenerateAudio: false,
    generateAudioValue: true,
    isEmpty: false,
  },
}))

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

vi.mock('@/contexts/studio-context', () => ({
  useStudioForm: mockUseStudioForm,
  useStudioData: () => ({
    imageUpload: {
      referenceEntries: [],
      referenceImages: [],
      maxImages: 4,
      handleFileChange: vi.fn(),
      addFromUrl: vi.fn(),
      removeReferenceImage: vi.fn(),
    },
    promptEnhance: { isEnhancing: false },
  }),
  useStudioGen: () => ({ lastGeneration: null }),
}))

vi.mock('@/hooks/use-studio-generate-action', () => ({
  useStudioGenerateAction: mockUseGenerateAction,
}))

vi.mock('@/hooks/use-image-model-options', () => ({
  useImageModelOptions: mockUseImageModelOptions,
}))

// 参考图与优化两颗自带整条素材库 / 助手面板链，与本文件要验的 chip 行无关。
vi.mock('@/components/business/studio/ReferenceImageChip', () => ({
  ReferenceImageChip: () => (
    <button type="button" aria-label="reference">
      reference
    </button>
  ),
}))

vi.mock('@/components/business/studio/StudioEnhanceButton', () => ({
  StudioEnhanceButton: () => (
    <button type="button" aria-label="enhance">
      enhance
    </button>
  ),
}))

vi.mock('@/components/business/studio/StudioMobileModelSheet', () => ({
  StudioMobileModelSheet: ({ open }: { open: boolean }) =>
    open ? <div data-testid="model-sheet" /> : null,
}))

vi.mock('@/components/business/studio/StudioMobileSpecSheet', () => ({
  StudioMobileSpecSheet: ({ open, mode }: { open: boolean; mode: string }) =>
    open ? <div data-testid="spec-sheet" data-mode={mode} /> : null,
}))

// 视频规格的取值域自带整条模型目录 / 契约表；这里只要它的**摘要与出声契约**。
vi.mock('@/components/business/studio/StudioVideoSpecFields', () => ({
  useStudioVideoSpec: () => mockVideoSpec.value,
  StudioVideoSpecFields: () => null,
}))

vi.mock('@/components/business/studio/StudioCostPreview', () => ({
  StudioCostPreview: ({ variant }: { variant?: string }) => (
    <p data-testid="cost-line">{variant}</p>
  ),
}))

vi.mock('@/components/ui/prompt-input', () => ({
  PromptInput: ({
    children,
    ...props
  }: { children: ReactNode } & ComponentProps<'div'>) => (
    <div {...props}>{children}</div>
  ),
  PromptInputTextarea: (props: ComponentProps<'textarea'>) => (
    <textarea {...props} />
  ),
}))

const IMAGE_OPTION = {
  optionId: 'image-option',
  modelId: 'gpt-image-1',
  displayLabel: 'GPT Image 1',
  keyId: 'api-key-1',
  adapterType: 'openai',
  providerConfig: { label: 'OpenAI', baseUrl: '' },
  sourceType: 'saved',
  requestCount: 1,
}

function setForm(overrides: Partial<StudioFormState> = {}) {
  mockUseStudioForm.mockReturnValue({
    state: {
      prompt: '',
      outputType: 'image',
      aspectRatio: '1:1',
      imageBatchCount: 1,
      advancedParams: {},
      selectedOptionId: null,
      panels: EMPTY_PANELS,
      ...overrides,
    } as unknown as StudioFormState,
    dispatch: mockDispatch,
  })
}

function setAction(overrides: Record<string, unknown> = {}) {
  mockUseGenerateAction.mockReturnValue({
    runModels: [IMAGE_OPTION],
    runModelIds: new Set([IMAGE_OPTION.optionId]),
    handleToggleRunModel: vi.fn(),
    handleRemoveRunModel: vi.fn(),
    blockedReason: null,
    handleGenerate: mockHandleGenerate,
    isGenerating: false,
    isImagePromptOverLimit: false,
    selectedModel: IMAGE_OPTION,
    filterVideoModelByMode: undefined,
    handleSelectSingleModel: vi.fn(),
    videoCostBasis: null,
    ...overrides,
  })
}

const VIDEO_OPTION = {
  ...IMAGE_OPTION,
  optionId: 'video-option',
  modelId: 'seedance-2.5',
  displayLabel: 'Seedance 2.5',
}

/** 视频档的最小前提：模态是 video、选中了一条视频型号、报价基准可用。 */
function setVideo(
  formOverrides: Partial<StudioFormState> = {},
  actionOverrides: Record<string, unknown> = {},
) {
  setForm({
    outputType: 'video',
    videoDuration: 5,
    videoResolution: '720p',
    videoGenerateAudio: null,
    videoAudioRefs: [],
    selectedOptionId: VIDEO_OPTION.optionId,
    aspectRatio: '16:9',
    ...formOverrides,
  } as Partial<StudioFormState>)
  setAction({
    selectedModel: VIDEO_OPTION,
    runModels: [],
    runModelIds: new Set(),
    videoCostBasis: {
      kind: 'video',
      durationSeconds: 5,
      resolution: '720p',
    },
    ...actionOverrides,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseImageModelOptions.mockReturnValue({ selectedModel: IMAGE_OPTION })
  mockVideoSpec.value = {
    summary: '5s · 720p · 16:9',
    supportsGenerateAudio: false,
    generateAudioValue: true,
    isEmpty: false,
  }
  setForm()
  setAction()
})

describe('StudioMobileComposer', () => {
  it('reflects the selected model and spec on the chip row', () => {
    setForm({
      aspectRatio: '3:4',
      imageBatchCount: 2,
    } as Partial<StudioFormState>)

    render(<StudioMobileComposer />)

    expect(screen.getByTestId('studio-mobile-model-chip')).toHaveTextContent(
      'GPT Image 1',
    )
    expect(screen.getByTestId('studio-mobile-spec-chip')).toHaveTextContent(
      '3:4 · ×2',
    )
  })

  it('keeps the multi-model run list legible: N 个模型 + a count badge', () => {
    const second = {
      ...IMAGE_OPTION,
      optionId: 'image-option-2',
      displayLabel: 'FLUX 2 Flash',
    }
    setForm({ imageBatchCount: 2 } as Partial<StudioFormState>)
    setAction({
      runModels: [IMAGE_OPTION, second],
      runModelIds: new Set([IMAGE_OPTION.optionId, second.optionId]),
    })

    render(<StudioMobileComposer />)

    // 折成一个模型名就等于在手机上把「一次跑几路」这件事藏起来。
    expect(screen.getByTestId('studio-mobile-model-chip')).toHaveTextContent(
      'modelChipMulti',
    )
    // 2 模型 × 2 张 = 4 —— 与桌面按钮上那个数同一个算式。
    expect(
      screen.getByTestId('studio-mobile-generate-count'),
    ).toHaveTextContent('4')
    expect(screen.getByTestId('studio-mobile-generate')).toHaveAttribute(
      'aria-label',
      'generateCount',
    )
  })

  it('hides the count badge when the run is a single image', () => {
    render(<StudioMobileComposer />)

    expect(screen.queryByTestId('studio-mobile-generate-count')).toBeNull()
  })

  it('shows its own placeholder — not the blocked-button copy — with no model', () => {
    setAction({ runModels: [], runModelIds: new Set() })

    render(<StudioMobileComposer />)

    const chip = screen.getByTestId('studio-mobile-model-chip')
    expect(chip).toHaveTextContent('modelChipEmpty')
    expect(chip).not.toHaveTextContent('blocked.modelRequired')
  })

  it('marks the square button aria-disabled and names it with the blocked reason', () => {
    setAction({
      runModels: [],
      runModelIds: new Set(),
      blockedReason: { message: 'blocked.modelRequired' },
    })

    render(<StudioMobileComposer />)

    const button = screen.getByTestId('studio-mobile-generate')
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).toHaveAttribute('aria-label', 'blocked.modelRequired')
    // ⚠ 不是真 `disabled`：真禁用的按钮收不到点击，用户就只剩「点了没反应」。
    expect(button).not.toBeDisabled()
  })

  it('routes the square button to the shared generate handler', () => {
    render(<StudioMobileComposer />)

    fireEvent.click(screen.getByTestId('studio-mobile-generate'))

    expect(mockHandleGenerate).toHaveBeenCalledTimes(1)
  })

  it('opens the model sheet from the 模型 chip and the spec sheet from the 规格 chip', () => {
    render(<StudioMobileComposer />)

    expect(screen.queryByTestId('model-sheet')).toBeNull()
    fireEvent.click(screen.getByTestId('studio-mobile-model-chip'))
    expect(screen.getByTestId('model-sheet')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('studio-mobile-spec-chip'))
    expect(screen.getByTestId('spec-sheet')).toBeInTheDocument()
  })
})

/**
 * 视频档（`studio-video-mobile-request.md`，owner 2026-09-03）。这里锁的是
 * **同一个组件按模态分支**这件事本身：chip 集合、规格摘要、费用行、按钮上的
 * 时长各自对，而闸门与请求组装仍旧只有 `useStudioGenerateAction` 一份。
 */
describe('StudioMobileComposer · 视频档', () => {
  it('模型 chip 写的是当前那一条型号 —— 视频恒单选，没有「N 个模型」这回事', () => {
    setVideo()

    render(<StudioMobileComposer />)

    expect(screen.getByTestId('studio-mobile-model-chip')).toHaveTextContent(
      'Seedance 2.5',
    )
    expect(
      screen.getByTestId('studio-mobile-model-chip'),
    ).not.toHaveTextContent('modelChipMulti')
  })

  it('规格 chip 走视频那份摘要（时长 · 分辨率 · 比例），不是图片的 `1:1 · ×1`', () => {
    setVideo()

    render(<StudioMobileComposer />)

    expect(screen.getByTestId('studio-mobile-spec-chip')).toHaveTextContent(
      '5s · 720p · 16:9',
    )
  })

  it('两张 sheet 都按 video 模式开 —— 装的是视频那组档位', () => {
    setVideo()

    render(<StudioMobileComposer />)
    fireEvent.click(screen.getByTestId('studio-mobile-spec-chip'))

    expect(screen.getByTestId('spec-sheet')).toHaveAttribute(
      'data-mode',
      'video',
    )
  })

  it('⭐ 出声 chip 只在**契约暴露该字段**时出现 —— 画一颗发不出去的开关比没有更糟', () => {
    setVideo()
    render(<StudioMobileComposer />)
    expect(screen.queryByTestId('studio-mobile-audio-chip')).toBeNull()
  })

  it('出声 chip 镜像 `videoGenerateAudio`，点一下写回反值', () => {
    mockVideoSpec.value = {
      summary: '5s · 720p · 16:9',
      supportsGenerateAudio: true,
      generateAudioValue: true,
      isEmpty: false,
    }
    setVideo()

    render(<StudioMobileComposer />)
    const chip = screen.getByTestId('studio-mobile-audio-chip')
    expect(chip).toHaveAttribute('aria-checked', 'true')

    fireEvent.click(chip)
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'SET_VIDEO_GENERATE_AUDIO',
      payload: false,
    })
  })

  it('音频参考 / 剧本 chip 打开的是**既有**面板，不新增 state 源', () => {
    setVideo({
      videoAudioRefs: [{ url: 'https://x/a.mp3' }],
    } as Partial<StudioFormState>)

    render(<StudioMobileComposer />)
    fireEvent.click(screen.getByTestId('studio-mobile-audio-ref-chip'))
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'TOGGLE_PANEL',
      payload: 'videoAudio',
    })

    fireEvent.click(screen.getByTestId('studio-mobile-script-chip'))
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'TOGGLE_PANEL',
      payload: 'script',
    })
    // 挂了几条要看得见：不显示的话切走再回来根本不知道这次请求还带着音频。
    expect(
      screen.getByTestId('studio-mobile-audio-ref-chip'),
    ).toHaveTextContent('1')
  })

  it('费用行走共用的 `StudioCostPreview`（一行版），不在 composer 里另算一个数', () => {
    setVideo()

    render(<StudioMobileComposer />)

    expect(screen.getByTestId('cost-line')).toHaveTextContent('line')
  })

  it('⭐ 生成键上带这一枪的时长（`↑ 5s`），图片那枚张数角标不出现', () => {
    setVideo({ videoDuration: 10 } as Partial<StudioFormState>)

    render(<StudioMobileComposer />)

    expect(
      screen.getByTestId('studio-mobile-generate-duration'),
    ).toHaveTextContent('10s')
    expect(screen.queryByTestId('studio-mobile-generate-count')).toBeNull()
  })

  it('⭐ 没选模型时规格 chip 整颗不渲染 —— 只剩箭头的空丸是纯噪音', () => {
    mockVideoSpec.value = {
      summary: '',
      supportsGenerateAudio: false,
      generateAudioValue: true,
      isEmpty: true,
    }
    setVideo({ selectedOptionId: null } as Partial<StudioFormState>, {
      selectedModel: null,
    })

    render(<StudioMobileComposer />)

    expect(screen.queryByTestId('studio-mobile-spec-chip')).toBeNull()
    // 模型 chip 照旧在 —— 它正是「怎么选一个」的唯一出口。
    expect(screen.getByTestId('studio-mobile-model-chip')).toHaveTextContent(
      'modelChipEmpty',
    )
  })

  it('视频专属的禁用原因照样只从 `useStudioGenerateAction` 出（队列满）', () => {
    setVideo({}, { blockedReason: { message: 'blocked.videoQueueFull' } })

    render(<StudioMobileComposer />)

    const button = screen.getByTestId('studio-mobile-generate')
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).toHaveAttribute('aria-label', 'blocked.videoQueueFull')
    expect(button).not.toBeDisabled()
  })
})
