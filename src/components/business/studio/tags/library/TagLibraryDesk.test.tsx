import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import type { DanbooruCatalogRequest } from '@/hooks/use-danbooru-catalog'
import type { DanbooruCatalogCandidate } from '@/types/danbooru-catalog'

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  setView: vi.fn(),
  params: {
    favoritesView: false,
    kind: 'character' as const,
    query: '',
    tag: null as string | null,
    of: null as string | null,
  },
  pages: [] as DanbooruCatalogCandidate[],
  requests: [] as (DanbooruCatalogRequest | null)[],
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}(${Object.values(values).join('|')})` : key,
  useLocale: () => 'zh',
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
vi.mock('./tag-library-params', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./tag-library-params')>()),
  useTagLibraryParams: () => ({
    ...mocks.params,
    navigate: mocks.navigate,
    setView: mocks.setView,
  }),
}))
vi.mock('@/contexts/studio-library-pick', () => ({
  useStudioLibraryPick: () => ({ tags: null }),
}))
vi.mock('@/hooks/use-danbooru-favorites', () => ({
  useDanbooruFavorites: () => ({
    loaded: true,
    of: () => [],
    has: () => false,
    toggle: vi.fn(),
  }),
}))
vi.mock('@/hooks/use-danbooru-tag-library', () => ({
  useDanbooruTagPages: () => ({
    items: mocks.pages,
    loading: false,
    error: false,
    done: true,
    loadMore: vi.fn(),
    retry: vi.fn(),
  }),
  useDanbooruTagPreview: () => ({
    previews: ['https://cdn.donmai.us/p.jpg'],
    work: 'vocaloid',
  }),
}))
vi.mock('@/hooks/use-near-viewport', () => ({
  useNearViewport: () => ({ setNode: () => {}, isNearViewport: true }),
}))
vi.mock('@/hooks/use-danbooru-catalog', () => ({
  useDanbooruCatalog: (request: DanbooruCatalogRequest | null) => {
    mocks.requests.push(request)
    return { error: false, loading: true, retry: vi.fn() }
  },
}))
vi.mock('../lookup/LookupDetailPane', () => ({
  LookupDetailPane: ({ candidate }: { candidate: { name: string } }) => (
    <div data-testid="detail">{candidate.name}</div>
  ),
}))
vi.mock('@/components/ui/library-kit', () => ({
  LibraryRail: ({ children }: { children: ReactNode }) => <nav>{children}</nav>,
  LibraryRailRow: ({
    label,
    onSelect,
  }: {
    label: string
    onSelect: () => void
  }) => (
    <button type="button" onClick={onSelect}>
      {label}
    </button>
  ),
  LibraryToolbar: ({ search }: { search: ReactNode }) => <div>{search}</div>,
  LibrarySearch: ({
    value,
    onChange,
    label,
  }: {
    value: string
    onChange: (value: string) => void
    label: string
  }) => (
    <input
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}))

import { TagLibraryDesk } from './TagLibraryDesk'

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
    mocks.navigate.mockReset()
    mocks.requests.length = 0
    mocks.params.tag = null
    mocks.params.of = null
    mocks.pages = [
      candidate('hatsune_miku', '初音未来'),
      candidate('kagamine_rin', null),
    ]
  })

  it('一行一个：名字去下划线，灰字写中文名 · 作品 · 张数；不点就详情看第一个', () => {
    render(<TagLibraryDesk />)

    const rows = screen.getAllByRole('button', {
      name: /hatsune miku|kagamine rin/,
    })
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('初音未来 · rowWork(vocaloid|')
    expect(rows[0]).toHaveAttribute('aria-current', 'true')
    expect(screen.getByTestId('detail')).toHaveTextContent('hatsune_miku')
    expect(mocks.requests).toContainEqual({
      tag: 'hatsune_miku',
      kind: 'character',
    })
  })

  it('点一行 = 地址里记下它（刷新回到原处）', () => {
    render(<TagLibraryDesk />)
    fireEvent.click(screen.getByRole('button', { name: /kagamine rin/ }))
    expect(mocks.navigate).toHaveBeenCalledWith({
      tag: 'kagamine_rin',
      of: 'character',
    })
  })

  it('地址里记着的那一个就是选中的', () => {
    mocks.params.tag = 'kagamine_rin'
    mocks.params.of = 'character'
    render(<TagLibraryDesk />)
    expect(
      screen.getByRole('button', { name: /kagamine rin/ }),
    ).toHaveAttribute('aria-current', 'true')
    expect(screen.getByTestId('detail')).toHaveTextContent('kagamine_rin')
  })
})
