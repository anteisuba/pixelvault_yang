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

vi.mock('@/hooks/use-unified-generate', () => ({
  useUnifiedGenerate: () => ({
    generate: mockGenerate,
    isGenerating: false,
    lastGeneration: null,
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

vi.mock('@/hooks/prompts/use-civitai-mined-prompts', () => ({
  useCivitaiMinedPrompts: () => ({
    recipes: [],
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
})
