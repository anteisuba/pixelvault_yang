import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { useRef } from 'react'

// ─── Mocks ──────────────────────────────────────────────────────

const mockRemoveGeneration = vi.fn()
const mockRemoveGenerations = vi.fn()
const mockSetFilters = vi.fn()
const mockLoadMore = vi.fn()

vi.mock('@/hooks/use-gallery', () => ({
  useGallery: vi.fn(() => ({
    generations: [
      {
        id: 'gen_1',
        url: 'https://r2.example.com/1.png',
        prompt: 'sunset',
        width: 512,
        height: 512,
        outputType: 'IMAGE',
        isPublic: true,
        isPromptPublic: true,
      },
      {
        id: 'gen_2',
        url: 'https://r2.example.com/2.png',
        prompt: 'mountain',
        width: 512,
        height: 512,
        outputType: 'IMAGE',
        isPublic: false,
        isPromptPublic: false,
      },
    ],
    total: 2,
    isLoading: false,
    hasMore: false,
    error: null,
    filters: { search: '', sort: 'newest' },
    setFilters: mockSetFilters,
    loadMore: mockLoadMore,
    sentinelRef: { current: null },
    removeGeneration: mockRemoveGeneration,
    removeGenerations: mockRemoveGenerations,
  })),
}))

vi.mock('@/lib/api-client', () => ({
  batchDeleteGenerationsAPI: vi.fn(),
  batchUpdateVisibilityAPI: vi.fn(),
  deleteGenerationAPI: vi.fn(),
}))

vi.mock('@/lib/gallery-query', () => ({
  buildGalleryQueryString: vi.fn(() => ''),
}))

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ refresh: vi.fn() })),
}))

// Simplify child components
vi.mock('@/components/business/GalleryFilterBar', () => ({
  GalleryFilterBar: () => <div data-testid="filter-bar" />,
}))

vi.mock('@/components/business/GalleryGrid', () => ({
  GalleryGrid: () => <div data-testid="gallery-grid" />,
}))

import { ProfileFeed } from '@/components/business/ProfileFeed'
import {
  batchDeleteGenerationsAPI,
  batchUpdateVisibilityAPI,
} from '@/lib/api-client'

const mockBatchDelete = vi.mocked(batchDeleteGenerationsAPI)
const mockBatchVisibility = vi.mocked(batchUpdateVisibilityAPI)

// ─── Fixtures ───────────────────────────────────────────────────

const MESSAGES = {
  LibraryPage: {
    collectionDescription: 'Your archive',
    collectionCount: '{shown} of {total}',
    selectMode: 'Select',
    cancelSelect: 'Cancel',
    selectedCount: '{count} selected',
    batchMakePublic: 'Make Public',
    batchMakePrivate: 'Make Private',
    batchDelete: 'Delete',
    batchDeleteConfirmTitle: 'Delete {count} items?',
    batchDeleteConfirmDescription: 'This cannot be undone.',
    batchSuccess: 'Done!',
    batchFailed: 'Operation failed',
    emptyTitle: 'No images',
    emptyDescription: 'Start creating',
    emptyAction: 'Go to Studio',
    loadMore: 'Load More',
    loadingMore: 'Loading...',
    endOfArchive: 'End',
  },
  Toasts: {
    deleteSuccess: 'Deleted',
    deleteFailed: 'Failed',
  },
}

const DEFAULT_PROPS = {
  initialGenerations: [],
  initialPage: 1,
  initialHasMore: false,
  total: 2,
  initialFilters: {
    search: '',
    sort: 'newest' as const,
    model: '',
    type: 'all' as const,
    timeRange: 'all' as const,
    liked: false,
  },
}

function renderFeed() {
  return render(
    <NextIntlClientProvider locale="en" messages={MESSAGES}>
      <ProfileFeed {...DEFAULT_PROPS} />
    </NextIntlClientProvider>,
  )
}

// ─── Tests ──────────────────────────────────────────────────────

describe('ProfileFeed', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBatchDelete.mockResolvedValue({ success: true })
    mockBatchVisibility.mockResolvedValue({ success: true })
  })

  it('shows Select button when generations exist', () => {
    renderFeed()
    expect(screen.getByText('Select')).toBeInTheDocument()
  })

  it('enters select mode and shows image checkboxes', () => {
    renderFeed()
    fireEvent.click(screen.getByText('Select'))
    // In select mode, GalleryGrid is replaced with checkbox grid
    expect(screen.queryByTestId('gallery-grid')).not.toBeInTheDocument()
    expect(screen.getByText('Cancel')).toBeInTheDocument()
  })

  it('shows batch action bar after selecting items', () => {
    renderFeed()
    fireEvent.click(screen.getByText('Select'))

    // Click first image to select it
    const images = screen.getAllByRole('button')
    const imageButtons = images.filter((b) => b.querySelector('img') !== null)
    fireEvent.click(imageButtons[0])

    expect(screen.getByText('1 selected')).toBeInTheDocument()
    expect(screen.getByText('Make Public')).toBeInTheDocument()
    expect(screen.getByText('Make Private')).toBeInTheDocument()
    expect(screen.getByText('Delete')).toBeInTheDocument()
  })

  it('calls batchUpdateVisibilityAPI on Make Public', async () => {
    renderFeed()
    fireEvent.click(screen.getByText('Select'))

    const imageButtons = screen
      .getAllByRole('button')
      .filter((b) => b.querySelector('img') !== null)
    fireEvent.click(imageButtons[0])

    await act(async () => {
      fireEvent.click(screen.getByText('Make Public'))
    })

    expect(mockBatchVisibility).toHaveBeenCalledWith(
      ['gen_1'],
      'isPublic',
      true,
    )
  })

  it('exits select mode after successful batch operation', async () => {
    renderFeed()
    fireEvent.click(screen.getByText('Select'))

    const imageButtons = screen
      .getAllByRole('button')
      .filter((b) => b.querySelector('img') !== null)
    fireEvent.click(imageButtons[0])

    await act(async () => {
      fireEvent.click(screen.getByText('Make Private'))
    })

    // Should exit select mode — "Select" button reappears
    expect(screen.getByText('Select')).toBeInTheDocument()
  })
})
