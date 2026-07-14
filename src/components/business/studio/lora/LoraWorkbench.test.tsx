import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { AI_MODELS } from '@/constants/models'

import { LoraWorkbench } from './LoraWorkbench'

beforeAll(() => {
  Object.defineProperties(HTMLElement.prototype, {
    hasPointerCapture: {
      configurable: true,
      value: () => false,
    },
    releasePointerCapture: {
      configurable: true,
      value: () => undefined,
    },
    setPointerCapture: {
      configurable: true,
      value: () => undefined,
    },
    scrollIntoView: {
      configurable: true,
      value: () => undefined,
    },
  })
})

// ── Issue 2 (Hard Rule 8) + 用户反馈迭代：API key 配置入口挂在「选底模」
// 这一步（LoraSpineBar 的 needsKey 徽章），不挂在出图按钮上——出图按钮
// 始终显示「出图」，只在用户从没碰过底模选择器时兜底路由到
// QuickSetupDialog。这里只覆盖 GenerateBranch 的 key-gate 分支，其余
// tab（库/训练）保持未测（既有 god-component，无先例覆盖），不在本次
// 改动范围内新增。

const mockGenerate = vi.hoisted(() => vi.fn())
const mockUseApiKeysContext = vi.hoisted(() => vi.fn())
const mockAddTag = vi.hoisted(() => vi.fn())
const mockRouterReplace = vi.hoisted(() => vi.fn())
const mockRouterPush = vi.hoisted(() => vi.fn())

vi.mock('@/constants/feature-flags', () => ({
  FEATURE_FLAGS: {
    promptAssist: true,
    promptLibrary: true,
    loraStudio: true,
    comfyRunner: true,
  },
}))

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
  useRouter: () => ({ replace: mockRouterReplace, push: mockRouterPush }),
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

let mockStackItems = [{ asset: stackAsset, scale: 1 }]

