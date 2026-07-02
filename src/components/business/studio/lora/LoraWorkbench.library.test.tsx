import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CivitaiLoraLibraryItem } from '@/types'

import { LoraWorkbench } from './LoraWorkbench'

// ── 库模块重做（lora-domain-wireframes.md §4）：公开库从行列表 + 常驻
// 详情栏改成封面网格 + 按需 Sheet/Drawer。这个文件之前完全没有测试基础
// 设施（Clerk auth / civitai 库数据 / 搜索历史都要重新搭 mock），这里第一
// 次搭起来，覆盖：网格渲染、点卡开详情、收藏切换、分页按钮状态。

const mockFavoriteCivitaiLora = vi.hoisted(() => vi.fn())
const mockUnfavoriteByUrl = vi.hoisted(() => vi.fn())
const mockStackPush = vi.hoisted(() => vi.fn())
const mockNextPage = vi.hoisted(() => vi.fn())
const mockPreviousPage = vi.hoisted(() => vi.fn())
const mockSelectItem = vi.hoisted(() => vi.fn())

let mockSection = 'community'
let mockFavoritedUrls = new Set<string>()
let mockLibraryItems: CivitaiLoraLibraryItem[] = []
let mockLibraryPage = 1
let mockLibraryHasNextPage = false

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}:${key}`,
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    message: vi.fn(),
  },
}))

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(`section=${mockSection}`),
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
    favoriteCivitaiLora: mockFavoriteCivitaiLora,
    unfavoriteAsset: vi.fn(),
    unfavoriteByUrl: mockUnfavoriteByUrl,
    deleteAsset: vi.fn(),
    isFavorited: (url: string) => mockFavoritedUrls.has(url),
  }),
}))

vi.mock('@/hooks/use-active-lora-stack', () => ({
  LORA_STACK_MAX: 3,
  useActiveLoraStack: () => ({
    items: [],
    push: mockStackPush,
    setScale: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
  }),
}))

vi.mock('@/hooks/prompts/use-civitai-mined-prompts', () => ({
  useCivitaiMinedPrompts: () => ({
    outfits: [],
    totalSampled: 0,
    isLoading: false,
  }),
}))

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, userId: 'test-clerk-id' }),
}))

vi.mock('@/lib/civitai-search-history', () => ({
  readSearchHistory: () => [],
  recordSearchTerm: () => [],
  clearSearchHistory: () => [],
}))

vi.mock('@/hooks/use-civitai-lora-library', () => ({
  useCivitaiLoraLibrary: () => ({
    get items() {
      return mockLibraryItems
    },
    selectedItem: mockLibraryItems[0] ?? null,
    total: mockLibraryItems.length,
    get page() {
      return mockLibraryPage
    },
    pageSize: 24,
    get hasNextPage() {
      return mockLibraryHasNextPage
    },
    isLoading: false,
    isRevalidating: false,
    error: null,
    search: '',
    sort: 'Highest Rated',
    baseModel: 'all',
    setSearch: vi.fn(),
    setSort: vi.fn(),
    setBaseModel: vi.fn(),
    selectItem: mockSelectItem,
    nextPage: mockNextPage,
    previousPage: mockPreviousPage,
    refresh: vi.fn(),
  }),
}))

function makeLibraryItem(
  overrides: Partial<CivitaiLoraLibraryItem> & { id: string; name: string },
): CivitaiLoraLibraryItem {
  return {
    styleCode: overrides.id,
    source: 'imported',
    type: 'style',
    baseModelFamily: 'Illustrious',
    provider: 'civitai',
    triggerWord: 'trigger',
    loraUrl: `https://civitai.com/api/download/models/${overrides.id}`,
    coverImageUrl: 'https://example.com/cover.png',
    previewImageUrls: [],
    defaultScale: 1,
    isPublic: true,
    isOwn: false,
    createdAt: new Date().toISOString(),
    modelId: 1,
    modelVersionId: 1,
    versionName: 'v1',
    creatorName: 'creator',
    creatorAvatarUrl: null,
    modelPageUrl: 'https://civitai.com/models/1',
    tags: [],
    downloadCount: 100,
    thumbsUpCount: 10,
    allowCommercialUse: ['Image'],
    allowDerivatives: true,
    thumbImageUrl: 'https://example.com/thumb.png',
    coverImageUrlOriginal: 'https://example.com/cover-original.png',
    triggerAlternates: [],
    recommendedPrompt: null,
    recommendedPromptAlternates: [],
    triggerSource: 'official',
    fileHashAutoV3: null,
    ...overrides,
  }
}

