import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AI_MODELS } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'

import type { TagChip } from '@/types/tag-composer'

const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
  runModels: [] as { modelId: string; adapterType: string }[],
  advancedParams: {} as Record<string, unknown>,
  negative: [] as TagChip[],
  update: vi.fn(),
  select: vi.fn(),
  add: vi.fn(),
  remove: vi.fn(),
  activeIndex: null as number | null,
  mode: 'grid' as 'grid' | 'free' | null,
  characters: [] as {
    prompt: string
    negativePrompt: string
    enabled?: boolean
  }[],
}))

vi.mock('next-intl', () => ({
  useTranslations: () =>
    Object.assign(
      (key: string, values?: Record<string, unknown>) =>
        values ? `${key}:${Object.values(values).join(',')}` : key,
      { has: () => false },
    ),
}))
vi.mock('@/contexts/studio-context', () => ({
  useStudioForm: () => ({
    state: {
      tagChips: [{ text: 'solo', weight: 1 }],
      tagNegativeChips: mocks.negative,
      activeTagCharacterIndex: mocks.activeIndex,
      advancedParams: mocks.advancedParams,
      aspectRatio: '1:1',
      imageBatchCount: 1,
    },
    dispatch: mocks.dispatch,
  }),
  useStudioData: () => ({
    characters: { activeCardIds: [] },
    imageUpload: {
      referenceEntries: [],
      referenceImages: [],
      removeReferenceImage: vi.fn(),
      isUploading: false,
    },
  }),
  useStudioGen: () => ({ cancelAllRunItems: vi.fn() }),
}))
vi.mock('@/hooks/use-studio-generate-action', () => ({
  useStudioGenerateAction: () => ({
    selectedModel: undefined,
    modelOptions: [],
    runModels: mocks.runModels,
    filterModelByDialect: () => true,
    handleReplaceRunModel: vi.fn(),
    canGenerate: true,
    blockedReason: null,
    handleGenerate: vi.fn(),
    isGenerating: false,
    elapsedSeconds: 0,
    isImagePromptOverLimit: false,
  }),
}))
vi.mock('@/hooks/use-studio-run-models', () => ({
  useStudioRunModels: () => ({ runModels: mocks.runModels }),
}))
vi.mock('@/hooks/use-novelai-characters', () => ({
  useNovelAiCharacters: () => ({
    mode: mocks.mode,
    max: 6,
    layout: mocks.characters.length
      ? { positioning: 'auto', characters: mocks.characters }
      : undefined,
    characters: mocks.characters,
    activeIndex: mocks.activeIndex,
    update: mocks.update,
    select: mocks.select,
    add: mocks.add,
    remove: mocks.remove,
  }),
}))
vi.mock('@/hooks/use-studio-shortcuts', () => ({
  useStudioShortcuts: () => {},
}))
vi.mock('@/hooks/use-reference-receiver-notice', () => ({
  useReferenceReceiverNotice: () => undefined,
}))
vi.mock('@/lib/model-options', () => ({
  getTranslatedModelLabel: (_t: unknown, modelId: string) => modelId,
}))
// 工具行里那几颗 chip 各有自己的测试，这里只验「编辑谁」这一件事。
vi.mock('@/components/business/studio-shared/pickers', () => ({
  MainModelPicker: () => null,
}))
vi.mock('@/components/business/studio/ReferenceImageChip', () => ({
  ReferenceImageChip: () => null,
  ReferenceImagePickerBody: () => null,
  ReferenceImageCountLine: () => null,
  ReferenceImageLibraryDialog: () => null,
}))
vi.mock('@/components/business/studio/StudioSpecChip', () => ({
  StudioSpecChip: () => null,
}))
vi.mock('@/components/business/studio/StudioCostPreview', () => ({
  StudioCostPreview: () => null,
}))
vi.mock(
  '@/components/business/studio-shared/workflow/StudioGenerateButton',
  () => ({
    StudioGenerateButton: () => null,
  }),
)
vi.mock('@/components/business/ImageAttachmentPreviewStrip', () => ({
  ImageAttachmentPreviewStrip: () => null,
}))
// 两台跳转那一行走 `@/i18n/navigation`，jsdom 里解不到 next/navigation。
vi.mock('./StudioDialectJumpHint', () => ({
  StudioDialectJumpHint: () => null,
}))
vi.mock('./StudioTagChipField', () => ({
  StudioTagChipField: ({
    label,
    chips,
    onChange,
  }: {
    label: string
    chips: readonly TagChip[]
    onChange: (chips: TagChip[]) => void
  }) => (
    <button
      type="button"
      data-chips={chips.map((chip) => chip.text).join(',')}
      onClick={() => onChange([...chips, { text: 'rain', weight: 1 }])}
    >
      {label}
    </button>
  ),
}))

import { StudioTagsComposer } from './StudioTagsComposer'

