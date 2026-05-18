import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { GalleryFeed } from '@/components/business/GalleryFeed'
import { useGallery, type GalleryFilters } from '@/hooks/use-gallery'

vi.mock('@/hooks/use-gallery', () => ({
  useGallery: vi.fn(),
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
}))

const mockUseGallery = vi.mocked(useGallery)

const DEFAULT_FILTERS: GalleryFilters = {
  search: '',
  model: '',
  sort: 'newest',
  type: 'all',
  timeRange: 'all',
  liked: false,
  published: false,
  projectId: '',
  provider: '',
}

const MESSAGES = {
  GalleryPage: {
    feedDescription: 'Browse the public archive.',
    feedCount: '{shown} of {total}',
    emptyTitle: 'No works yet',
    emptyDescription: 'Nothing matches this view.',
    emptyAction: 'Create',
    feedLabel: 'Gallery feed',
    itemFallbackLabel: 'Untitled generation',
    loadingMore: 'Loading more',
    loadMore: 'Load more',
    endOfArchive: 'End of archive',
    filters: {
      sort: {
        newest: 'Newest',
        oldest: 'Oldest',
      },
      type: {
        all: 'All',
        image: 'Image',
        video: 'Video',
        audio: 'Audio',
        model_3d: '3D',
      },
      tabs: {
        all: 'All',
        today: 'Today',
        favorites: 'Favorites',
      },
      searchLabel: 'Search',
      searchPlaceholder: 'Search prompts',
      clearFilters: 'Clear filters',
      modelPlaceholder: 'Model',
      allModels: 'All models',
      signInToFavorite: 'Sign in to view favorites',
    },
  },
}

function renderFeed() {
  return render(
    <NextIntlClientProvider locale="en" messages={MESSAGES}>
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
    hasMore: false,
    error: null,
    filters: DEFAULT_FILTERS,
    setFilters,
    loadMore: vi.fn(),
    sentinelRef: { current: null },
    removeGeneration: vi.fn(),
    removeGenerations: vi.fn(),
    prependGeneration: vi.fn(),
    updateGeneration: vi.fn(),
    ...overrides,
  })
  return { setFilters }
}

describe('GalleryFeed', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.history.pushState(null, '', '/zh/gallery')
  })

  it('syncs filter changes into the current URL', () => {
    const { setFilters } = mockGalleryState()
    const replaceState = vi.spyOn(window.history, 'replaceState')

    renderFeed()

    fireEvent.click(screen.getByRole('button', { name: 'Video' }))

    expect(replaceState).toHaveBeenCalledWith(
      window.history.state,
      '',
      '/zh/gallery?type=video',
    )
    expect(setFilters).toHaveBeenCalledWith({
      ...DEFAULT_FILTERS,
      type: 'video',
      model: '',
    })
  })

  it('keeps clear filters available when an active filter has no results', () => {
    const { setFilters } = mockGalleryState({
      generations: [],
      total: 0,
      filters: { ...DEFAULT_FILTERS, search: 'cat' },
    })
    const replaceState = vi.spyOn(window.history, 'replaceState')

    renderFeed()

    expect(screen.getByText('No works yet')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))

    expect(replaceState).toHaveBeenCalledWith(
      window.history.state,
      '',
      '/zh/gallery',
    )
    expect(setFilters).toHaveBeenCalledWith({
      search: '',
      model: '',
      sort: 'newest',
      type: 'all',
      timeRange: 'all',
      liked: false,
      published: false,
      projectId: '',
    })
  })
})
