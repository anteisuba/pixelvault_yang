import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

// ─── Mocks ──────────────────────────────────────────────────────

vi.mock('@/hooks/use-generation-visibility', () => ({
  useGenerationVisibility: vi.fn(() => ({
    isPublic: true,
    isPromptPublic: true,
    isFeatured: false,
    togglingField: null,
    handleToggle: vi.fn(),
  })),
}))

vi.mock('@/hooks/use-like', () => ({
  useLike: vi.fn(() => ({
    toggle: vi.fn(),
    isPending: false,
  })),
}))

vi.mock('@/lib/api-client', () => ({
  downloadRemoteAsset: vi.fn(),
}))

vi.mock('@/i18n/routing', () => ({
  isCjkLocale: vi.fn(() => false),
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
  useRouter: () => ({
    push: vi.fn(),
  }),
}))

vi.mock('@/lib/model-options', () => ({
  getTranslatedModelLabel: vi.fn(() => 'Stable Diffusion XL'),
}))

vi.mock('@/components/ui/optimized-image', () => ({
  OptimizedImage: (props: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    <img {...props} />
  ),
}))

vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    <img {...props} />
  ),
}))

// Mock ImageDetailModal to avoid testing it inside ImageCard
vi.mock('@/components/business/ImageDetailModal', () => ({
  ImageDetailModal: ({
    open,
  }: {
    open: boolean
    generation: unknown
    onOpenChange: (v: boolean) => void
  }) => (open ? <div data-testid="detail-modal">Modal Open</div> : null),
}))

import {
  ImageCard,
  IMAGE_CARD_PRESENTATIONS,
} from '@/components/business/ImageCard'
import { useLike } from '@/hooks/use-like'
import { downloadRemoteAsset } from '@/lib/api-client'
import type { GenerationRecord } from '@/types'

const mockUseLike = vi.mocked(useLike)
const mockDownloadRemoteAsset = vi.mocked(downloadRemoteAsset)

// ─── Fixtures ───────────────────────────────────────────────────

const MESSAGES = {
  GalleryCard: {
    modelLabel: 'Model',
    providerLabel: 'Provider',
    requestsLabel: 'Credits',
    openImage: 'Open Image',
    openVideo: 'Open Video',
    openLabel: 'Open',
    like: 'Like',
    unlike: 'Unlike',
    download: 'Download',
    downloadFailed: 'Download failed',
    creatorProfileLabel: 'View {name} profile',
    referenceImageLabel: 'Reference Image',
    promptPrivateHint: 'Prompt is private',
    imageVisibilityLabel: 'Image Visibility',
    promptVisibilityLabel: 'Prompt Visibility',
    featuredLabel: 'Featured',
    publicLabel: 'Public',
    privateLabel: 'Private',
    makePublicAction: 'Make Public',
    makePrivateAction: 'Make Private',
    featuredOn: 'Featured',
    featuredOff: 'Not Featured',
    pinAction: 'Pin',
    unpinAction: 'Unpin',
    copyPromptAction: 'Copy prompt',
    useInStudioAction: 'Use in Studio',
    promptCopiedToast: 'Prompt copied',
  },
  Common: {
    requestCount: '{count} credits',
  },
  Models: {},
  Errors: {},
}

const BASE_GEN: GenerationRecord = {
  id: 'gen_card_001',
  createdAt: new Date('2026-02-10'),
  outputType: 'IMAGE',
  status: 'COMPLETED',
  url: 'https://r2.example.com/card.png',
  storageKey: 'generations/image/card.png',
  mimeType: 'image/png',
  width: 1024,
  height: 1024,
  prompt: 'sunset over the ocean',
  model: 'sdxl',
  provider: 'huggingface',
  requestCount: 2,
  isPublic: true,
  isPromptPublic: true,
  likeCount: 5,
  isLiked: false,
}

function renderCard(
  props: Partial<React.ComponentProps<typeof ImageCard>> = {},
) {
  const defaults = {
    generation: BASE_GEN,
    ...props,
  }
  return render(
    <NextIntlClientProvider locale="en" messages={MESSAGES}>
      <ImageCard {...defaults} />
    </NextIntlClientProvider>,
  )
}

// ─── Tests ──────────────────────────────────────────────────────

