import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CivitaiLoraLibraryItem } from '@/types'

import { LoraWorkbench } from './LoraWorkbench'

// ── 库模块重做（lora-domain-wireframes.md §4）：公开库从行列表 + 常驻
// 详情栏改成封面网格 + 按需 Sheet/Drawer。这个文件之前完全没有测试基础
// 设施（Clerk auth / civitai 库数据 / 搜索历史都要重新搭 mock），这里第一
// 次搭起来，覆盖：网格渲染、点卡开详情、收藏切换、分页按钮状态。

const mockFavoriteCivitaiLora = vi.hoisted(() => vi.fn())
const mockFavoriteExternalLora = vi.hoisted(() => vi.fn())
const mockUnfavoriteByUrl = vi.hoisted(() => vi.fn())
const mockStackPush = vi.hoisted(() => vi.fn())
const mockNextPage = vi.hoisted(() => vi.fn())
const mockPreviousPage = vi.hoisted(() => vi.fn())
const mockSelectItem = vi.hoisted(() => vi.fn())
const mockSetSearch = vi.hoisted(() => vi.fn())
const mockSetSort = vi.hoisted(() => vi.fn())
const mockSetBaseModel = vi.hoisted(() => vi.fn())
const mockSetNsfwFilter = vi.hoisted(() => vi.fn())
const mockSetContentType = vi.hoisted(() => vi.fn())
const mockUseCivitaiLoraLibrary = vi.hoisted(() => vi.fn())
const mockUseHuggingFaceLoraLibrary = vi.hoisted(() => vi.fn())

let mockSection = 'community'
// P1-5 深链测试用：family/q/sort/nsfw 查询串（不含 `section=`，由下面拼接）。
let mockLibraryQuery = ''
let mockFavoritedUrls = new Set<string>()
let mockLibraryItems: CivitaiLoraLibraryItem[] = []
let mockLibraryPage = 1
let mockLibraryHasNextPage = false
let mockLibrarySearch = ''
let mockLibraryDebouncedSearch = ''
let mockLibrarySort = 'Highest Rated'
let mockLibraryBaseModel = 'all'
let mockLibraryNsfwFilter = 'unrestricted'
let mockLibraryIsRevalidating = false

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
  useSearchParams: () =>
    new URLSearchParams(
      [`section=${mockSection}`, mockLibraryQuery].filter(Boolean).join('&'),
    ),
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
    favoriteExternalLora: mockFavoriteExternalLora,
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
    recipes: [],
    previewImages: [],
    descriptionText: null,
    totalSampled: 0,
    isLoading: false,
    hasFetched: false,
    error: null,
  }),
}))

