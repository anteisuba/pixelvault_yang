import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'

// ─── Mocks ──────────────────────────────────────────────────────

vi.mock('@/lib/api-client', () => ({
  downloadRemoteAsset: vi.fn(),
}))

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: 'user-a' }),
  useUser: () => ({ user: { id: 'user-a' } }),
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

import { ImageCard } from '@/components/business/ImageCard'
import { downloadRemoteAsset } from '@/lib/api-client'
import type { GenerationRecord } from '@/types'
import { renderWithApp } from '@/test/app-harness'
import { text } from '@/test/i18n-text'
import { MOBILE_WIDTH, setViewportWidth } from '@/test/viewport'

const mockDownloadRemoteAsset = vi.mocked(downloadRemoteAsset)

// ─── Fixtures ───────────────────────────────────────────────────

const T = (key: string, values?: Record<string, string>) =>
  text(`GalleryCard.${key}`, values, 'en')

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
  return renderWithApp(<ImageCard {...defaults} />, { locale: 'en' })
}

// ─── Tests ──────────────────────────────────────────────────────

describe('ImageCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setViewportWidth(MOBILE_WIDTH, { touch: true })
    mockDownloadRemoteAsset.mockResolvedValue({ success: true })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('keeps the card face to the media alone — no prompt, model or provider', () => {
    renderCard()
    expect(screen.getByLabelText(T('openImage'))).toBeInTheDocument()
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
      name: T('creatorProfileLabel', { name: 'Alice W.' }),
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

    const like = screen.getByRole('button', { name: T('unlike') })
    // 数字是滚轴：读屏只念 sr-only 那一份。
    expect(like.querySelector('.sr-only')).toHaveTextContent(/^5$/)
    expect(like).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(like)
    expect(onToggleLike).toHaveBeenCalledWith(generation)
  })

  it('hands the open to the viewer when the feed owns one', () => {
    const onOpen = vi.fn()
    renderCard({ onOpen })

    fireEvent.click(screen.getByLabelText(T('openImage')))

    expect(onOpen).toHaveBeenCalledWith(BASE_GEN)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens its own full-screen detail on phones (no viewer)', async () => {
    renderCard()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(screen.getByLabelText(T('openImage')))

    // 真的详情弹框（按需加载，第一次要等模块载完）：里面是这张图的提示词。
    const dialog = await screen.findByRole('dialog', {}, { timeout: 5000 })
    expect(dialog).toHaveTextContent('sunset over the ocean')
  })

  it('renders public work as a crawlable link to its detail page', () => {
    const onOpen = vi.fn()
    renderCard({ onOpen })

    const opener = screen.getByRole('link', { name: T('openImage') })
    expect(opener).toHaveAttribute('href', '/en/gallery/gen_card_001')

    // 普通左键：留在画廊、交给查看器，⛔ 跳页。
    const click = fireEvent.click(opener)
    expect(click).toBe(false) // defaultPrevented
    expect(onOpen).toHaveBeenCalledWith(BASE_GEN)
  })

  it('lets ⌘/Ctrl-click fall through to the browser (new tab)', () => {
    const onOpen = vi.fn()
    renderCard({ onOpen })

    const opener = screen.getByRole('link', { name: T('openImage') })
    opener.addEventListener('click', (event) => event.preventDefault())
    fireEvent.click(opener, { metaKey: true })
    fireEvent.click(opener, { ctrlKey: true })

    expect(onOpen).not.toHaveBeenCalled()
  })

  it('keeps private work and audio as a plain button (no detail page to link)', () => {
    const { unmount } = renderCard({
      generation: { ...BASE_GEN, isPublic: false },
    })
    expect(
      screen.getByRole('button', { name: T('openImage') }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: T('openImage') }),
    ).not.toBeInTheDocument()
    unmount()

    renderCard({
      generation: {
        ...BASE_GEN,
        outputType: 'AUDIO',
        url: 'https://r2.example.com/a.mp3',
        mimeType: 'audio/mpeg',
      },
    })
    expect(
      screen.getByRole('button', { name: T('openImage') }),
    ).toBeInTheDocument()
  })

  it('does not open anything from ♥, download or the creator chip', () => {
    const onOpen = vi.fn()
    renderCard({ generation: { ...BASE_GEN, creator: ALICE }, onOpen })

    fireEvent.click(screen.getByLabelText(T('like')))
    fireEvent.click(screen.getByLabelText(T('download')))
    const creatorLink = screen.getByRole('link', {
      name: T('creatorProfileLabel', { name: 'Alice W.' }),
    })
    creatorLink.addEventListener('click', (event) => event.preventDefault())
    fireEvent.click(creatorLink)

    expect(mockDownloadRemoteAsset).toHaveBeenCalledWith(
      BASE_GEN.url,
      'antei-gen_card.png',
    )
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('badges the duration only on video cards', () => {
    const { rerender } = renderCard()
    expect(screen.queryByText('0:07')).not.toBeInTheDocument()

    rerender(
      <ImageCard
        generation={{
          ...BASE_GEN,
          outputType: 'VIDEO',
          url: 'https://r2.example.com/card.mp4',
          mimeType: 'video/mp4',
          duration: 7,
        }}
        onToggleLike={vi.fn()}
      />,
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

  describe('GIF', () => {
    const GIF_URL = 'https://r2.example.com/card.gif'
    const GIF_STILL = 'https://r2.example.com/card.thumbnail.webp'
    const GIF_GEN: GenerationRecord = {
      ...BASE_GEN,
      url: GIF_URL,
      storageKey: 'generations/image/card.gif',
      mimeType: 'image/gif',
      thumbnailUrl: GIF_STILL,
      previewUrl: 'https://r2.example.com/card.preview.webp',
    }
    const imgSrcs = (container: HTMLElement) =>
      Array.from(container.querySelectorAll('img')).map((img) =>
        img.getAttribute('src'),
      )

    it('badges GIF cards and only GIF cards', () => {
      const { rerender } = renderCard()
      expect(
        screen.queryByTestId('image-card-gif-badge'),
      ).not.toBeInTheDocument()

      rerender(<ImageCard generation={GIF_GEN} onToggleLike={vi.fn()} />)
      expect(screen.getByTestId('image-card-gif-badge')).toHaveTextContent(
        'GIF',
      )
    })

    it('rests on the still first frame and plays the original only while a mouse hovers', () => {
      const { container } = renderCard({ generation: GIF_GEN })
      const tile = screen.getByLabelText(T('openImage'))
      expect(imgSrcs(container)).not.toContain(GIF_URL)
      expect(imgSrcs(container)).toContain(GIF_STILL)

      fireEvent.pointerEnter(tile, { pointerType: 'mouse' })
      expect(imgSrcs(container)).toContain(GIF_URL)
      // 静止图留在底下：原件到之前不露白。
      expect(imgSrcs(container)).toContain(GIF_STILL)

      fireEvent.pointerLeave(tile, { pointerType: 'mouse' })
      expect(imgSrcs(container)).not.toContain(GIF_URL)
    })

    it('stays still on touch — tapping opens the detail, which plays it', () => {
      const { container } = renderCard({ generation: GIF_GEN })
      fireEvent.pointerEnter(screen.getByLabelText(T('openImage')), {
        pointerType: 'touch',
      })
      expect(imgSrcs(container)).not.toContain(GIF_URL)
    })

    it('shows the original directly for an old GIF without a still derivative', () => {
      const { container } = renderCard({
        generation: { ...GIF_GEN, thumbnailUrl: null, previewUrl: null },
      })
      const originals = () =>
        imgSrcs(container).filter((src) => src === GIF_URL)
      expect(originals()).toHaveLength(1)

      // 底下已经是原件，悬停不再叠第二张。
      fireEvent.pointerEnter(screen.getByLabelText(T('openImage')), {
        pointerType: 'mouse',
      })
      expect(originals()).toHaveLength(1)
    })
  })
})