describe('LoraWorkbench CivitaiCommunityBranch — cover grid + detail sheet', () => {
  beforeEach(() => {
    mockSection = 'community'
    mockFavoriteCivitaiLora.mockReset()
    mockUnfavoriteByUrl.mockReset()
    mockStackPush.mockReset()
    mockSelectItem.mockReset()
    mockNextPage.mockReset()
    mockPreviousPage.mockReset()
    mockFavoritedUrls = new Set()
    mockLibraryItems = [
      makeLibraryItem({ id: '1', name: 'Perlica' }),
      makeLibraryItem({ id: '2', name: 'Detail Tweaker' }),
    ]
    mockLibraryPage = 1
    mockLibraryHasNextPage = true
  })

  it('renders a cover card per library item instead of a row list', () => {
    render(<LoraWorkbench />)

    expect(screen.getByText('Perlica')).toBeInTheDocument()
    expect(screen.getByText('Detail Tweaker')).toBeInTheDocument()
    // Cards are plain buttons keyed by name — no separate "row" chrome
    // (trigger word / creator line) should be present on the grid tile.
    expect(screen.getByRole('button', { name: 'Perlica' })).toBeInTheDocument()
  })

  it('opens the detail sheet when a card is clicked, and it stays closed until then', () => {
    render(<LoraWorkbench />)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Perlica' }))

    expect(mockSelectItem).toHaveBeenCalledWith(
      expect.objectContaining({ id: '1', name: 'Perlica' }),
    )
    // Dialog content (CivitaiLoraInspector) likely repeats the LoRA name
    // visibly alongside the sr-only SheetTitle — assert the sheet opened
    // for the right item rather than pin an exact text match count.
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getAllByText('Perlica').length).toBeGreaterThan(0)
  })

  it('toggles favorite from the card without opening the detail sheet', () => {
    render(<LoraWorkbench />)

    // Both seed items are unfavorited, so both cards render a "favorite"
    // button — click the first one (Perlica's).
    const [favoriteButton] = screen.getAllByRole('button', {
      name: 'LoraWorkbench:favorite',
    })
    fireEvent.click(favoriteButton)

    expect(mockFavoriteCivitaiLora).toHaveBeenCalledTimes(1)
    expect(mockFavoriteCivitaiLora).toHaveBeenCalledWith(
      expect.objectContaining({ id: '1', name: 'Perlica' }),
    )
    expect(mockSelectItem).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('disables Previous on page 1 and enables Next when hasNextPage is true', () => {
    render(<LoraWorkbench />)

    expect(
      screen.getByRole('button', { name: /LoraWorkbench:communityPrevious/ }),
    ).toBeDisabled()
    const nextButton = screen.getByRole('button', {
      name: /LoraWorkbench:communityNext/,
    })
    expect(nextButton).not.toBeDisabled()

    fireEvent.click(nextButton)
    expect(mockNextPage).toHaveBeenCalledTimes(1)
  })

  it('disables Next when hasNextPage is false', () => {
    mockLibraryPage = 2
    mockLibraryHasNextPage = false

    render(<LoraWorkbench />)

    expect(
      screen.getByRole('button', { name: /LoraWorkbench:communityNext/ }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: /LoraWorkbench:communityPrevious/ }),
    ).not.toBeDisabled()
  })
})
