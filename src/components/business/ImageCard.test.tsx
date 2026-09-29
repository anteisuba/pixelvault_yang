import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

// ─── Mocks ──────────────────────────────────────────────────────

vi.mock('@/lib/api-client', () => ({
  downloadRemoteAsset: vi.fn(),
}))

vi.mock('next/image', () => ({
  default: ({
    src,
    alt,
    className,
  }: {
    src: string
    alt: string
    className?: string
  }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className={className} />
  ),
}))

// 手机的全屏详情另有测试；这里只看卡片什么时候把它挂出来。
vi.mock('@/components/business/ImageDetailModal', () => ({
  ImageDetailModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="detail-modal">Modal Open</div> : null,
}))

import { ImageCard } from '@/components/business/ImageCard'
import { downloadRemoteAsset } from '@/lib/api-client'
import type { GenerationRecord } from '@/types'

const mockDownloadRemoteAsset = vi.mocked(downloadRemoteAsset)

// ─── Fixtures ───────────────────────────────────────────────────

const MESSAGES = {
  GalleryCard: {
    openImage: 'Open Image',
    openVideo: 'Open Video',
    like: 'Like',
    unlike: 'Unlike',
    download: 'Download',
    downloadFailed: 'Download failed',
    creatorProfileLabel: 'View {name} profile',
    referenceImageLabel: 'Reference Image',
    layerBadge: 'Base + {count} layers',
  },
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

const ALICE = {
  username: 'alice',
  displayName: 'Alice W.',
  avatarUrl: 'https://example.com/alice.png',
}

function renderCard(
  props: Partial<React.ComponentProps<typeof ImageCard>> = {},
) {
  const defaults = {
    generation: BASE_GEN,
    onToggleLike: vi.fn(),
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
    mockDownloadRemoteAsset.mockResolvedValue({ success: true })
  })

  it('keeps the card face to the media alone — no prompt, model or provider', () => {
    renderCard()
    expect(screen.getByLabelText('Open Image')).toBeInTheDocument()
    expect(screen.queryByText('sunset over the ocean')).not.toBeInTheDocument()
    expect(screen.queryByText('huggingface')).not.toBeInTheDocument()
  })

  it('marks the tile with its id so the viewer can grow from it', () => {
    const { container } = renderCard()
    expect(
      container.querySelector('[data-gallery-tile-id="gen_card_001"]'),
    ).not.toBeNull()
  })

  it('keeps the creator chip hover-only and drops it on touch', () => {
    renderCard({ generation: { ...BASE_GEN, creator: ALICE } })

    const creatorLink = screen.getByRole('link', {
      name: 'View Alice W. profile',
    })
    expect(creatorLink).toHaveAttribute('href', '/en/u/alice')
    expect(creatorLink.className).toContain('opacity-0')
    expect(creatorLink.className).toContain('pointer-events-none')
    expect(creatorLink.className).toContain('group-hover:opacity-100')
    expect(creatorLink.className).toContain('group-focus-within:opacity-100')
    expect(creatorLink.className).toContain('coarse:hidden')
    expect(screen.getByText('Alice W.')).toBeInTheDocument()
  })

  it('hides the ♥ · download row until hover and drops it on touch', () => {
    const { container } = renderCard()

    const actions = container.querySelector('.card-actions')
    expect(actions).not.toBeNull()
    expect(actions?.className).toContain('opacity-0')
    expect(actions?.className).toContain('pointer-events-none')
    expect(actions?.className).toContain('group-hover:pointer-events-auto')
    expect(actions?.className).toContain(
      'group-focus-within:pointer-events-auto',
    )
    expect(actions?.className).toContain('coarse:hidden')
  })

  it('reads ♥ from the feed and hands the toggle back to it', () => {
    const onToggleLike = vi.fn()
    const generation = { ...BASE_GEN, likeCount: 5, isLiked: true }
    renderCard({ generation, onToggleLike })

    expect(screen.getByText('5')).toBeInTheDocument()
    const like = screen.getByRole('button', { name: 'Unlike' })
    expect(like).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(like)
    expect(onToggleLike).toHaveBeenCalledWith(generation)
  })

  it('hands the open to the viewer when the feed owns one', () => {
    const onOpen = vi.fn()
    renderCard({ onOpen })

    fireEvent.click(screen.getByLabelText('Open Image'))

    expect(onOpen).toHaveBeenCalledWith(BASE_GEN)
    expect(screen.queryByTestId('detail-modal')).not.toBeInTheDocument()
  })

  it('opens its own full-screen detail on phones (no viewer)', async () => {
    renderCard()
    expect(screen.queryByTestId('detail-modal')).not.toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Open Image'))

    expect(await screen.findByTestId('detail-modal')).toBeInTheDocument()
  })

  it('does not open anything from ♥, download or the creator chip', () => {
    const onOpen = vi.fn()
    renderCard({ generation: { ...BASE_GEN, creator: ALICE }, onOpen })

    fireEvent.click(screen.getByLabelText('Like'))
    fireEvent.click(screen.getByLabelText('Download'))
    const creatorLink = screen.getByRole('link', {
      name: 'View Alice W. profile',
    })
    creatorLink.addEventListener('click', (event) => event.preventDefault())
    fireEvent.click(creatorLink)

    expect(mockDownloadRemoteAsset).toHaveBeenCalledWith(
      BASE_GEN.url,
      'pixelvault-gen_card.png',
    )
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('badges the duration only on video cards', () => {
    const { rerender } = renderCard()
    expect(screen.queryByText('0:07')).not.toBeInTheDocument()

    rerender(
      <NextIntlClientProvider locale="en" messages={MESSAGES}>
        <ImageCard
          generation={{
            ...BASE_GEN,
            outputType: 'VIDEO',
            url: 'https://r2.example.com/card.mp4',
            mimeType: 'video/mp4',
            duration: 7,
          }}
          onToggleLike={vi.fn()}
        />
      </NextIntlClientProvider>,
    )
    expect(screen.getByText('0:07')).toBeInTheDocument()
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

  it('does not preload video bytes when no poster exists', () => {
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
    expect(video).toHaveAttribute('preload', 'none')
    expect(video).not.toHaveAttribute('poster')
  })
})
