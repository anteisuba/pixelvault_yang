import type { ComponentProps, ReactNode } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { StudioFormState } from '@/contexts/studio-context'

import { StudioMobileComposer } from './StudioMobileComposer'

/**
 * 移动端底部 composer（owner 2026-10-02「Claude 式最简」）。这里锁四件事：
 *   1. 输入框卡里只有 提示词 + 一行 `＋ · 模型 · 规格 ……… 生成`；参考图 / 模板 /
 *      角色 / 模型参数 / 写法切换都不在这条上（各自的去处另有单测）。
 *   2. 模型 chip 照实反映当前选择，空模型时写的是**自己的**占位文案而不是禁用
 *      按钮那句话（需求卡 §默认模型选型规则第 4 条）。
 *   3. 被闸挡住时圆键是 `aria-disabled` 且 `aria-label` 就是那条原因 ——
 *      按钮上不印长文案，原因只从无障碍名与 toast 出去。
 *   4. 生成键与桌面那颗共用 `useStudioGenerateAction`：这里断言它调的是同一个
 *      `handleGenerate`，不是自己另写一遍判据。
 */

const mockDispatch = vi.hoisted(() => vi.fn())
const mockUseStudioForm = vi.hoisted(() => vi.fn())
const mockHandleGenerate = vi.hoisted(() => vi.fn())
const mockUseGenerateAction = vi.hoisted(() => vi.fn())
const mockUseImageModelOptions = vi.hoisted(() => vi.fn())
const mockSpecChip = vi.hoisted(() => ({ value: { rendered: true } }))
const mockVideoAssets = vi.hoisted(() => ({ images: [], videos: [] }))
const mockReferenceEntries = vi.hoisted(() => ({ value: [] as unknown[] }))

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

// 把 next-intl 的导航壳挡在测试之外（composer 自己不跳路由）。
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/studio/image',
  Link: 'a',
  redirect: vi.fn(),
  getPathname: vi.fn(),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}))

vi.mock('@/contexts/studio-context', () => ({
  useStudioForm: mockUseStudioForm,
  useStudioData: () => ({
    imageUpload: {
      referenceEntries: mockReferenceEntries.value,
      referenceImages: [],
      isUploading: false,
      maxImages: 4,
      handleFileChange: vi.fn(),
      addFromUrl: vi.fn(),
      removeReferenceImage: vi.fn(),
    },
    promptEnhance: { isEnhancing: false },
    characters: { activeCardIds: [] },
  }),
  useStudioGen: () => ({ lastGeneration: null }),
  useStudioGenOptional: () => ({ lastGeneration: null }),
}))

vi.mock('@/hooks/use-studio-generate-action', () => ({
  useStudioGenerateAction: mockUseGenerateAction,
}))

vi.mock('@/hooks/use-image-model-options', () => ({
  useImageModelOptions: mockUseImageModelOptions,
}))

// 专属 chip 读的是这一轮的名单 —— 与生成键同一份夹具。
vi.mock('@/hooks/use-studio-run-models', () => ({
  useStudioRunModels: () => ({
    runModels: mockUseGenerateAction().runModels ?? [],
  }),
}))

// 「＋」抽屉自带参考图 / 素材 / 角色 / 参数整条链（它另有单测
// `StudioMobileAddSheet.test`）。这里只验 composer 把它摆进那一行、并按模态交对那一份。
vi.mock('@/components/business/studio/StudioMobileAddSheet', () => ({
  StudioMobileAddSheet: ({ videoAssets }: { videoAssets?: unknown }) => (
    <button
      type="button"
      data-testid="studio-mobile-add"
      data-video-assets={videoAssets === mockVideoAssets ? 'host' : 'none'}
    >
      add
    </button>
  ),
}))

vi.mock('@/components/business/studio/StudioModelCapabilityChips', () => ({
  StudioModelCapabilityChips: ({ variant }: { variant?: string }) => (
    <button type="button" data-testid={`capability-chip-${variant}`}>
      capability
    </button>
  ),
}))

vi.mock('@/hooks/use-studio-video-assets', () => ({
  useStudioVideoAssets: () => mockVideoAssets,
}))

vi.mock(
  '@/components/business/studio-shared/chrome/StudioVideoAssetRail',
  () => ({
    StudioVideoAssetRail: () => <div data-testid="video-asset-rail" />,
  }),
)

vi.mock('@/components/business/ImageAttachmentPreviewStrip', () => ({
  ImageAttachmentPreviewStrip: ({ entries }: { entries: unknown[] }) =>
    entries.length > 0 ? <div data-testid="reference-strip" /> : null,
}))

vi.mock('@/components/business/studio/StudioMobileModelSheet', () => ({
  StudioMobileModelSheet: ({ open }: { open: boolean }) =>
    open ? <div data-testid="model-sheet" /> : null,
}))

