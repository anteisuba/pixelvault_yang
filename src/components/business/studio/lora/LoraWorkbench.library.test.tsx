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
const mockSetSearch = vi.hoisted(() => vi.fn())
const mockSetSort = vi.hoisted(() => vi.fn())
const mockSetBaseModel = vi.hoisted(() => vi.fn())
const mockSetNsfwFilter = vi.hoisted(() => vi.fn())
const mockUseCivitaiLoraLibrary = vi.hoisted(() => vi.fn())

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
  useCivitaiLoraLibrary: mockUseCivitaiLoraLibrary,
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
    mockLibraryQuery = ''
    mockFavoriteCivitaiLora.mockReset()
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
      isRevalidating: false,
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
      setSearch: mockSetSearch,
      setSort: mockSetSort,
      setBaseModel: mockSetBaseModel,
      setNsfwFilter: mockSetNsfwFilter,
      selectItem: mockSelectItem,
      nextPage: mockNextPage,
      previousPage: mockPreviousPage,
      refresh: vi.fn(),
    }))
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
      setSearch: mockSetSearch,
      setSort: mockSetSort,
      setBaseModel: mockSetBaseModel,
      setNsfwFilter: mockSetNsfwFilter,
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
      setSearch: mockSetSearch,
      setSort: mockSetSort,
      setBaseModel: mockSetBaseModel,
      setNsfwFilter: mockSetNsfwFilter,
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

// B7 form-batch card visuals: P2-1 (external family badge unified to the
// black nacre, no amber solid) + P1-9 (touch hit-area expansion classes on
// the favorite heart and family chips). The exact ≥44px measurement is a
// visual/Playwright concern; these are cheap regression guards against a
// revert of the intentional classes.
describe('LoraWorkbench CivitaiCommunityBranch — B7 card visuals', () => {
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
    // Pony is an external (non-generatable) family — used to prove the badge
    // is NOT amber for external items.
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
      setSearch: mockSetSearch,
      setSort: mockSetSort,
      setBaseModel: mockSetBaseModel,
      setNsfwFilter: mockSetNsfwFilter,
      selectItem: mockSelectItem,
      nextPage: mockNextPage,
      previousPage: mockPreviousPage,
      refresh: vi.fn(),
    }))
  })

  it('P2-1: external family badge uses the black nacre, never an amber solid', () => {
    render(<LoraWorkbench />)

    // "Pony" also appears as a filter chip (a <button role=radio>); the card
    // badge is the <span> overlay — pick that one.
    const badge = screen
      .getAllByText('Pony')
      .find((el) => el.tagName === 'SPAN')
    expect(badge).toBeDefined()
    expect(badge?.className).toContain('bg-black/55')
    expect(badge?.className).not.toContain('amber')
  })

  it('P1-9: favorite heart carries the touch (coarse) hit-area expansion', () => {
    render(<LoraWorkbench />)

    const heart = screen.getByRole('button', { name: 'LoraWorkbench:favorite' })
    expect(heart.className).toContain('coarse:before:')
  })

  it('P1-9: family filter chips carry the touch (coarse) hit-area expansion', () => {
    render(<LoraWorkbench />)

    const allChip = screen.getByRole('radio', {
      name: 'LoraWorkbench:baseModelFilterAll',
    })
    expect(allChip.className).toContain('coarse:before:')
  })
})
