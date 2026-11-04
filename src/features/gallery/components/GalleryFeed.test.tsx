/**
 * L2b：公开画廊连真 `useGallery`（真筛选、真翻页、真缓存），只假网络（`/api/images`）。
 * 断言界面上的字、发出去的请求带了什么筛选、地址栏同步成什么。
 */
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { GalleryFeed } from '@/features/gallery/components/GalleryFeed'
import type { GalleryFilters } from '@/hooks/use-gallery'
import { clearGalleryCache } from '@/lib/gallery-cache'
import { FAKE_GENERATION } from '@/test/api-helpers'
import { fakeServer, message, renderWithApp } from '@/test/app-harness'
import type { GenerationRecord } from '@/types'

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
  useRouter: () => ({ push: vi.fn() }),
}))

const en = (path: string) => message(path, 'en')

const DEFAULT_FILTERS: GalleryFilters = {
  search: '',
  models: [],
  sort: 'newest',
  types: [],
  timeRange: 'all',
  liked: false,
  published: false,
  projectId: '',
  provider: '',
}

function work(id: string): GenerationRecord {
  return {
    ...FAKE_GENERATION,
    id,
    prompt: `prompt of ${id}`,
    isPromptPublic: true,
    model: 'someone-elses-model',
    likeCount: 0,
    isLiked: false,
  } as GenerationRecord
}

type Reply = {
  status?: number
  generations?: GenerationRecord[]
  hasMore?: boolean
}

/** `/api/images` 的每一发请求按顺序领一个回答；`hold()` 让它悬着直到 `release`。 */
function galleryServer() {
  const queries: URLSearchParams[] = []
  const replies: Array<Reply | Promise<Reply>> = []
  fakeServer().on('GET', '/api/images', async (request) => {
    queries.push(request.nextUrl.searchParams)
    const reply = await (replies.shift() ?? { generations: [] })
    if (reply.status && reply.status >= 400) {
      return Response.json(
        { success: false, error: 'boom' },
        { status: reply.status },
      )
    }
    const generations = reply.generations ?? []
    return Response.json({
      success: true,
      data: {
        generations,
        page: Number(request.nextUrl.searchParams.get('page')),
        limit: 24,
        total: generations.length,
        hasMore: reply.hasMore ?? false,
        nextCursor: reply.hasMore ? 'next' : null,
      },
    })
  })
  return {
    queries,
    reply(value: Reply) {
      replies.push(value)
    },
    hold() {
      let release!: (value: Reply) => void
      replies.push(new Promise<Reply>((resolve) => (release = resolve)))
      return (value: Reply) => act(async () => release(value))
    },
  }
}

/** 无限滚动的哨兵：测试里手动「滚到底」。 */
let reachBottom: () => void = () => {}

function renderFeed(
  initial: {
    generations?: GenerationRecord[]
    hasMore?: boolean
    filters?: Partial<GalleryFilters>
  } = {},
) {
  const generations = initial.generations ?? []
  return renderWithApp(
    <GalleryFeed
      initialGenerations={generations}
      initialPage={1}
      initialHasMore={initial.hasMore ?? false}
      initialNextCursor={initial.hasMore ? 'c1' : null}
      total={generations.length}
      initialFilters={{ ...DEFAULT_FILTERS, ...initial.filters }}
    />,
    { locale: 'en' },
  )
}

beforeEach(() => {
  clearGalleryCache()
  window.history.pushState(null, '', '/zh/gallery')
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback) {
        reachBottom = () =>
          act(() =>
            callback(
              [{ isIntersecting: true } as IntersectionObserverEntry],
              this as never,
            ),
          )
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  Element.prototype.scrollIntoView = vi.fn()
})

afterEach(() => vi.unstubAllGlobals())

/** 画廊顶上那排类型标签（ui-spec §9：全部 · 图片 · 视频 · 音频 · 3D）。 */
function pickVideos() {
  fireEvent.click(
    screen.getByRole('tab', { name: en('GalleryPage.filters.type.video') }),
  )
}

