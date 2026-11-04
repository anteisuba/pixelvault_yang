import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, screen, within } from '@testing-library/react'

// ─── Mocks ──────────────────────────────────────────────────────

vi.mock('@/lib/api-client', () => ({
  downloadRemoteAsset: vi.fn(),
  toggleGenerationVisibility: vi.fn(),
}))

vi.mock('@clerk/nextjs', () => ({
  useAuth: vi.fn(() => ({ isLoaded: true, isSignedIn: true })),
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

import { ImageDetailModal } from '@/components/business/ImageDetailModal'
import { toggleGenerationVisibility } from '@/lib/api-client'
import type { GenerationRecord } from '@/types'
import { renderWithApp } from '@/test/app-harness'
import { text } from '@/test/i18n-text'

// ─── Fixtures ───────────────────────────────────────────────────

const T = (path: string) => text(path, {}, 'en')

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
  model: 'seedream-5.0-pro',
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
  return renderWithApp(<ImageDetailModal {...defaults} />, { locale: 'en' })
}

// ─── Tests ──────────────────────────────────────────────────────

describe('ImageDetailModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing visible when open is false', () => {
    renderModal({ open: false })
    expect(
      screen.queryByText(T('ImageDetail.promptLabel')),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText(T('ImageDetail.download')),
    ).not.toBeInTheDocument()
  })

  it('renders prompt and metadata when open', () => {
    renderModal()
    // Prompt text appears in multiple places (prompt section, img alt, sr-only description)
    const matches = screen.getAllByText('a beautiful mountain landscape')
    expect(matches.length).toBeGreaterThanOrEqual(1)
    expect(
      screen.getByText(T('Models.seedream50Pro.label')),
    ).toBeInTheDocument()
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
    expect(
      screen.queryByAltText(T('ImageDetail.generatedLabel')),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByAltText(T('ImageDetail.referenceLabel')),
    ).not.toBeInTheDocument()
  })

  it('shows copy prompt button when prompt is visible', () => {
    renderModal({
      generation: { ...BASE_GEN, isPromptPublic: true },
    })
    expect(screen.getByText(T('ImageDetail.copyPrompt'))).toBeInTheDocument()
  })

  it('links visible prompts to the prompt template creation page', () => {
    renderModal({
      generation: { ...BASE_GEN, isPromptPublic: true },
    })

    const link = screen.getByRole('link', {
      name: T('ImageDetail.savePromptTemplate'),
    })
    expect(link).toHaveAttribute('href', expect.stringContaining('/prompts?'))
    expect(link).toHaveAttribute('href', expect.stringContaining('create=1'))
    expect(link).toHaveAttribute(
      'href',
      expect.stringContaining('model=seedream-5.0-pro'),
    )
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
    expect(
      screen.getByText(T('GalleryCard.promptPrivateHint')),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(T('ImageDetail.copyPrompt')),
    ).not.toBeInTheDocument()
  })

  it('shows delete button when showDelete and onDelete provided', () => {
    renderModal({ showDelete: true, onDelete: vi.fn() })
    expect(screen.getByText(T('ImageDetail.delete'))).toBeInTheDocument()
  })

  it('deletes only after confirming in the centered dialog', async () => {
    const onDelete = vi.fn()
    const onOpenChange = vi.fn()
    renderModal({ showDelete: true, onDelete, onOpenChange })
    fireEvent.click(
      screen.getByRole('button', { name: T('ImageDetail.delete') }),
    )
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent(T('Feedback.deleteDialog.imageTitle'))
    expect(onDelete).not.toHaveBeenCalled()
    fireEvent.click(
      within(dialog).getByRole('button', {
        name: T('Feedback.deleteDialog.confirm'),
      }),
    )
    expect(onDelete).toHaveBeenCalledWith(BASE_GEN.id)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('hides delete button when showDelete is false', () => {
    renderModal({ showDelete: false })
    expect(screen.queryByText(T('ImageDetail.delete'))).not.toBeInTheDocument()
  })

  it('links IMAGE output type to the Canvas image editor', () => {
    renderModal()
    const link = screen.getByRole('link', {
      name: T('ImageDetail.editInStudio'),
    })
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
    expect(
      screen.queryByText(T('ImageDetail.editInStudio')),
    ).not.toBeInTheDocument()
  })

  it('draws a different pin once pinned, not just a different colour', () => {
    const pin = (isFeatured: boolean) => {
      const { unmount } = renderModal({
        generation: { ...BASE_GEN, isFeatured },
        showVisibility: true,
      })
      const svg = screen
        .getByRole('button', {
          name: T(
            isFeatured ? 'GalleryCard.unpinAction' : 'GalleryCard.pinAction',
          ),
        })
        .querySelector('svg')!.innerHTML
      unmount()
      return svg
    }
    expect(pin(true)).not.toBe(pin(false))
  })

  it('writes the pin result on the pin key itself', async () => {
    vi.mocked(toggleGenerationVisibility).mockResolvedValue({
      success: true,
      data: { isFeatured: true },
    } as Awaited<ReturnType<typeof toggleGenerationVisibility>>)
    renderModal({ showVisibility: true })
    fireEvent.click(
      screen.getByRole('button', { name: T('GalleryCard.pinAction') }),
    )
    const key = await screen.findByRole('button', {
      name: T('Toasts.featuredAdded'),
    })
    expect(key).toHaveAttribute('data-feedback', 'done')
  })
})
