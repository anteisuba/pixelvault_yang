import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

// ─── Mocks ──────────────────────────────────────────────────────

vi.mock('@/lib/api-client', () => ({
  downloadRemoteAsset: vi.fn(),
  toggleGenerationVisibility: vi.fn(),
}))

vi.mock('@clerk/nextjs', () => ({
  useAuth: vi.fn(() => ({ isSignedIn: true })),
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
    savePromptTemplate: 'Save Prompt',
    editInStudio: 'Edit in Studio',
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
    requestCount: '{count} credits',
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
    <NextIntlClientProvider locale="en" messages={MESSAGES} timeZone="UTC">
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

  it('keeps the generated image as the primary media when a reference image exists', () => {
    renderModal({
      generation: {
        ...BASE_GEN,
        referenceImageUrl: 'https://r2.example.com/reference.png',
      },
    })

    expect(
      screen.getByAltText('a beautiful mountain landscape'),
    ).toBeInTheDocument()
    expect(screen.queryByAltText('Generated')).not.toBeInTheDocument()
    expect(screen.queryByAltText('Reference')).not.toBeInTheDocument()
  })

  it('shows copy prompt button when prompt is visible', () => {
    renderModal({
      generation: { ...BASE_GEN, isPromptPublic: true },
    })
    expect(screen.getByText('Copy Prompt')).toBeInTheDocument()
  })

  it('links visible prompts to the prompt template creation page', () => {
    renderModal({
      generation: { ...BASE_GEN, isPromptPublic: true },
    })

    const link = screen.getByRole('link', { name: /save prompt/i })
    expect(link).toHaveAttribute('href', expect.stringContaining('/prompts?'))
    expect(link).toHaveAttribute('href', expect.stringContaining('create=1'))
    expect(link).toHaveAttribute('href', expect.stringContaining('model=sdxl'))
    expect(link).toHaveAttribute(
      'href',
      expect.stringContaining('generationId=gen_modal_001'),
    )
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

  it('links IMAGE output type to the Canvas image editor', () => {
    renderModal()
    const link = screen.getByRole('link', { name: /edit in studio/i })
    expect(link).toHaveAttribute(
      'href',
      expect.stringContaining('/studio/node?canvasTool=image-edit'),
    )
    expect(link).toHaveAttribute(
      'href',
      expect.stringContaining('generationId=gen_modal_001'),
    )
  })

  it('hides the Studio edit link for VIDEO output type', () => {
    renderModal({
      generation: {
        ...BASE_GEN,
        outputType: 'VIDEO',
        url: 'https://r2.example.com/test.mp4',
      },
    })
    expect(screen.queryByText('Edit in Studio')).not.toBeInTheDocument()
  })
})