// 规格 chip 自带整条能力表 / 单价表，且它的弹层与摘要另有单测（`spec-chip-model`
// 与 `SpecChip`）。这里只验 composer 有没有把它摆进 chip 行。
vi.mock('@/components/business/studio/StudioSpecChip', () => ({
  StudioSpecChip: () =>
    mockSpecChip.value.rendered ? (
      <button type="button" data-testid="studio-spec-chip">
        spec
      </button>
    ) : null,
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
    modelOptions: [IMAGE_OPTION],
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
  mockSpecChip.value = { rendered: true }
  mockReferenceEntries.value = []
  setForm()
  setAction()
})

const mockTemplatesToggle = vi.fn()
const TEMPLATES = { open: false, onToggle: mockTemplatesToggle }

describe('StudioMobileComposer', () => {
  /**
   * owner 2026-10-02 选「Claude 式最简」：输入框卡里只有提示词与一行
   * `＋ · 模型 · 规格 · 专属 ……… 生成`。参考图 / 模板 / 角色收进「＋」，写法
   * 切换挪到舞台左上角 —— 这一条上再长出来任何一颗都算回退。
   */
  it('输入条只有一行：＋ · 模型 · 规格 · 专属 · 生成', () => {
    render(<StudioMobileComposer templates={TEMPLATES} />)

    expect(screen.getByTestId('studio-mobile-add')).toHaveAttribute(
      'data-video-assets',
      'none',
    )
    expect(screen.getByTestId('studio-mobile-model-chip')).toBeInTheDocument()
    expect(screen.getByTestId('studio-spec-chip')).toBeInTheDocument()
    // 模型参数（专属）在规格旁边一颗，与桌面同一颗 chip（owner 2026-10-03）。
    expect(screen.getByTestId('capability-chip-single')).toBeInTheDocument()
    expect(screen.getByTestId('studio-mobile-generate')).toBeInTheDocument()
    expect(screen.queryByTestId('studio-mobile-template-chip')).toBeNull()
    expect(screen.queryByTestId('studio-characters-chip')).toBeNull()
    expect(screen.queryByRole('tablist')).toBeNull()
    expect(screen.queryByText('modelParameters')).toBeNull()
  })

  it('挂着的参考图在输入框卡里看得见；撤销条挂在输入条上沿', () => {
    mockReferenceEntries.value = [{ id: 'reference-1' }]
    render(
      <StudioMobileComposer
        templates={TEMPLATES}
        overlay={<div role="status">undo</div>}
      />,
    )

    expect(screen.getByTestId('reference-strip')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('undo')
  })

  it('reserves the measured composer height and updates after resizing', () => {
    // ⚠ 收全部回调：头部那颗写法切换（液态分段）自己也挂一个观察器。
    const callbacks: (() => void)[] = []
    const resize = () => callbacks.forEach((callback) => callback())
    const disconnect = vi.fn()
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          callbacks.push(callback)
        }
        observe() {}
        disconnect = disconnect
      },
    )
    let height = 180
    const bounds = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(() => ({ height }) as DOMRect)
    const { container, unmount } = render(
      <div className="studio-layout-v2">
        <StudioMobileComposer templates={TEMPLATES} />
      </div>,
    )
    const layout = container.firstElementChild as HTMLElement
    expect(
      layout.style.getPropertyValue('--studio-mobile-composer-height'),
    ).toBe('180px')
    height = 268
    act(() => resize())
    expect(
      layout.style.getPropertyValue('--studio-mobile-composer-height'),
    ).toBe('268px')
    unmount()
    expect(disconnect).toHaveBeenCalled()
    expect(
      layout.style.getPropertyValue('--studio-mobile-composer-height'),
    ).toBe('')
    bounds.mockRestore()
    vi.unstubAllGlobals()
  })

  it('reflects the selected model and spec on the chip row', () => {
    setForm({
      aspectRatio: '3:4',
      imageBatchCount: 2,
    } as Partial<StudioFormState>)

    render(<StudioMobileComposer templates={TEMPLATES} />)

    expect(screen.getByTestId('studio-mobile-model-chip')).toHaveTextContent(
      'GPT Image 1',
    )
    expect(screen.getByTestId('studio-spec-chip')).toBeInTheDocument()
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

    render(<StudioMobileComposer templates={TEMPLATES} />)

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
    render(<StudioMobileComposer templates={TEMPLATES} />)

    expect(screen.queryByTestId('studio-mobile-generate-count')).toBeNull()
  })

  it('shows its own placeholder — not the blocked-button copy — with no model', () => {
    setAction({ runModels: [], runModelIds: new Set() })

    render(<StudioMobileComposer templates={TEMPLATES} />)

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

    render(<StudioMobileComposer templates={TEMPLATES} />)

    const button = screen.getByTestId('studio-mobile-generate')
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).toHaveAttribute('aria-label', 'blocked.modelRequired')
    // ⚠ 不是真 `disabled`：真禁用的按钮收不到点击，用户就只剩「点了没反应」。
    expect(button).not.toBeDisabled()
  })

  it('routes the square button to the shared generate handler', () => {
    render(<StudioMobileComposer templates={TEMPLATES} />)

    fireEvent.click(screen.getByTestId('studio-mobile-generate'))

    expect(mockHandleGenerate).toHaveBeenCalledTimes(1)
  })

  it('opens the model sheet from the 模型 chip; 规格走的是共用那颗 chip 自己的弹层', () => {
    render(<StudioMobileComposer templates={TEMPLATES} />)

    expect(screen.queryByTestId('model-sheet')).toBeNull()
    fireEvent.click(screen.getByTestId('studio-mobile-model-chip'))
    expect(screen.getByTestId('model-sheet')).toBeInTheDocument()

    // ⚠ 规格**不再**有第二份 sheet 的开合 state（第 12 项）：触屏上 `SpecChip`
    //    自己就是底部抽屉，composer 只负责把它摆在 chip 行里。
    expect(screen.getByTestId('studio-spec-chip')).toBeInTheDocument()
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

    render(<StudioMobileComposer templates={TEMPLATES} />)

    expect(screen.getByTestId('studio-mobile-model-chip')).toHaveTextContent(
      'Seedance 2.5',
    )
    expect(
      screen.getByTestId('studio-mobile-model-chip'),
    ).not.toHaveTextContent('modelChipMulti')
  })

  it('「＋」拿到的是宿主那一份素材，挂着的素材排在输入框卡里', () => {
    setVideo()

    render(<StudioMobileComposer templates={TEMPLATES} />)

    expect(screen.getByTestId('studio-mobile-add')).toHaveAttribute(
      'data-video-assets',
      'host',
    )
    expect(screen.getByTestId('video-asset-rail')).toBeInTheDocument()
    expect(screen.queryByTestId('reference-strip')).toBeNull()
    expect(screen.queryByTestId('capability-chip-single')).toBeNull()
  })

  it('规格走与图片档**同一颗** chip —— 档位按模态自己分，composer 不分支', () => {
    setVideo()

    render(<StudioMobileComposer templates={TEMPLATES} />)

    expect(screen.getByTestId('studio-spec-chip')).toBeInTheDocument()
  })

  it('出声不再单独一颗 —— 它在规格抽屉里（与规格 chip 同一个开关）', () => {
    setVideo()
    render(<StudioMobileComposer templates={TEMPLATES} />)
    expect(screen.queryByTestId('studio-mobile-audio-chip')).toBeNull()
    expect(screen.queryByTestId('studio-mobile-audio-ref-chip')).toBeNull()
    expect(screen.queryByTestId('studio-mobile-script-chip')).toBeNull()
  })

  it('费用行走共用的 `StudioCostPreview`（一行版），不在 composer 里另算一个数', () => {
    setVideo()

    render(<StudioMobileComposer templates={TEMPLATES} />)

    expect(screen.getByTestId('cost-line')).toHaveTextContent('line')
  })

  it('⭐ 生成键上带这一枪的时长（`↑ 5s`），图片那枚张数角标不出现', () => {
    setVideo({ videoDuration: 10 } as Partial<StudioFormState>)

    render(<StudioMobileComposer templates={TEMPLATES} />)

    expect(
      screen.getByTestId('studio-mobile-generate-duration'),
    ).toHaveTextContent('10s')
    expect(screen.queryByTestId('studio-mobile-generate-count')).toBeNull()
  })

  it('⭐ 没选模型时规格 chip 整颗不渲染 —— 只剩箭头的空丸是纯噪音', () => {
    mockSpecChip.value = { rendered: false }
    setVideo({ selectedOptionId: null } as Partial<StudioFormState>, {
      selectedModel: null,
    })

    render(<StudioMobileComposer templates={TEMPLATES} />)

    expect(screen.queryByTestId('studio-spec-chip')).toBeNull()
    // 模型 chip 照旧在 —— 它正是「怎么选一个」的唯一出口。
    expect(screen.getByTestId('studio-mobile-model-chip')).toHaveTextContent(
      'modelChipEmpty',
    )
  })

  it('视频专属的禁用原因照样只从 `useStudioGenerateAction` 出（队列满）', () => {
    setVideo({}, { blockedReason: { message: 'blocked.videoQueueFull' } })

    render(<StudioMobileComposer templates={TEMPLATES} />)

    const button = screen.getByTestId('studio-mobile-generate')
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).toHaveAttribute('aria-label', 'blocked.videoQueueFull')
    expect(button).not.toBeDisabled()
  })
})