describe('标签台底部输入框 · 编辑谁', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Element.prototype.scrollIntoView = vi.fn()
    mocks.runModels = []
    mocks.advancedParams = {}
    mocks.negative = []
    mocks.activeIndex = null
    mocks.mode = 'grid'
    mocks.characters = [{ prompt: 'red eyes', negativePrompt: '' }]
  })

  it('整体页改的是全局标签', () => {
    render(<StudioTagsComposer onOpenPanel={vi.fn()} />)
    const positive = screen.getByRole('button', { name: 'positiveLabel' })
    expect(positive).toHaveAttribute('data-chips', 'solo')

    fireEvent.click(positive)
    expect(mocks.dispatch).toHaveBeenCalledWith({
      type: 'SET_TAG_CHIPS',
      payload: {
        polarity: 'positive',
        chips: [
          { text: 'solo', weight: 1 },
          { text: 'rain', weight: 1 },
        ],
      },
    })
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('角色页改的是那一位角色，⛔ 不碰全局', () => {
    mocks.activeIndex = 0
    render(<StudioTagsComposer onOpenPanel={vi.fn()} />)
    const positive = screen.getByRole('button', {
      name: 'characterPositiveLabel:1',
    })
    expect(positive).toHaveAttribute('data-chips', 'red eyes')

    fireEvent.click(positive)
    expect(mocks.update).toHaveBeenCalledWith(0, { prompt: 'red eyes, rain' })
    expect(mocks.dispatch).not.toHaveBeenCalled()
  })

  it('分页与角色构图面板共用同一个「正在编辑谁」', () => {
    const { unmount } = render(<StudioTagsComposer onOpenPanel={vi.fn()} />)
    fireEvent.click(
      screen.getByRole('tab', { name: 'workbench.characterNumber:1' }),
    )
    expect(mocks.select).toHaveBeenCalledWith(0)
    unmount()

    mocks.activeIndex = 0
    render(<StudioTagsComposer onOpenPanel={vi.fn()} />)
    fireEvent.click(screen.getByRole('tab', { name: 'wholeTab' }))
    expect(mocks.select).toHaveBeenLastCalledWith(null)
  })

  it('模型不支持角色构图时没有分页那一行', () => {
    mocks.mode = null
    render(<StudioTagsComposer onOpenPanel={vi.fn()} />)
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /workbench\.composition/ }),
    ).not.toBeInTheDocument()
  })

  // 画风串 2026-09-27 取消：工具行里没有那颗 chip 了。
  it('工具行没有「画风串」', () => {
    render(<StudioTagsComposer onOpenPanel={vi.fn()} />)
    expect(
      screen.queryByRole('button', { name: 'workbench.blocks' }),
    ).not.toBeInTheDocument()
  })
  it('手机默认只展开正向，展开负向可编辑，收起后再打开保留标签', () => {
    mocks.negative = [{ text: 'blurry', weight: 1 }]
    render(<StudioTagsComposer mobile onOpenPanel={vi.fn()} />)
    expect(
      screen.getByRole('button', { name: 'positiveLabel' }),
    ).toBeInTheDocument()
    const toggle = screen.getByRole('button', { name: /negativeLabel\s*1/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(
      screen.queryByRole('button', { name: 'negativeLabel' }),
    ).not.toBeInTheDocument()
    fireEvent.click(toggle)
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
      block: 'nearest',
    })
    const field = screen.getByRole('button', {
      name: 'negativeLabel',
    })
    expect(field).toHaveAttribute('data-chips', 'blurry')
    fireEvent.click(field)
    expect(mocks.dispatch).toHaveBeenCalledWith({
      type: 'SET_TAG_CHIPS',
      payload: {
        polarity: 'negative',
        chips: [
          { text: 'blurry', weight: 1 },
          { text: 'rain', weight: 1 },
        ],
      },
    })
    fireEvent.click(toggle)
    fireEvent.click(toggle)
    expect(
      screen.getByRole('button', { name: 'negativeLabel' }),
    ).toHaveAttribute('data-chips', 'blurry')
  })

  it('手机角色页展开负向只更新当前角色', () => {
    mocks.activeIndex = 0
    render(<StudioTagsComposer mobile onOpenPanel={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'negativeLabel' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'negativeLabel' })[1])
    expect(mocks.update).toHaveBeenCalledWith(0, { negativePrompt: 'rain' })
    expect(mocks.dispatch).not.toHaveBeenCalled()
  })

  // 2026-10-04 起画中文字收进手机输入条的「＋」，在抽屉里推进一页。
  it('V5 的画中文字独立打开，输入直接写入生成参数', async () => {
    mocks.runModels = [
      {
        modelId: AI_MODELS.NOVELAI_V5_FULL,
        adapterType: AI_ADAPTER_TYPES.NOVELAI,
      },
    ]
    render(<StudioTagsComposer mobile onOpenPanel={vi.fn()} />)
    fireEvent.click(screen.getByTestId('studio-mobile-add'))
    fireEvent.click(await screen.findByTestId('studio-mobile-add-text'))
    const field = await screen.findByRole('textbox', {
      name: 'capability.textRendering',
    })
    fireEvent.change(field, { target: { value: '你好' } })
    expect(mocks.dispatch).toHaveBeenCalledWith({
      type: 'SET_ADVANCED_PARAMS',
      payload: { textRendering: '你好' },
    })
  })

  it('画中文字入口保留已填数量，不依赖采样器或步数', async () => {
    mocks.runModels = [
      {
        modelId: AI_MODELS.NOVELAI_V5_FULL,
        adapterType: AI_ADAPTER_TYPES.NOVELAI,
      },
    ]
    mocks.advancedParams = {
      textRendering: '你好',
      sampler: 'k_euler',
      steps: 30,
    }
    const { rerender } = render(
      <StudioTagsComposer mobile onOpenPanel={vi.fn()} />,
    )
    // 填了字但输入框里看不见 —— 「＋」灰底，行尾报字数。
    expect(screen.getByTestId('studio-mobile-add')).toHaveAttribute('data-set')
    fireEvent.click(screen.getByTestId('studio-mobile-add'))
    expect(
      await screen.findByTestId('studio-mobile-add-text'),
    ).toHaveTextContent('2')
    expect(screen.getByRole('button', { name: 'parameters' })).toBeVisible()
    mocks.runModels = [
      {
        modelId: AI_MODELS.NOVELAI_V45_CURATED,
        adapterType: AI_ADAPTER_TYPES.NOVELAI,
      },
    ]
    rerender(<StudioTagsComposer mobile onOpenPanel={vi.fn()} />)
    expect(screen.queryByTestId('studio-mobile-add-text')).toBeNull()
  })
})