vi.mock('@/hooks/use-active-lora-stack', () => ({
  LORA_STACK_MAX: 3,
  useActiveLoraStack: () => ({
    get items() {
      return mockStackItems
    },
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
let mockMinedPreviewImages: unknown[] = []
vi.mock('@/hooks/prompts/use-civitai-mined-prompts', () => ({
  useCivitaiMinedPrompts: () => ({
    get recipes() {
      return mockMinedRecipes
    },
    get previewImages() {
      return mockMinedPreviewImages
    },
    descriptionText: null,
    outfits: [],
    totalSampled: 0,
    isLoading: false,
  }),
}))

vi.mock('@/hooks/prompts/use-civitai-model-description', () => ({
  useCivitaiModelDescription: () => ({
    descriptionText: null,
    isLoading: false,
  }),
}))

vi.mock('@/hooks/prompts/use-runner-usage', () => ({
  useRunnerUsage: () => ({ usage: null, isLoading: false }),
}))

// B9: control the reference-image state so we can assert handleGenerate
// threads it into the generate request. Default empty → transparent to the
// other tests. Reset before every test via the file-level beforeEach below.
let mockReferenceImages: string[] = []
vi.mock('@/hooks/use-image-upload', () => ({
  useImageUpload: () => ({
    referenceImage: mockReferenceImages[0],
    referenceImages: mockReferenceImages,
    referenceEntries: mockReferenceImages.map((url) => ({
      url,
      disabledReason: null,
    })),
    setReferenceImage: vi.fn(),
    addReferenceImage: vi.fn(),
    removeReferenceImage: vi.fn(),
    clearAllImages: vi.fn(),
    addFromUrl: vi.fn(),
    setMaxImages: vi.fn(),
    isDragging: false,
    setIsDragging: vi.fn(),
    fileInputRef: { current: null },
    handleFileChange: vi.fn(),
    handleDrop: vi.fn(),
    handleDragEnter: vi.fn(),
    handleDragOver: vi.fn(),
    handleDragLeave: vi.fn(),
    openFilePicker: vi.fn(),
    handleInputChange: vi.fn(),
    clearImage: vi.fn(),
    isUploading: false,
  }),
}))

beforeEach(() => {
  mockReferenceImages = []
  mockStackItems = [{ asset: stackAsset, scale: 1 }]
})

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
    mockMinedRecipes = []
    mockMinedPreviewImages = []
  })

  it('D7④: default-selects the first source image so the recipe panel is not empty', () => {
    mockUseApiKeysContext.mockReturnValue({ keys: [], healthMap: {} })
    mockMinedRecipes = [
      {
        imageUrl: 'https://example.com/source.png',
        source: 'model_version_image',
        prompt: 'portrait, green hanfu',
      },
    ]

    render(<LoraWorkbench />)

    // Without any manual thumbnail click, the recipe card (its Apply button)
    // is already rendered → the first source image was auto-selected.
    expect(
      screen.getByRole('button', {
        name: /LoraPromptControl\.generate:recipeApply/,
      }),
    ).toBeInTheDocument()
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

  it('applies Civitai recipe steps and CFG to the real generation request', () => {
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
    mockMinedRecipes = [
      {
        imageUrl: 'https://example.com/source.png',
        source: 'model_version_image',
        prompt: 'best quality, 1girl',
        negativePrompt: 'worst quality',
        steps: 32,
        cfgScale: 4,
      },
    ]

    render(<LoraWorkbench />)
    fireEvent.click(
      screen.getByRole('button', {
        name: /LoraPromptControl\.generate:recipeApply/,
      }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: /LoraWorkbench:generate\.run/ }),
    )

    const call = mockGenerate.mock.calls[0]?.[0]
    expect(call.image.advancedParams).toMatchObject({
      negativePrompt: 'worst quality',
      steps: 32,
      guidanceScale: 4,
    })
  })

  it('B9: threads the reference image + strength into the generate request when one is attached', () => {
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
    mockReferenceImages = ['https://cdn.example.com/ref.png']

    render(<LoraWorkbench />)

    fireEvent.click(
      screen.getByRole('button', { name: /LoraWorkbench:generate\.run/ }),
    )

    expect(mockGenerate).toHaveBeenCalledTimes(1)
    const call = mockGenerate.mock.calls[0][0]
    expect(call.image.referenceImages).toEqual([
      'https://cdn.example.com/ref.png',
    ])
    expect(call.image.advancedParams.referenceStrength).toEqual(
      expect.any(Number),
    )
  })

  it('D7③: records each successful generation into the session filmstrip and switches the shown result', async () => {
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
    mockGenerate
      .mockResolvedValueOnce({
        id: 'gen-1',
        url: 'https://example.com/1.png',
        seed: 111,
      })
      .mockResolvedValueOnce({
        id: 'gen-2',
        url: 'https://example.com/2.png',
        seed: 222,
      })

    render(<LoraWorkbench />)
    const generateButton = screen.getByRole('button', {
      name: /LoraWorkbench:generate\.run/,
    })

    // One generation → no filmstrip yet (needs >1 result).
    fireEvent.click(generateButton)
    await screen.findByRole('button', {
      name: /LoraWorkbench:generate\.resultPreviewLabel/,
    })
    expect(screen.queryAllByRole('option')).toHaveLength(0)

    // Second generation → filmstrip appears with both, newest selected.
    fireEvent.click(generateButton)
    const options = await screen.findAllByRole('option')
    expect(options).toHaveLength(2)
    // gen-2 is the most recent → prepended and selected.
    expect(options[0]).toHaveAttribute('aria-selected', 'true')
    expect(options[0]).toHaveTextContent('222')

    // Clicking the older thumbnail switches selection.
    fireEvent.click(options[1])
    expect(options[1]).toHaveAttribute('aria-selected', 'true')
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

describe('LoraWorkbench GenerateBranch — pure base and Runner controls', () => {
  beforeEach(() => {
    mockGenerate.mockReset()
    mockLastGeneration = null
    mockMinedRecipes = []
    mockMinedPreviewImages = []
    mockStackItems = []
    mockUseApiKeysContext.mockReturnValue({ keys: [], healthMap: {} })
  })

  it('defaults an empty LoRA stack to Anima Base and generates without a fake LoRA', () => {
    render(<LoraWorkbench />)

    expect(screen.getByText('LoraWorkbench:spine.empty')).toBeInTheDocument()
    expect(screen.getByRole('combobox')).toHaveTextContent('Anima Base v1.0')

    fireEvent.change(
      screen.getByPlaceholderText('LoraWorkbench:generate.promptPlaceholder'),
      { target: { value: 'sunset railway, anime girl' } },
    )
    fireEvent.click(
      screen.getByRole('button', { name: /LoraWorkbench:generate\.run/ }),
    )

    expect(mockGenerate).toHaveBeenCalledTimes(1)
    const request = mockGenerate.mock.calls[0][0]
    expect(request.image.modelId).toBe(AI_MODELS.ANIMA_DIT_RUNNER)
    expect(request.image.advancedParams?.loras).toBeUndefined()
  })

  it('sends manually edited Runner controls and 4x-AnimeSharp in the real request', () => {
    render(<LoraWorkbench />)

    fireEvent.click(
      screen.getByRole('button', {
        name: /LoraWorkbench:generate\.advanced\.title/,
      }),
    )
    fireEvent.change(
      screen.getByLabelText('LoraWorkbench:generate.advanced.seed'),
      { target: { value: '5536891017203' } },
    )
    fireEvent.change(
      screen.getByLabelText('LoraWorkbench:generate.advanced.steps'),
      { target: { value: '32' } },
    )
    fireEvent.change(
      screen.getByLabelText('LoraWorkbench:generate.advanced.cfg'),
      { target: { value: '4' } },
    )
    fireEvent.change(
      screen.getByLabelText('LoraWorkbench:generate.advanced.width'),
      { target: { value: '1024' } },
    )
    fireEvent.change(
      screen.getByLabelText('LoraWorkbench:generate.advanced.height'),
      { target: { value: '1024' } },
    )

    const upscaler = screen.getByRole('combobox', {
      name: 'LoraWorkbench:generate.advanced.upscaler',
    })
    fireEvent.keyDown(upscaler, { key: 'ArrowDown' })
    fireEvent.click(screen.getByRole('option', { name: '4x-AnimeSharp' }))

    fireEvent.change(
      screen.getByPlaceholderText('LoraWorkbench:generate.promptPlaceholder'),
      { target: { value: 'cinematic anime city' } },
    )
    fireEvent.click(
      screen.getByRole('button', { name: /LoraWorkbench:generate\.run/ }),
    )

    expect(mockGenerate).toHaveBeenCalledTimes(1)
    expect(mockGenerate.mock.calls[0][0].image.advancedParams).toMatchObject({
      runnerSeed: '5536891017203',
      steps: 32,
      guidanceScale: 4,
      runnerWidth: 1024,
      runnerHeight: 1024,
      runnerUpscaler: '4x-AnimeSharp',
    })
  })

  it('blocks generation when only one exact dimension is entered', () => {
    render(<LoraWorkbench />)
    fireEvent.click(
      screen.getByRole('button', {
        name: /LoraWorkbench:generate\.advanced\.title/,
      }),
    )
    fireEvent.change(
      screen.getByLabelText('LoraWorkbench:generate.advanced.width'),
      { target: { value: '1024' } },
    )

    expect(screen.getByRole('alert')).toHaveTextContent(
      'LoraWorkbench:generate.advanced.dimensionPairError',
    )
    expect(
      screen.getByRole('button', { name: /LoraWorkbench:generate\.run/ }),
    ).toBeDisabled()
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

// B7 / P2-4 + P2-7: the module tab bar is a real Radix Tabs pill — three
// role="tab" triggers, clicking one drives the URL (section deep link)
// rather than any custom pointer handler. This guards both the standard
// tab semantics and the click→navigate wiring.
describe('LoraWorkbench module tab bar — P2-4/P2-7', () => {
  beforeEach(() => {
    mockRouterReplace.mockReset()
    mockUseApiKeysContext.mockReturnValue({ keys: [], healthMap: {} })
  })

  it('renders exactly three tabs with the tab role, generate selected on the generate deep link', () => {
    render(<LoraWorkbench />)

    expect(screen.getAllByRole('tab')).toHaveLength(3)
    expect(
      screen.getByRole('tab', { name: /LoraWorkbench:tabs\.generate/ }),
    ).toHaveAttribute('aria-selected', 'true')
  })

  it('navigates (URL replace) to the activated section — Radix tabs activate on primary mousedown', () => {
    render(<LoraWorkbench />)

    // P2-7: Radix Tabs activate on primary pointer-down (this is why a bare
    // synthetic click() looked like a no-op on the old bar); firing the real
    // activation event proves the click→navigate wiring end to end.
    fireEvent.mouseDown(
      screen.getByRole('tab', { name: /LoraWorkbench:tabs\.train/ }),
      { button: 0 },
    )

    expect(mockRouterReplace).toHaveBeenCalledWith(
      expect.stringContaining('section=train'),
      expect.objectContaining({ scroll: false }),
    )
  })

  it('activates a tab from the keyboard (Enter) — full Radix tab a11y', () => {
    render(<LoraWorkbench />)

    const trainTab = screen.getByRole('tab', {
      name: /LoraWorkbench:tabs\.train/,
    })
    trainTab.focus()
    fireEvent.keyDown(trainTab, { key: 'Enter' })

    expect(mockRouterReplace).toHaveBeenCalledWith(
      expect.stringContaining('section=train'),
      expect.objectContaining({ scroll: false }),
    )
  })
})