describe('ImageCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseLike.mockReturnValue({
      toggle: vi.fn().mockResolvedValue(true),
      isPending: false,
    })
    mockDownloadRemoteAsset.mockResolvedValue({ success: true })
  })

  it('renders metadata (model, provider)', () => {
    renderCard()
    expect(screen.getByText('Stable Diffusion XL')).toBeInTheDocument()
    expect(screen.getByText('huggingface')).toBeInTheDocument()
  })

  it('shows prompt text when isPromptPublic', () => {
    renderCard()
    expect(screen.getByText('sunset over the ocean')).toBeInTheDocument()
  })

  it('keeps the gallery presentation image-first', () => {
    renderCard({
      presentation: IMAGE_CARD_PRESENTATIONS.GALLERY,
    })

    expect(screen.queryByText('huggingface')).not.toBeInTheDocument()
    expect(screen.queryByText('Open')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Open Image')).toBeInTheDocument()
    expect(screen.getByText('sunset over the ocean')).toBeInTheDocument()
    expect(screen.getByText('Stable Diffusion XL')).toBeInTheDocument()
  })

  it('shows creator link in gallery presentation', () => {
    renderCard({
      generation: {
        ...BASE_GEN,
        creator: {
          username: 'alice',
          displayName: 'Alice W.',
          avatarUrl: 'https://example.com/alice.png',
        },
      },
      presentation: IMAGE_CARD_PRESENTATIONS.GALLERY,
    })

    const creatorLink = screen.getByRole('link', {
      name: 'View Alice W. profile',
    })
    expect(creatorLink).toHaveAttribute('href', '/en/u/alice')
    expect(creatorLink.parentElement).toHaveClass('z-30')
    expect(creatorLink.parentElement?.className).not.toContain(
      'group-hover:opacity-0',
    )
    expect(screen.getByText('Alice W.')).toBeInTheDocument()
    expect(screen.getByText('@alice')).toBeInTheDocument()
  })

  it('does not open detail modal when gallery creator link is clicked', () => {
    renderCard({
      generation: {
        ...BASE_GEN,
        creator: {
          username: 'alice',
          displayName: 'Alice W.',
          avatarUrl: 'https://example.com/alice.png',
        },
      },
      presentation: IMAGE_CARD_PRESENTATIONS.GALLERY,
    })

    const creatorLink = screen.getByRole('link', {
      name: 'View Alice W. profile',
    })
    creatorLink.addEventListener('click', (event) => event.preventDefault())
    fireEvent.click(creatorLink)

    expect(screen.queryByTestId('detail-modal')).not.toBeInTheDocument()
  })

  it('shows lock hint when prompt is private but image is public', () => {
    renderCard({
      generation: {
        ...BASE_GEN,
        isPromptPublic: false,
        isPublic: true,
      },
    })
    expect(screen.getByText('Prompt is private')).toBeInTheDocument()
    expect(screen.queryByText('sunset over the ocean')).not.toBeInTheDocument()
  })

  it('shows creator attribution when creator data present', () => {
    renderCard({
      generation: {
        ...BASE_GEN,
        creator: {
          username: 'alice',
          displayName: 'Alice W.',
          avatarUrl: 'https://example.com/alice.png',
        },
      },
    })
    expect(screen.getByText('Alice W.')).toBeInTheDocument()
  })

  it('opens detail modal when Open button clicked', async () => {
    renderCard()
    // Initially modal is not open
    expect(screen.queryByTestId('detail-modal')).not.toBeInTheDocument()

    // Click the text "Open" button (not the media button which also has aria-label)
    const openBtn = screen.getByText('Open')
    fireEvent.click(openBtn)

    expect(await screen.findByTestId('detail-modal')).toBeInTheDocument()
  })

  it('renders like button with count', () => {
    renderCard({
      generation: { ...BASE_GEN, likeCount: 5, isLiked: false },
    })
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByLabelText('Like')).toBeInTheDocument()
  })

  it('does not open detail modal from like or download controls', async () => {
    const toggle = vi.fn().mockResolvedValue(true)
    mockUseLike.mockReturnValue({ toggle, isPending: false })

    renderCard({
      generation: { ...BASE_GEN, likeCount: 5, isLiked: false },
      presentation: IMAGE_CARD_PRESENTATIONS.GALLERY,
    })

    fireEvent.click(screen.getByLabelText('Like'))
    fireEvent.click(screen.getByLabelText('Download'))

    expect(toggle).toHaveBeenCalledWith(BASE_GEN.id)
    expect(mockDownloadRemoteAsset).toHaveBeenCalledWith(
      BASE_GEN.url,
      'pixelvault-gen_card.png',
    )
    expect(screen.queryByTestId('detail-modal')).not.toBeInTheDocument()
  })

  it('rolls back optimistic like state when the toggle is not committed', async () => {
    const toggle = vi.fn().mockResolvedValue(false)
    mockUseLike.mockReturnValue({ toggle, isPending: false })

    renderCard({
      generation: { ...BASE_GEN, likeCount: 5, isLiked: false },
    })

    fireEvent.click(screen.getByLabelText('Like'))

    await waitFor(() => {
      expect(screen.getByLabelText('Like')).toBeInTheDocument()
      expect(screen.getByText('5')).toBeInTheDocument()
    })
  })

  it('uses stored poster assets for video cards without preloading metadata', () => {
    const { container } = renderCard({
      generation: {
        ...BASE_GEN,
        outputType: 'VIDEO',
        url: 'https://r2.example.com/video.mp4',
        storageKey: 'generations/video/video.mp4',
        mimeType: 'video/mp4',
        thumbnailUrl: 'https://r2.example.com/video.thumbnail.webp',
        thumbnailStorageKey: 'generations/video/video.thumbnail.webp',
        width: 1280,
        height: 720,
        duration: 5,
      },
    })

    const video = container.querySelector('video')
    expect(video).toHaveAttribute(
      'poster',
      'https://r2.example.com/video.thumbnail.webp',
    )
    expect(video).toHaveAttribute('preload', 'none')
    expect(video).toHaveAttribute('src', 'https://r2.example.com/video.mp4')
  })

  it('loads video metadata for a first-frame preview when no poster exists', () => {
    const { container } = renderCard({
      generation: {
        ...BASE_GEN,
        outputType: 'VIDEO',
        url: 'https://r2.example.com/video.mp4',
        storageKey: 'generations/video/video.mp4',
        mimeType: 'video/mp4',
        thumbnailUrl: null,
        previewUrl: null,
        width: 1280,
        height: 720,
        duration: 5,
      },
    })

    const video = container.querySelector('video')
    expect(video).toHaveAttribute('preload', 'metadata')
    expect(video).not.toHaveAttribute('poster')

    Object.defineProperty(video, 'duration', {
      configurable: true,
      value: 5,
    })
    fireEvent.loadedMetadata(video!)

    expect(video?.currentTime).toBe(0.12)
  })
})
