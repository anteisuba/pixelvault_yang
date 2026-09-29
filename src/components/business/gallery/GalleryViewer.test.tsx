import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GalleryViewer } from '@/components/business/gallery/GalleryViewer'
import { STUDIO_PREFILL_PROMPT_STORAGE_KEY } from '@/constants/studio'
import { FAKE_GENERATION } from '@/test/api-helpers'
import type { GenerationRecord } from '@/types'

const push = vi.fn()

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}:${key}`,
  useFormatter: () => ({ dateTime: () => 'Sep 21, 21:14' }),
  useLocale: () => 'zh',
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
  useRouter: () => ({ push }),
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

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function work(id: string, overrides: Partial<GenerationRecord> = {}) {
  return {
    ...FAKE_GENERATION,
    id,
    outputType: 'IMAGE',
    prompt: `prompt of ${id}`,
    negativePrompt: 'blurry',
    isPromptPublic: true,
    model: 'someone-elses-model',
    width: 768,
    height: 1024,
    likeCount: 12,
    isLiked: false,
    creator: { username: 'yining', displayName: 'YINIG', avatarUrl: null },
    ...overrides,
  } as GenerationRecord
}

const works = [work('a'), work('b'), work('c')]

function renderViewer(
  generation: GenerationRecord,
  handlers: Partial<{
    onNavigate: (next: GenerationRecord) => void
    onClose: () => void
    onToggleLike: (generation: GenerationRecord) => void
  }> = {},
) {
  const props = {
    onNavigate: vi.fn(),
    onClose: vi.fn(),
    onToggleLike: vi.fn(),
    ...handlers,
  }
  render(<GalleryViewer generation={generation} images={works} {...props} />)
  return props
}

describe('GalleryViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    // jsdom 没有这个 API：缩略轨把当前那一张滚到中间用的。
    Element.prototype.scrollIntoView = vi.fn()
  })

  it('leads with the author and pages through the loaded images', () => {
    const { onNavigate } = renderViewer(works[0])

    expect(
      screen.getByRole('link', { name: 'GalleryCard:creatorProfileLabel' }),
    ).toHaveAttribute('href', '/u/yining')
    expect(screen.getByText('@yining')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'GalleryPage.viewer:previous' }),
    ).toBeDisabled()
    fireEvent.keyDown(document, { key: 'ArrowRight' })
    expect(onNavigate).toHaveBeenCalledWith(works[1])
  })

  it('shows the public recipe: prompt, negative, model, size', () => {
    renderViewer(works[1])

    expect(screen.getByText('prompt of b')).toBeInTheDocument()
    expect(screen.getByText('blurry')).toBeInTheDocument()
    expect(screen.getByText('someone-elses-model')).toBeInTheDocument()
    expect(screen.getByText('768×1024')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /GalleryPage\.viewer:remix/ }),
    ).toBeInTheDocument()
  })

  it('locks the recipe half when the author kept the prompt private', () => {
    renderViewer(
      work('p', { isPromptPublic: false, prompt: '', negativePrompt: null }),
    )

    expect(
      screen.getByText('GalleryPage.viewer:promptPrivate'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /GalleryPage\.viewer:remix/ }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /ImageDetail:copyPrompt/ }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText('GalleryPage.viewer:negative'),
    ).not.toBeInTheDocument()
    // 作品本身照样能 ♥、分享、下载。
    expect(
      screen.getByRole('button', { name: 'GalleryCard:like' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /ImageDetail:shareLink/ }),
    ).toBeInTheDocument()
  })

  it('hands ♥ back to the feed', () => {
    const { onToggleLike } = renderViewer(works[0])

    fireEvent.click(screen.getByRole('button', { name: 'GalleryCard:like' }))

    expect(onToggleLike).toHaveBeenCalledWith(works[0])
  })

  it('shares the public page link and says so on the key itself', async () => {
    const writeText = vi.fn(async () => {})
    Object.assign(navigator, { clipboard: { writeText } })
    renderViewer(works[0])

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /ImageDetail:shareLink/ }),
      )
    })

    expect(writeText).toHaveBeenCalledWith(
      `${window.location.origin}/zh/gallery/a`,
    )
    expect(
      screen.getByRole('button', { name: /GalleryPage\.viewer:linkCopied/ }),
    ).toBeInTheDocument()
  })

  it('recreate carries the prompt into the matching studio', () => {
    const { onClose } = renderViewer(works[2])

    fireEvent.click(
      screen.getByRole('button', { name: /GalleryPage\.viewer:remix/ }),
    )

    expect(sessionStorage.getItem(STUDIO_PREFILL_PROMPT_STORAGE_KEY)).toBe(
      'prompt of c',
    )
    expect(onClose).toHaveBeenCalled()
    expect(push).toHaveBeenCalledWith('/studio/image')
  })
})
