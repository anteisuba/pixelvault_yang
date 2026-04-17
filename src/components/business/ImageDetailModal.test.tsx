import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

// ─── Mocks ──────────────────────────────────────────────────────

vi.mock('@/hooks/use-image-editing', () => ({
  useImageEditing: vi.fn(() => ({
    editingAction: null,
    editAndDownload: vi.fn(),
    editAndSave: vi.fn(),
    decomposeAndDownload: vi.fn(),
    decomposeAndSave: vi.fn(),
  })),
}))

vi.mock('@/lib/api-client', () => ({
  downloadRemoteAsset: vi.fn(),
  toggleGenerationVisibility: vi.fn(),
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

vi.mock('@/components/business/VideoPlayer', () => ({
  default: () => <div data-testid="video-player" />,
}))

import { ImageDetailModal } from '@/components/business/ImageDetailModal'
import type { GenerationRecord } from '@/types'

// ─── Fixtures ───────────────────────────────────────────────────

const MESSAGES = {
  ImageDetail: {
    title: 'Image Details',
    promptLabel: 'Prompt',
    negativePromptLabel: 'Negative Prompt',
    dimensionsLabel: 'Dimensions',
    download: 'Download',
    downloading: 'Downloading...',
    openOriginal: 'Open Original',
    copyPrompt: 'Copy Prompt',
    promptCopied: 'Copied!',
    shareLink: 'Share Link',
    linkCopied: 'Link Copied!',
    generateWithPrompt: 'Generate',
    upscale: 'Upscale',
    upscaling: 'Upscaling...',
    removeBackground: 'Remove BG',
    removingBackground: 'Removing...',
    saveUpscaleToGallery: 'Save Upscale',
    decompose: 'Decompose',
    decomposing: 'Decomposing...',
    saveDecomposeToGallery: 'Save Decompose',
    decomposeDescription: 'Decompose layers',
    delete: 'Delete',
    deleteConfirmTitle: 'Delete Image?',
    deleteConfirmDescription: 'Cannot be undone.',
    deleteCancel: 'Cancel',
    deleteConfirm: 'Confirm Delete',
    close: 'Close',
    editFailed: 'Edit failed',
    downloadFailed: 'Download failed',
    editSuccess: 'Edit done',
    editSavedToGallery: 'Saved',
    decomposeFailed: 'Decompose fail',
    decomposeSuccess: 'Decomposed',
    referenceLabel: 'Reference',
    generatedLabel: 'Generated',
    referenceImageLabel: 'Reference Image',
    shareFailed: 'Share failed',
  },
  GalleryCard: {
    modelLabel: 'Model',
    providerLabel: 'Provider',
    requestsLabel: 'Credits',
    imageVisibilityShort: '{status}',
    promptVisibilityShort: '{status}',
    publicLabel: 'Public',
    privateLabel: 'Private',
    featuredOn: 'Featured',
    unpinAction: 'Unpin',
    pinAction: 'Pin',
    promptPrivateHint: 'Prompt is private',
  },
  Common: {
    creditCount: '{count} credits',
    close: 'Close',
  },
  Models: {},
  Toasts: {
    featuredAdded: 'Pinned',
    featuredRemoved: 'Unpinned',
    featuredFailed: 'Failed',
    featuredLimitReached: 'Limit',
  },
  Errors: {},
}

const BASE_GEN: GenerationRecord = {
  id: 'gen_modal_001',
  createdAt: new Date('2026-01-15'),
  outputType: 'IMAGE',
  status: 'COMPLETED',
  url: 'https://r2.example.com/test.png',
  storageKey: 'generations/image/test.png',
  mimeType: 'image/png',
  width: 1024,
  height: 1024,
  prompt: 'a beautiful mountain landscape',
  model: 'sdxl',
  provider: 'huggingface',
  requestCount: 1,
  isPublic: true,
  isPromptPublic: true,
}

function renderModal(
  props: Partial<React.ComponentProps<typeof ImageDetailModal>> = {},
) {
  const defaults = {
    generation: BASE_GEN,
    open: true,
    onOpenChange: vi.fn(),
    ...props,
  }
  return render(
    <NextIntlClientProvider locale="en" messages={MESSAGES}>
      <ImageDetailModal {...defaults} />
    </NextIntlClientProvider>,
  )
}

// ─── Tests ──────────────────────────────────────────────────────

describe('ImageDetailModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing visible when open is false', () => {
    renderModal({ open: false })
    expect(screen.queryByText('Prompt')).not.toBeInTheDocument()
    expect(screen.queryByText('Download')).not.toBeInTheDocument()
  })

  it('renders prompt and metadata when open', () => {
    renderModal()
    // Prompt text appears in multiple places (prompt section, img alt, sr-only description)
    const matches = screen.getAllByText('a beautiful mountain landscape')
    expect(matches.length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Stable Diffusion XL')).toBeInTheDocument()
    expect(screen.getByText('huggingface')).toBeInTheDocument()
  })

  it('shows copy prompt button when prompt is visible', () => {
    renderModal({
      generation: { ...BASE_GEN, isPromptPublic: true },
    })
    expect(screen.getByText('Copy Prompt')).toBeInTheDocument()
  })

  it('shows private hint and hides copy when prompt not visible', () => {
    renderModal({
      generation: { ...BASE_GEN, isPromptPublic: false },
      showVisibility: false,
    })
    expect(screen.getByText('Prompt is private')).toBeInTheDocument()
    expect(screen.queryByText('Copy Prompt')).not.toBeInTheDocument()
  })

  it('shows delete button when showDelete and onDelete provided', () => {
    renderModal({ showDelete: true, onDelete: vi.fn() })
    expect(screen.getByText('Delete')).toBeInTheDocument()
  })

  it('hides delete button when showDelete is false', () => {
    renderModal({ showDelete: false })
    expect(screen.queryByText('Delete')).not.toBeInTheDocument()
  })

  it('shows image editing buttons for IMAGE output type', () => {
    renderModal()
    expect(screen.getByText('Upscale')).toBeInTheDocument()
    expect(screen.getByText('Remove BG')).toBeInTheDocument()
    expect(screen.getByText('Decompose')).toBeInTheDocument()
  })

  it('hides image editing buttons for VIDEO output type', () => {
    renderModal({
      generation: {
        ...BASE_GEN,
        outputType: 'VIDEO',
        url: 'https://r2.example.com/test.mp4',
      },
    })
    expect(screen.queryByText('Upscale')).not.toBeInTheDocument()
    expect(screen.queryByText('Remove BG')).not.toBeInTheDocument()
  })
})