vi.mock('@/hooks/prompts/use-civitai-model-description', () => ({
  useCivitaiModelDescription: () => ({
    descriptionText: null,
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
  useCivitaiLoraLibrary: mockUseCivitaiLoraLibrary,
}))

vi.mock('@/hooks/use-huggingface-lora-library', () => ({
  useHuggingFaceLoraLibrary: mockUseHuggingFaceLoraLibrary,
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

describe('LoraWorkbench CivitaiCommunityBranch — single-column flow + in-place detail', () => {
  beforeEach(() => {
    mockSection = 'community'
    mockLibraryQuery = ''
    mockFavoriteCivitaiLora.mockReset()
    mockFavoriteExternalLora.mockReset()
    mockUnfavoriteByUrl.mockReset()
    mockStackPush.mockReset()
    mockSelectItem.mockReset()
    mockNextPage.mockReset()
    mockPreviousPage.mockReset()
    mockSetSearch.mockReset()
    mockSetSort.mockReset()
    mockSetBaseModel.mockReset()
    mockSetNsfwFilter.mockReset()
    mockUseCivitaiLoraLibrary.mockReset()
    mockUseHuggingFaceLoraLibrary.mockReset()
    mockUseHuggingFaceLoraLibrary.mockReturnValue({
      items: [],
      search: '',
      debouncedSearch: '',
      baseModelFamily: 'all',
      sort: 'downloads',
      contentType: 'all',
      total: null,
      page: 1,
      hasNextPage: false,
      isLoading: false,
      isRevalidating: false,
      error: null,
      setSearch: vi.fn(),
      setBaseModelFamily: vi.fn(),
      setSort: vi.fn(),
      setContentType: mockSetContentType,
      nextPage: vi.fn(),
      previousPage: vi.fn(),
      refresh: vi.fn(),
    })
    mockFavoritedUrls = new Set()
    mockLibraryItems = [
      makeLibraryItem({ id: '1', name: 'Perlica' }),
      makeLibraryItem({ id: '2', name: 'Detail Tweaker' }),
    ]
    mockLibraryPage = 1
    mockLibraryHasNextPage = true
    mockLibrarySearch = ''
    mockLibraryDebouncedSearch = ''
    mockLibrarySort = 'Highest Rated'
    mockLibraryBaseModel = 'all'
    mockLibraryNsfwFilter = 'unrestricted'
    mockLibraryIsRevalidating = false
    mockUseCivitaiLoraLibrary.mockImplementation(() => ({
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
      get isRevalidating() {
        return mockLibraryIsRevalidating
      },
      error: null,
      get search() {
        return mockLibrarySearch
      },
      get debouncedSearch() {
        return mockLibraryDebouncedSearch
      },
      get sort() {
        return mockLibrarySort
      },
      get baseModel() {
        return mockLibraryBaseModel
      },
      get nsfwFilter() {
        return mockLibraryNsfwFilter
      },
      contentType: 'all',
      setSearch: mockSetSearch,
      setSort: mockSetSort,
      setBaseModel: mockSetBaseModel,
      setNsfwFilter: mockSetNsfwFilter,
      setContentType: mockSetContentType,
      selectItem: mockSelectItem,
      nextPage: mockNextPage,
      previousPage: mockPreviousPage,
      refresh: vi.fn(),
    }))
  })

  it('renders one collapsed row per library item (not a cover grid)', () => {
    render(<LoraWorkbench />)

    // Each item is a single expandable row button keyed by name.
    expect(screen.getByRole('button', { name: 'Perlica' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    expect(
      screen.getByRole('button', { name: 'Detail Tweaker' }),
    ).toHaveAttribute('aria-expanded', 'false')
    // Collapsed rows do NOT carry the favorite action — that lives in the
    // in-place expanded detail only (confirmed Library key slice).
    expect(
      screen.queryByRole('button', { name: 'LoraWorkbench:favorite' }),
    ).not.toBeInTheDocument()
  })

  it('switches the public library to Hugging Face when source=huggingface is in the URL', () => {
    mockLibraryQuery = 'source=huggingface'
    render(<LoraWorkbench />)

    // Source is a dropdown now (not a tab). The HF search input (portaled into
    // the shared top-bar slot) is the deterministic signal the HF pane rendered.
    expect(
      screen.getByRole('textbox', {
        name: 'LoraWorkbench:huggingFaceSearchPlaceholder',
      }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Perlica')).not.toBeInTheDocument()
  })

  it('expands the detail in place when a row is clicked — no dialog, no jump', () => {
    render(<LoraWorkbench />)

    // Nothing is expanded and no dialog exists before interaction.
    expect(
      screen.queryByRole('button', { name: 'LoraWorkbench:useThisLora' }),
    ).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Perlica' }))

    expect(mockSelectItem).toHaveBeenCalledWith(
      expect.objectContaining({ id: '1', name: 'Perlica' }),
    )
    // In-place detail exposes the three confirmed actions; it is NOT a dialog.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'LoraWorkbench:useThisLora' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'LoraWorkbench:collapseDetail' }),
    ).toBeInTheDocument()
  })

  it('favorites from the expanded detail (favorite is not on the collapsed row)', () => {
    render(<LoraWorkbench />)

    // Expand the selected item's detail first (mock selectedItem === item 1).
    fireEvent.click(screen.getByRole('button', { name: 'Perlica' }))

    const favoriteButton = screen.getByRole('button', {
      name: 'LoraWorkbench:favorite',
    })
    fireEvent.click(favoriteButton)

    expect(mockFavoriteCivitaiLora).toHaveBeenCalledTimes(1)
    expect(mockFavoriteCivitaiLora).toHaveBeenCalledWith(
      expect.objectContaining({ id: '1', name: 'Perlica' }),
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('collapses the expanded detail back to a row', async () => {
    render(<LoraWorkbench />)

    fireEvent.click(screen.getByRole('button', { name: 'Perlica' }))
    expect(
      screen.getByRole('button', { name: 'LoraWorkbench:useThisLora' }),
    ).toBeInTheDocument()

    // Collapse plays a height transition, then unmounts the detail
    // (LoraLibraryDetailReveal keeps it mounted until the transition/fallback
    // completes so the row doesn't flash in over the shrinking detail).
    fireEvent.click(
      screen.getByRole('button', { name: 'LoraWorkbench:collapseDetail' }),
    )
    // The detail unmounts after the collapse transition's fallback timer
    // (~340ms); allow generous headroom so a loaded CI box (timers starved by
    // a concurrent typecheck etc.) doesn't flake this.
    await waitFor(
      () =>
        expect(
          screen.queryByRole('button', { name: 'LoraWorkbench:useThisLora' }),
        ).not.toBeInTheDocument(),
      { timeout: 3000 },
    )
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

  it('disables pagination while the community library is revalidating', () => {
    mockLibraryPage = 2
    mockLibraryHasNextPage = true
    mockLibraryIsRevalidating = true

    render(<LoraWorkbench />)

    expect(
      screen.getByRole('button', { name: /LoraWorkbench:communityPrevious/ }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: /LoraWorkbench:communityNext/ }),
    ).toBeDisabled()
  })
})

describe('LoraWorkbench CivitaiCommunityBranch — P1-5 URL deep link', () => {
  beforeEach(() => {
    mockSection = 'community'
    mockLibraryQuery = ''
    mockUseCivitaiLoraLibrary.mockReset()
    mockFavoritedUrls = new Set()
    mockLibraryItems = []
    mockLibraryPage = 1
    mockLibraryHasNextPage = false
    mockLibrarySearch = ''
    mockLibraryDebouncedSearch = ''
    mockLibrarySort = 'Highest Rated'
    mockLibraryBaseModel = 'all'
    mockLibraryNsfwFilter = 'unrestricted'
    mockLibraryIsRevalidating = false
    mockUseCivitaiLoraLibrary.mockImplementation(() => ({
      items: mockLibraryItems,
      selectedItem: null,
      total: 0,
      page: mockLibraryPage,
      pageSize: 24,
      hasNextPage: mockLibraryHasNextPage,
      isLoading: false,
      isRevalidating: false,
      error: null,
      search: mockLibrarySearch,
      debouncedSearch: mockLibraryDebouncedSearch,
      sort: mockLibrarySort,
      baseModel: mockLibraryBaseModel,
      nsfwFilter: mockLibraryNsfwFilter,
      contentType: 'all',
      setSearch: mockSetSearch,
      setSort: mockSetSort,
      setBaseModel: mockSetBaseModel,
      setNsfwFilter: mockSetNsfwFilter,
      setContentType: mockSetContentType,
      selectItem: mockSelectItem,
      nextPage: mockNextPage,
      previousPage: mockPreviousPage,
      refresh: vi.fn(),
    }))
  })

  it('parses family/q/sort/nsfw off the URL into the hook initial seed', () => {
    mockLibraryQuery = 'family=Illustrious&q=detail&sort=Newest&nsfw=nsfwOnly'

    render(<LoraWorkbench />)

    expect(mockUseCivitaiLoraLibrary).toHaveBeenCalledWith(
      expect.objectContaining({
        initialBaseModel: 'Illustrious',
        initialSort: 'Newest',
        initialSearch: 'detail',
        initialNsfwFilter: 'nsfwOnly',
      }),
    )
  })

  it('falls back to defaults for unknown/invalid query values instead of leaking them', () => {
    mockLibraryQuery = 'family=not-a-real-family&sort=also-bogus&nsfw=yes'

    render(<LoraWorkbench />)

    expect(mockUseCivitaiLoraLibrary).toHaveBeenCalledWith(
      expect.objectContaining({
        initialBaseModel: undefined,
        initialSort: undefined,
        initialNsfwFilter: undefined,
      }),
    )
  })
})

describe('LoraWorkbench CivitaiCommunityBranch — P1-6 NSFW toggle + P2-6 clear filters', () => {
  beforeEach(() => {
    mockSection = 'community'
    mockLibraryQuery = ''
    mockSetSearch.mockReset()
    mockSetSort.mockReset()
    mockSetBaseModel.mockReset()
    mockSetNsfwFilter.mockReset()
    mockUseCivitaiLoraLibrary.mockReset()
    mockFavoritedUrls = new Set()
    mockLibraryPage = 1
    mockLibraryHasNextPage = false
    mockLibrarySearch = ''
    mockLibraryDebouncedSearch = ''
    mockLibrarySort = 'Highest Rated'
    mockLibraryBaseModel = 'all'
    mockLibraryNsfwFilter = 'safe'
    mockLibraryItems = []
  })

  function mockLibraryReturn() {
    return {
      items: mockLibraryItems,
      selectedItem: mockLibraryItems[0] ?? null,
      total: mockLibraryItems.length,
      page: mockLibraryPage,
      pageSize: 24,
      hasNextPage: mockLibraryHasNextPage,
      isLoading: false,
      isRevalidating: false,
      error: null,
      search: mockLibrarySearch,
      debouncedSearch: mockLibraryDebouncedSearch,
      sort: mockLibrarySort,
      baseModel: mockLibraryBaseModel,
      nsfwFilter: mockLibraryNsfwFilter,
      contentType: 'all',
      setSearch: mockSetSearch,
      setSort: mockSetSort,
      setBaseModel: mockSetBaseModel,
      setNsfwFilter: mockSetNsfwFilter,
      setContentType: mockSetContentType,
      selectItem: mockSelectItem,
      nextPage: mockNextPage,
      previousPage: mockPreviousPage,
      refresh: vi.fn(),
    }
  }

  // P1-6 三态循环：unrestricted → nsfwOnly → safe → unrestricted（默认从 safe 起步）。
  it('cycles unrestricted → nsfwOnly on click, showing the unrestricted label', () => {
    mockLibraryNsfwFilter = 'unrestricted'
    mockUseCivitaiLoraLibrary.mockImplementation(mockLibraryReturn)

    render(<LoraWorkbench />)

    const toggle = screen.getByRole('button', {
      name: /LoraWorkbench:nsfwToggleHint/,
    })
    expect(
      within(toggle).getByText('LoraWorkbench:nsfwFilterUnrestricted'),
    ).toBeInTheDocument()

    fireEvent.click(toggle)
    expect(mockSetNsfwFilter).toHaveBeenCalledWith('nsfwOnly')
  })

  it('cycles nsfwOnly → safe on click, showing the nsfwOnly label', () => {
    mockLibraryNsfwFilter = 'nsfwOnly'
    mockUseCivitaiLoraLibrary.mockImplementation(mockLibraryReturn)

    render(<LoraWorkbench />)

    const toggle = screen.getByRole('button', {
      name: /LoraWorkbench:nsfwToggleHint/,
    })
    expect(
      within(toggle).getByText('LoraWorkbench:nsfwFilterNsfwOnly'),
    ).toBeInTheDocument()

    fireEvent.click(toggle)
    expect(mockSetNsfwFilter).toHaveBeenCalledWith('safe')
  })

  it('cycles safe → unrestricted on click, showing the safe label', () => {
    mockLibraryNsfwFilter = 'safe'
    mockUseCivitaiLoraLibrary.mockImplementation(mockLibraryReturn)

    render(<LoraWorkbench />)

    const toggle = screen.getByRole('button', {
      name: /LoraWorkbench:nsfwToggleHint/,
    })
    expect(
      within(toggle).getByText('LoraWorkbench:nsfwFilterSafe'),
    ).toBeInTheDocument()

    fireEvent.click(toggle)
    expect(mockSetNsfwFilter).toHaveBeenCalledWith('unrestricted')
  })

  it('shows a clear-filters action in the empty state only when a filter is active, and resets on click', () => {
    mockLibraryBaseModel = 'Illustrious'
    mockUseCivitaiLoraLibrary.mockImplementation(mockLibraryReturn)

    render(<LoraWorkbench />)

    const clearButton = screen.getByRole('button', {
      name: 'LoraWorkbench:clearFilters',
    })
    fireEvent.click(clearButton)

    expect(mockSetBaseModel).toHaveBeenCalledWith('all')
    expect(mockSetSearch).toHaveBeenCalledWith('')
    expect(mockSetNsfwFilter).toHaveBeenCalledWith('safe')
  })

  it('hides the clear-filters action when no filter is active', () => {
    mockUseCivitaiLoraLibrary.mockImplementation(mockLibraryReturn)

    render(<LoraWorkbench />)

    expect(
      screen.queryByRole('button', { name: 'LoraWorkbench:clearFilters' }),
    ).not.toBeInTheDocument()
  })
})

// R1 单列行视觉：未展开行显示序号 + 名称 + 家族标 + 源，external 家族
// （Pony）行照常渲染、不崩，且行内不带收藏心（收藏在展开详情里）。
describe('LoraWorkbench CivitaiCommunityBranch — single-column row visuals', () => {
  beforeEach(() => {
    mockSection = 'community'
    mockLibraryQuery = ''
    mockUseCivitaiLoraLibrary.mockReset()
    mockFavoritedUrls = new Set()
    mockLibraryPage = 1
    mockLibraryHasNextPage = false
    mockLibrarySearch = ''
    mockLibraryDebouncedSearch = ''
    mockLibrarySort = 'Highest Rated'
    mockLibraryBaseModel = 'all'
    mockLibraryNsfwFilter = 'unrestricted'
    // Pony is an external (non-generatable) family.
    mockLibraryItems = [
      makeLibraryItem({
        id: 'ext-1',
        name: 'Pony Card',
        baseModelFamily: 'Pony',
      }),
    ]
    mockUseCivitaiLoraLibrary.mockImplementation(() => ({
      items: mockLibraryItems,
      selectedItem: null,
      total: mockLibraryItems.length,
      page: mockLibraryPage,
      pageSize: 24,
      hasNextPage: mockLibraryHasNextPage,
      isLoading: false,
      isRevalidating: false,
      error: null,
      search: mockLibrarySearch,
      debouncedSearch: mockLibraryDebouncedSearch,
      sort: mockLibrarySort,
      baseModel: mockLibraryBaseModel,
      nsfwFilter: mockLibraryNsfwFilter,
      contentType: 'all',
      setSearch: mockSetSearch,
      setSort: mockSetSort,
      setBaseModel: mockSetBaseModel,
      setNsfwFilter: mockSetNsfwFilter,
      setContentType: mockSetContentType,
      selectItem: mockSelectItem,
      nextPage: mockNextPage,
      previousPage: mockPreviousPage,
      refresh: vi.fn(),
    }))
  })

  it('renders an external-family row as a collapsed expandable row', () => {
    render(<LoraWorkbench />)

    const row = screen.getByRole('button', { name: 'Pony Card' })
    expect(row).toHaveAttribute('aria-expanded', 'false')
    // Family label shown verbatim on the row.
    expect(within(row).getByText('Pony')).toBeInTheDocument()
  })

  it('keeps the favorite action off the collapsed row', () => {
    render(<LoraWorkbench />)

    expect(
      screen.queryByRole('button', { name: 'LoraWorkbench:favorite' }),
    ).not.toBeInTheDocument()
  })

  it('surfaces the type and base-model filters as dropdown triggers', () => {
    render(<LoraWorkbench />)

    expect(
      screen.getByRole('button', {
        name: /LoraWorkbench:typeFilterLabel/,
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', {
        name: /LoraWorkbench:baseModelFilterLabel/,
      }),
    ).toBeInTheDocument()
  })
})
