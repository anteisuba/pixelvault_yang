import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { AI_MODELS } from '@/constants/models'

import { LoraWorkbench } from './LoraWorkbench'

// ── Issue 2 (Hard Rule 8) + 用户反馈迭代：API key 配置入口挂在「选底模」
// 这一步（LoraSpineBar 的 needsKey 徽章），不挂在出图按钮上——出图按钮
// 始终显示「出图」，只在用户从没碰过底模选择器时兜底路由到
// QuickSetupDialog。这里只覆盖 GenerateBranch 的 key-gate 分支，其余
// tab（库/训练）保持未测（既有 god-component，无先例覆盖），不在本次
// 改动范围内新增。

const mockGenerate = vi.hoisted(() => vi.fn())
const mockUseApiKeysContext = vi.hoisted(() => vi.fn())
const mockAddTag = vi.hoisted(() => vi.fn())

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}:${key}`,
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('section=generate'),
}))

vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/studio/lora',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}))

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}))

vi.mock('@/hooks/use-lora-assets', () => ({
  useLoraAssets: () => ({
    myAssets: [],
    trainedAssets: [],
    favoriteAssets: [],
    discoverAssets: [],
    isLoadingMine: false,
    isLoadingDiscover: false,
    errorMine: null,
    refresh: vi.fn(),
    setVisibility: vi.fn(),
    favoriteCivitaiLora: vi.fn(),
    unfavoriteAsset: vi.fn(),
    unfavoriteByUrl: vi.fn(),
    deleteAsset: vi.fn(),
    isFavorited: vi.fn(() => false),
  }),
}))

const stackAsset = {
  id: 'lora-1',
  name: 'Test LoRA',
  triggerWord: 'testlora',
  baseModelFamily: 'illustrious',
  defaultScale: 1,
  loraUrl: 'https://example.com/lora.safetensors',
  modelId: 'civitai-model-1',
  modelVersionId: 'civitai-version-1',
  fileHashAutoV3: 'hash-1',
}

vi.mock('@/hooks/use-active-lora-stack', () => ({
  LORA_STACK_MAX: 3,
  useActiveLoraStack: () => ({
    items: [{ asset: stackAsset, scale: 1 }],
    push: vi.fn(),
    setScale: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
  }),
}))

vi.mock('@/contexts/api-keys-context', () => ({
  useApiKeysContext: mockUseApiKeysContext,
}))

// LoraTagPicker (自己搭配) and PromptTagTray both read this — not under test
// here (covered separately by prompt-tag-search/compiler/stack's own
// suites), so a minimal empty-stack stub keeps these tests focused on the
// key-gate behavior instead of re-testing the tag-stack engine.
vi.mock('@/hooks/use-prompt-tag-stack', () => ({
  usePromptTagStack: () => ({
    positive: [],
    negative: [],
    selectedTagIds: new Set<string>(),
    selectedCount: 0,
    addTag: mockAddTag,
    removeTag: vi.fn(),
    clearTags: vi.fn(),
    setWeight: vi.fn(),
    allSelections: () => [],
  }),
}))

let mockLastGeneration: { url: string } | null = null
vi.mock('@/hooks/use-unified-generate', () => ({
  useUnifiedGenerate: () => ({
    generate: mockGenerate,
    isGenerating: false,
    get lastGeneration() {
      return mockLastGeneration
    },
  }),
}))

vi.mock('@/hooks/use-civitai-lora-library', () => ({
  useCivitaiLoraLibrary: () => ({
    items: [],
    isLoading: false,
    isRevalidating: false,
    error: null,
    search: '',
    setSearch: vi.fn(),
    sort: 'newest',
    setSort: vi.fn(),
    baseModel: 'all',
    setBaseModel: vi.fn(),
    page: 1,
    total: 0,
    hasNextPage: false,
    previousPage: vi.fn(),
    nextPage: vi.fn(),
    selectedItem: null,
    selectItem: vi.fn(),
    refresh: vi.fn(),
  }),
}))

let mockMinedRecipes: unknown[] = []
vi.mock('@/hooks/prompts/use-civitai-mined-prompts', () => ({
  useCivitaiMinedPrompts: () => ({
    get recipes() {
      return mockMinedRecipes
    },
    outfits: [],
    totalSampled: 0,
    isLoading: false,
  }),
}))

const quickSetupSpy = vi.hoisted(() => vi.fn())
vi.mock('@/components/business/studio-shared/setup/QuickSetupDialog', () => ({
  QuickSetupDialog: (props: {
    open: boolean
    modelId: string
    adapterType: string
    optionId: string
  }) => {
    quickSetupSpy(props)
    if (!props.open) return null
    return (
      <div data-testid="quick-setup-dialog">
        {props.adapterType}:{props.modelId}
      </div>
    )
  },
}))

describe('LoraWorkbench GenerateBranch — API key gate (Issue 2)', () => {
  beforeEach(() => {
    mockGenerate.mockReset()
    quickSetupSpy.mockReset()
    mockAddTag.mockReset()
    mockLastGeneration = null
  })

  it('shows a needs-key badge in the spine bar that opens QuickSetupDialog, without touching Generate', () => {
    mockUseApiKeysContext.mockReturnValue({ keys: [], healthMap: {} })

    render(<LoraWorkbench />)

    // Primary entry point is now the spine bar's badge next to the base
    // model selector — not the Generate button.
    const keyBadge = screen.getByRole('button', {
      name: /QuickSetup:needsKey/,
    })
    fireEvent.click(keyBadge)

    expect(mockGenerate).not.toHaveBeenCalled()
    expect(screen.getByTestId('quick-setup-dialog')).toHaveTextContent(
      `${AI_ADAPTER_TYPES.REPLICATE}:${AI_MODELS.ILLUSTRIOUS_XL}`,
    )

    // Generate button never swaps its own label/icon for the key state.
    expect(
      screen.getByRole('button', { name: /LoraWorkbench:generate\.run/ }),
    ).not.toBeDisabled()
  })

  it('falls back to QuickSetupDialog if Generate is clicked while the base model still lacks a key', () => {
    mockUseApiKeysContext.mockReturnValue({ keys: [], healthMap: {} })

    render(<LoraWorkbench />)

    const generateButton = screen.getByRole('button', {
      name: /LoraWorkbench:generate\.run/,
    })

    fireEvent.click(generateButton)

    expect(mockGenerate).not.toHaveBeenCalled()
    expect(screen.getByTestId('quick-setup-dialog')).toHaveTextContent(
      `${AI_ADAPTER_TYPES.REPLICATE}:${AI_MODELS.ILLUSTRIOUS_XL}`,
    )
  })

  it('generates directly when the selected base model already has a saved key route', () => {
    mockUseApiKeysContext.mockReturnValue({
      keys: [
        {
          id: 'key-1',
          modelId: AI_MODELS.ILLUSTRIOUS_XL,
          adapterType: AI_ADAPTER_TYPES.REPLICATE,
          providerConfig: { label: 'Replicate', baseUrl: '' },
          label: 'My Replicate key',
          maskedKey: '****abcd',
          isActive: true,
          createdAt: new Date(),
        },
      ],
      healthMap: { 'key-1': 'available' },
    })

    render(<LoraWorkbench />)

    expect(
      screen.queryByRole('button', { name: /QuickSetup:needsKey/ }),
    ).not.toBeInTheDocument()

    const generateButton = screen.getByRole('button', {
      name: /LoraWorkbench:generate\.run/,
    })

    fireEvent.click(generateButton)

    expect(mockGenerate).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('quick-setup-dialog')).not.toBeInTheDocument()
  })

  it('opens a picture-frame preview when clicking the generated result image', () => {
    mockUseApiKeysContext.mockReturnValue({ keys: [], healthMap: {} })
    mockLastGeneration = { url: 'https://example.com/result.png' }

    render(<LoraWorkbench />)

    const resultTrigger = screen.getByRole('button', {
      name: /LoraWorkbench:generate\.resultPreviewLabel/,
    })
    fireEvent.click(resultTrigger)

    const dialogImage = screen.getByRole('img', {
      name: /LoraWorkbench:generate\.resultPreviewLabel/,
    })
    expect(dialogImage).toHaveAttribute('src', 'https://example.com/result.png')

    fireEvent.click(
      screen.getByRole('button', { name: /LoraWorkbench:coverPreviewBack/ }),
    )
    expect(
      screen.queryByRole('img', {
        name: /LoraWorkbench:generate\.resultPreviewLabel/,
      }),
    ).not.toBeInTheDocument()
  })
})

describe('LoraWorkbench GenerateBranch — 自己搭配 tag picker', () => {
  beforeEach(() => {
    mockGenerate.mockReset()
    mockAddTag.mockReset()
    mockLastGeneration = null
    mockUseApiKeysContext.mockReturnValue({ keys: [], healthMap: {} })
  })

  it('switches to 自己搭配 and adds a curated tag from search results', () => {
    render(<LoraWorkbench />)

    fireEvent.click(
      screen.getByRole('button', {
        name: 'LoraWorkbench:generate.promptModeSelfBuild',
      }),
    )

    // Empty-query results rank system/curated tags highest — "Masterpiece"
    // (id: system:quality:masterpiece) should be visible without typing.
    const masterpieceResult = screen.getByRole('button', {
      name: /Masterpiece/,
    })
    fireEvent.click(masterpieceResult)

    expect(mockAddTag).toHaveBeenCalledTimes(1)
    expect(mockAddTag.mock.calls[0][0]).toMatchObject({
      id: 'system:quality:masterpiece',
      promptText: 'masterpiece',
    })
  })

  it('filters results by search query', () => {
    render(<LoraWorkbench />)

    fireEvent.click(
      screen.getByRole('button', {
        name: 'LoraWorkbench:generate.promptModeSelfBuild',
      }),
    )

    const searchInput = screen.getByPlaceholderText(
      'PromptTags:library.searchPlaceholder',
    )
    fireEvent.change(searchInput, { target: { value: 'rim lighting' } })

    expect(
      screen.getByRole('button', { name: /Rim light/ }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Masterpiece/ }),
    ).not.toBeInTheDocument()
  })
})

describe('LoraWorkbench GenerateBranch — negative prompt visibility', () => {
  beforeEach(() => {
    mockGenerate.mockReset()
    mockLastGeneration = null
    mockMinedRecipes = []
    mockUseApiKeysContext.mockReturnValue({ keys: [], healthMap: {} })
  })

  it('reveals the negative prompt field after applying a recipe that has one', () => {
    mockMinedRecipes = [
      {
        imageUrl: 'https://example.com/source.png',
        source: 'model_version_image',
        prompt: 'masterpiece, best quality',
        negativePrompt: 'bad hands, blurry',
      },
    ]

    render(<LoraWorkbench />)

    // No negative field until something actually needs it — matches the
    // rest of the composer's "don't show empty chrome" convention.
    expect(
      screen.queryByPlaceholderText(
        'LoraWorkbench:generate.negativePromptPlaceholder',
      ),
    ).not.toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', {
        name: /LoraPromptControl\.generate:sourceImagePreviewLabel/,
      }),
    )
    // Clicking the thumbnail both selects the recipe and opens the
    // picture-frame lightbox (Dialog) — Radix marks the rest of the page
    // aria-hidden while it's open, same as real screen-reader/interaction
    // behavior, so close it before reaching for the recipe card underneath.
    fireEvent.click(
      screen.getByRole('button', {
        name: /LoraPromptControl\.generate:sourceImagePreviewClose/,
      }),
    )
    fireEvent.click(
      screen.getByRole('button', {
        name: /LoraPromptControl\.generate:recipeApply/,
      }),
    )

    const negativeField = screen.getByPlaceholderText(
      'LoraWorkbench:generate.negativePromptPlaceholder',
    )
    expect(negativeField).toHaveValue('bad hands, blurry')
  })

  it('manually reveals an empty negative prompt field on request', () => {
    render(<LoraWorkbench />)

    fireEvent.click(
      screen.getByRole('button', {
        name: 'LoraWorkbench:generate.negativePromptAdd',
      }),
    )

    expect(
      screen.getByPlaceholderText(
        'LoraWorkbench:generate.negativePromptPlaceholder',
      ),
    ).toBeInTheDocument()
  })
})