describe('GalleryFeed', () => {
  it('换筛选时：地址栏同步、请求带上筛选、加载中是静止灰块（不是空态），回来空的才出空态', async () => {
    const server = galleryServer()
    const release = server.hold()
    renderFeed({ generations: [work('a')] })

    pickVideos()

    expect(window.location.pathname + window.location.search).toBe(
      '/zh/gallery?type=video',
    )
    await waitFor(() => expect(server.queries).toHaveLength(1))
    expect(server.queries[0]!.get('type')).toBe('video')
    const skeleton = screen.getByTestId('gallery-skeleton')
    expect(skeleton.querySelector('.animate-pulse')).toBeNull()
    expect(
      screen.queryByText(en('GalleryPage.emptyTitle')),
    ).not.toBeInTheDocument()

    await release({ generations: [] })
    expect(
      await screen.findByText(en('GalleryPage.emptyTitle')),
    ).toBeInTheDocument()
  })

  it('整页拉失败走统一错误模板，点重试再拉一次', async () => {
    const server = galleryServer()
    server.reply({ status: 500 })
    server.reply({ generations: [work('b')] })
    renderFeed({ generations: [work('a')] })

    pickVideos()

    expect(
      await screen.findByTestId('empty-state-error-dot'),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: en('Feedback.retry') }))
    await waitFor(() =>
      expect(
        screen.queryByTestId('empty-state-error-dot'),
      ).not.toBeInTheDocument(),
    )
    expect(server.queries).toHaveLength(2)
    expect(server.queries[1]!.get('type')).toBe('video')
  })

  it('滚到底接着拉：拉的时候尾巴是灰块，失败一行字 + 重试，拉完到底一行收尾', async () => {
    const server = galleryServer()
    const releaseFirst = server.hold()
    renderFeed({ generations: [work('a')], hasMore: true })

    reachBottom()
    expect(await screen.findByTestId('feed-tail-loading')).toBeInTheDocument()
    expect(server.queries[0]!.get('cursor')).toBe('c1')

    await releaseFirst({ status: 500 })
    expect(await screen.findByRole('alert')).toHaveTextContent(
      en('Feedback.batchFailed'),
    )
    // 已经在屏上的那张不动
    expect(
      screen.getAllByRole('link', { name: en('GalleryCard.openImage') }),
    ).toHaveLength(1)

    server.reply({ generations: [work('b')], hasMore: false })
    fireEvent.click(screen.getByRole('button', { name: en('Feedback.retry') }))

    expect(
      await screen.findByText(en('Feedback.endOfList')),
    ).toBeInTheDocument()
    expect(
      screen.getAllByRole('link', { name: en('GalleryCard.openImage') }),
    ).toHaveLength(2)
  })

  it('只有一个公开画廊的大标题', () => {
    galleryServer()
    renderFeed()

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: en('GalleryPage.feedEyebrow'),
      }),
    ).toBeInTheDocument()
  })

  it('点「全部」连旧链接带进来的筛选一起清掉：地址栏回到干净的、按无筛选重拉', async () => {
    const server = galleryServer()
    server.reply({ generations: [work('a')] })
    renderFeed({
      filters: { types: ['video'], models: ['some-model'], timeRange: 'week' },
    })

    expect(screen.getByText(en('GalleryPage.emptyTitle'))).toBeInTheDocument()
    expect(
      screen.getByRole('tab', { name: en('GalleryPage.filters.type.video') }),
    ).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(
      screen.getByRole('tab', { name: en('GalleryPage.filters.tabs.all') }),
    )

    expect(window.location.pathname + window.location.search).toBe(
      '/zh/gallery',
    )
    await waitFor(() => expect(server.queries).toHaveLength(1))
    expect(server.queries[0]!.get('type')).toBeNull()
    expect(
      await screen.findAllByRole('link', { name: en('GalleryCard.openImage') }),
    ).toHaveLength(1)
  })

  it('点卡就地打开查看器、页面不滚；换筛选就把查看器放下', async () => {
    const server = galleryServer()
    server.reply({ generations: [] })
    renderFeed({ generations: [work('a'), work('b')] })

    fireEvent.click(
      screen.getAllByRole('link', { name: en('GalleryCard.openImage') })[0]!,
    )

    expect(
      screen.getByRole('dialog', { name: en('GalleryPage.viewer.label') }),
    ).toBeInTheDocument()
    expect(screen.getAllByText('prompt of a').length).toBeGreaterThan(0)
    expect(document.documentElement.style.overflow).toBe('hidden')

    fireEvent.click(
      screen.getByRole('button', {
        name: en('GalleryPage.filters.tabs.favorites'),
      }),
    )
    await waitFor(() => expect(server.queries).toHaveLength(1))
    expect(server.queries[0]!.get('liked')).toBe('1')
    expect(
      screen.queryByRole('dialog', { name: en('GalleryPage.viewer.label') }),
    ).not.toBeInTheDocument()
    expect(document.documentElement.style.overflow).toBe('')
  })
})
