import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'

import type { DanbooruCatalogCandidate } from '@/types/danbooru-catalog'
import { renderWithApp } from '@/test/app-harness'

import { TagLibraryDesk } from './TagLibraryDesk'
import { TAG_LIBRARY_PARAM } from './tag-library-params'

/**
 * 全程真 hook：真 `useTagLibraryParams`（读地址栏、`router.replace` 写回）、真分页 /
 * 预览 / 详情 / 收藏 hook、真 library-kit。只假 api-client 那两跳与地址栏。
 */

const nav = vi.hoisted(() => ({ query: '', replace: vi.fn() }))
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useSearchParams: () => new URLSearchParams(nav.query),
}))
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/library/tags',
  useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
}))
vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: 'user-a' }),
}))
vi.mock('motion/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('motion/react')>()),
  useReducedMotion: () => true,
}))
vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}))

const catalog = vi.hoisted(() => ({
  pages: [] as unknown[],
  api: vi.fn(),
}))
vi.mock('@/lib/api-client/danbooru-catalog', () => ({
  getDanbooruCatalogAPI: catalog.api,
}))
vi.mock('@/lib/api-client/danbooru-favorites', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/lib/api-client/danbooru-favorites')
  >()),
  listDanbooruFavoritesAPI: async () => [],
}))

const candidate = (
  name: string,
  zh: string | null,
): DanbooruCatalogCandidate => ({
  name,
  count: 1200,
  category: 4,
  work: null,
  previews: [],
  zh,
  ja: null,
})

describe('TagLibraryDesk（ui-spec §9 ㊴ 左列表 + 右详情）', () => {
  beforeEach(() => {
    nav.query = ''
    nav.replace.mockReset()
    const pages = [
      candidate('hatsune_miku', '初音未来'),
      candidate('kagamine_rin', null),
    ]
    // 列表一页回这两位；预览回作品 vocaloid；详情那一跳按 tag 回那一位。
    catalog.api.mockReset()
    catalog.api.mockImplementation(
      async (query: { page?: number; preview?: string; tag?: string }) => {
        if (query.page) return { candidates: pages, nextPage: null }
        if (query.preview)
          return {
            candidates: [
              {
                ...candidate(query.tag!, null),
                work: 'vocaloid',
                previews: ['https://cdn.donmai.us/p.jpg'],
              },
            ],
          }
        return {
          candidates: pages.filter((item) => item.name === query.tag),
          nextPage: null,
        }
      },
    )
  })
  afterEach(() => vi.unstubAllGlobals())

  const rows = () =>
    screen.findAllByRole('button', { name: /hatsune miku|kagamine rin/ })

  it('一行一个：名字去下划线，灰字写中文名 · 作品 · 张数；不点就详情看第一个', async () => {
    renderWithApp(<TagLibraryDesk />)

    const list = await rows()
    expect(list).toHaveLength(2)
    expect(list[0]).toHaveTextContent('初音未来')
    // 作品是逐行预览那一跳拉回来的。
    await waitFor(() => expect(list[0]).toHaveTextContent('vocaloid'))
    expect(list[0]).toHaveAttribute('aria-current', 'true')
    // 详情那一栏去拉第一个的详情。
    await waitFor(() =>
      expect(catalog.api).toHaveBeenCalledWith(
        expect.objectContaining({ tag: 'hatsune_miku', kind: 'character' }),
        expect.anything(),
      ),
    )
  })

  it('点一行 = 地址里记下它（刷新回到原处）', async () => {
    renderWithApp(<TagLibraryDesk />)
    await rows()
    fireEvent.click(screen.getByRole('button', { name: /kagamine rin/ }))
    const [url] = nav.replace.mock.lastCall!
    const params = new URL(url as string, 'https://x.test').searchParams
    expect(params.get(TAG_LIBRARY_PARAM.tag)).toBe('kagamine_rin')
    expect(params.get(TAG_LIBRARY_PARAM.of)).toBe('character')
  })

  it('地址里记着的那一个就是选中的', async () => {
    nav.query = `${TAG_LIBRARY_PARAM.tag}=kagamine_rin&${TAG_LIBRARY_PARAM.of}=character`
    renderWithApp(<TagLibraryDesk />)
    await rows()
    expect(
      screen.getByRole('button', { name: /kagamine rin/ }),
    ).toHaveAttribute('aria-current', 'true')
    await waitFor(() =>
      expect(catalog.api).toHaveBeenCalledWith(
        expect.objectContaining({ tag: 'kagamine_rin', kind: 'character' }),
        expect.anything(),
      ),
    )
  })
})
