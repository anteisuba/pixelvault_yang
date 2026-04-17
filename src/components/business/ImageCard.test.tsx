import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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

import { ImageCard } from '@/components/business/ImageCard'
import { useLike } from '@/hooks/use-like'
import type { GenerationRecord } from '@/types'

const mockUseLike = vi.mocked(useLike)

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
  },
  Common: {
    creditCount: '{count} credits',
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
    mockUseLike.mockReturnValue({ toggle: vi.fn(), isPending: false })
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

  it('opens detail modal when Open button clicked', () => {
    renderCard()
    // Initially modal is not open
    expect(screen.queryByTestId('detail-modal')).not.toBeInTheDocument()

    // Click the text "Open" button (not the media button which also has aria-label)
    const openBtn = screen.getByText('Open')
    fireEvent.click(openBtn)

    expect(screen.getByTestId('detail-modal')).toBeInTheDocument()
  })

  it('renders like button with count', () => {
    renderCard({
      generation: { ...BASE_GEN, likeCount: 5, isLiked: false },
    })
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByLabelText('Like')).toBeInTheDocument()
  })
})
