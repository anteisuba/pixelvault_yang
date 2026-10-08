import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { GalleryFeed } from '@/components/business/GalleryFeed'
import { useGallery, type GalleryFilters } from '@/hooks/use-gallery'
import { FAKE_GENERATION } from '@/test/api-helpers'
import type { GenerationRecord } from '@/types'

vi.mock('@/hooks/use-gallery', () => ({
  useGallery: vi.fn(),
}))

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isSignedIn: true }),
}))

vi.mock('@/i18n/navigation', () => ({
  Link: ({
    children,
    href,
    ...props
  }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  useRouter: () => ({ push: vi.fn() }),
}))

const mockUseGallery = vi.mocked(useGallery)

const DEFAULT_FILTERS: GalleryFilters = {
  search: '',
  models: [],
  sort: 'newest',
  types: [],
  timeRange: 'all',
  liked: false,
  published: false,
  projectId: '',
  provider: '',
}

const MESSAGES = {
  GalleryPage: {
    feedEyebrow: 'Public gallery',
    feedTitle: 'Recent public works',
    feedDescription: 'Browse the public archive.',
    feedCount: '{shown} of {total}',
    emptyTitle: 'No works yet',
    emptyDescription: 'Nothing matches this view.',
    emptyAction: 'Create',
    feedLabel: 'Gallery feed',
    itemFallbackLabel: 'Untitled generation',
    loadMore: 'Load more',
    filters: {
      tabs: {
        favorites: 'Liked',
      },
      searchLabel: 'Search',
      searchPlaceholder: 'Search prompts',
      clearSearch: 'Clear search',
      signInToFavorite: 'Sign in to view favorites',
    },
    viewer: {
      label: 'Gallery viewer',
      close: 'Close viewer',
      thumb: 'Image {n}',
      previous: 'Previous image',
      next: 'Next image',
      remix: 'Recreate',
      more: 'More',
      promptPrivate: 'Private',
      negative: 'Negative',
      publishedAt: 'Published',
      copy: 'Copy',
      copied: 'Copied',
      copyFailed: "Couldn't copy",
      expand: 'Show all',
      collapse: 'Show less',
      openOriginal: 'Open original',
      linkCopied: 'Link copied',
      references: 'References used',
      referenceAlt: 'Reference {n}',
    },
  },
  AssetsPage: {
    sidebarFavorites: 'Favorites',
    sidebarPublished: 'Published',
    sidebarUploads: 'Uploads',
    sidebarModel3D: '3D',
    sidebarImages: 'Images',
    sidebarVideos: 'Videos',
    sidebarAudio: 'Audio',
    facetType: 'Type',
    facetStatus: 'Status',
    facetModel: 'Model',
    facetTime: 'Time',
    facetSort: 'Sort',
    facetSelectedCount: '{name} {count}',
    facetClearAll: 'Clear all filters',
    facetRemove: 'Remove filter “{name}”',
    facetModelSearch: 'Search models',
    facetModelEmpty: 'No matching model',
    facetTimeToday: 'Today',
    facetTimeWeek: '7 days',
    facetTimeMonth: '30 days',
    facetTimeYear: 'This year',
    facetSortNewest: 'Newest',
    facetSortOldest: 'Oldest',
  },
  GalleryCard: {
    openImage: 'Open image',
    openVideo: 'Open video',
    like: 'Like',
    unlike: 'Unlike',
    download: 'Download',
    creatorProfileLabel: 'View {name} profile',
    referenceImageLabel: 'Reference',
    modelLabel: 'Model',
  },
  ImageDetail: {
    title: 'Details',
    promptLabel: 'Prompt',
    dimensionsLabel: 'Size',
    shareLink: 'Share',
    shareFailed: 'Share failed',
    savePromptTemplate: 'Save as template',
    download: 'Download',
    downloading: 'Downloading',
    downloadFailed: 'Download failed',
    copyPrompt: 'Copy prompt',
  },
  Models: {},
  Errors: {},
  Feedback: {
    slowLoading: 'Slow connection — still loading',
    batchFailed: "Couldn't load this batch",
    retry: 'Retry',
    retrying: 'Retrying',
    loadingMore: 'Loading more',
    endOfList: "That's everything",
    pageLoadFailedHint: 'Nothing will be lost.',
  },
}

function work(id: string): GenerationRecord {
  return {
    ...FAKE_GENERATION,
    id,
    prompt: `prompt of ${id}`,
    isPromptPublic: true,
    model: 'someone-elses-model',
    likeCount: 0,
    isLiked: false,
  } as GenerationRecord
}

function renderFeed() {
  return render(
    // 模型目录的名字不在这份假消息里：缺的消息退回 key，不刷屏。
    <NextIntlClientProvider locale="en" messages={MESSAGES} onError={() => {}}>
      <GalleryFeed
        initialGenerations={[]}
        initialPage={1}
        initialHasMore={false}
        initialNextCursor={null}
        total={0}
        initialFilters={DEFAULT_FILTERS}
      />
    </NextIntlClientProvider>,
  )
}

function mockGalleryState(
  overrides: Partial<ReturnType<typeof useGallery>> = {},
) {
  const setFilters = vi.fn()
  mockUseGallery.mockReturnValue({
    generations: [],
    total: 0,
    isLoading: false,
    hasLoaded: true,
    hasMore: false,
    error: null,
    appendError: null,
    retry: vi.fn(),
    retryLoadMore: vi.fn(),
    filters: DEFAULT_FILTERS,
    setFilters,
    loadMore: vi.fn(),
    sentinelRef: { current: null },
    removeGeneration: vi.fn(),
    removeGenerations: vi.fn(),
    prependGeneration: vi.fn(),
    insertGeneration: vi.fn(),
    updateGeneration: vi.fn(),
    ...overrides,
  })
  return { setFilters }
}

describe('GalleryFeed', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.history.pushState(null, '', '/zh/gallery')
    // jsdom 没有这两个 API：瀑布流量列宽、缩略轨把当前那一张滚到中间用的。
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    Element.prototype.scrollIntoView = vi.fn()
  })

  it('shows still gray blocks (not the empty state) while a filter switch loads', () => {
    mockGalleryState({ generations: [], isLoading: true })

    renderFeed()

    const skeleton = screen.getByTestId('gallery-skeleton')
    expect(skeleton.querySelector('.animate-pulse')).toBeNull()
    expect(screen.queryByText('No works yet')).not.toBeInTheDocument()
  })

  it('uses the unified error template when the whole page fails', () => {
    const retry = vi.fn()
    mockGalleryState({ generations: [], error: 'Load failed', retry })

    renderFeed()

    expect(screen.getByTestId('empty-state-error-dot')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('appends gray blocks while scrolling, one line on a failed batch, and an end note', () => {
    mockGalleryState({
      generations: [work('a')],
      isLoading: true,
      hasMore: true,
    })
    const { unmount } = renderFeed()
    expect(screen.getByTestId('feed-tail-loading')).toBeInTheDocument()
    unmount()

    const retryLoadMore = vi.fn()
    mockGalleryState({
      generations: [work('a')],
      hasMore: true,
      appendError: 'boom',
      retryLoadMore,
    })
    const second = renderFeed()
    expect(screen.getByRole('alert')).toHaveTextContent(
      "Couldn't load this batch",
    )
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(retryLoadMore).toHaveBeenCalledTimes(1)
    second.unmount()

    mockGalleryState({ generations: [work('a')], hasMore: false })
    renderFeed()
    expect(screen.getByText("That's everything")).toBeInTheDocument()
  })

  it('renders a single public gallery heading', () => {
    mockGalleryState()

    renderFeed()

    expect(
      screen.getByRole('heading', { level: 1, name: 'Public gallery' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Recent public works')).not.toBeInTheDocument()
    expect(
      screen.queryByText('Browse the public archive.'),
    ).not.toBeInTheDocument()
  })

  it('syncs filter changes into the current URL', () => {
    const { setFilters } = mockGalleryState()
    const replaceState = vi.spyOn(window.history, 'replaceState')

    renderFeed()

    fireEvent.click(screen.getByRole('button', { name: 'Type' }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Videos/ }))

    expect(replaceState).toHaveBeenCalledWith(
      window.history.state,
      '',
      '/zh/gallery?type=video',
    )
    expect(setFilters).toHaveBeenCalledWith({
      ...DEFAULT_FILTERS,
      types: ['video'],
      models: [],
    })
  })

  it('keeps clear-all available when an active filter has no results', () => {
    const { setFilters } = mockGalleryState({
      generations: [],
      total: 0,
      filters: { ...DEFAULT_FILTERS, search: 'cat' },
    })
    const replaceState = vi.spyOn(window.history, 'replaceState')

    renderFeed()

    expect(screen.getByText('No works yet')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear all filters' }))

    expect(replaceState).toHaveBeenCalledWith(
      window.history.state,
      '',
      '/zh/gallery',
    )
    expect(setFilters).toHaveBeenCalledWith(DEFAULT_FILTERS)
  })

  it('opens a card in place and holds the page still until it closes', () => {
    const { setFilters } = mockGalleryState({
      generations: [work('a'), work('b')],
      total: 2,
    })

    renderFeed()

    fireEvent.click(screen.getAllByRole('button', { name: 'Open image' })[0])

    expect(
      screen.getByRole('dialog', { name: 'Gallery viewer' }),
    ).toBeInTheDocument()
    expect(screen.getByText('prompt of a')).toBeInTheDocument()
    expect(document.documentElement.style.overflow).toBe('hidden')

    // 换筛选就把查看器放下，页面重新能滚。
    fireEvent.click(screen.getByRole('button', { name: 'Liked' }))
    expect(setFilters).toHaveBeenCalledWith({ ...DEFAULT_FILTERS, liked: true })
    expect(
      screen.queryByRole('dialog', { name: 'Gallery viewer' }),
    ).not.toBeInTheDocument()
    expect(document.documentElement.style.overflow).toBe('')
  })
})
