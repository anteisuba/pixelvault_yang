import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { TagChip } from '@/types/tag-composer'

const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
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
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${Object.values(values).join(',')}` : key,
}))
vi.mock('@/contexts/studio-context', () => ({
  useStudioForm: () => ({
    state: {
      tagChips: [{ text: 'solo', weight: 1 }],
      tagNegativeChips: [],
      tagPromptBlocks: [],
      activeTagCharacterIndex: mocks.activeIndex,
      advancedParams: {},
      aspectRatio: '1:1',
      imageBatchCount: 1,
    },
    dispatch: mocks.dispatch,
  }),
  useStudioData: () => ({
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
    runModels: [],
    runModelIds: new Set(),
    filterModelByDialect: () => true,
    handleToggleRunModel: vi.fn(),
    canGenerate: true,
    blockedReason: null,
    handleGenerate: vi.fn(),
    isGenerating: false,
    elapsedSeconds: 0,
    isImagePromptOverLimit: false,
  }),
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
    render(<StudioTagsComposer onOpenPanel={vi.fn()} />)
    fireEvent.click(
      screen.getByRole('tab', { name: 'workbench.characterNumber:1' }),
    )
    expect(mocks.select).toHaveBeenCalledWith(0)
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
})
