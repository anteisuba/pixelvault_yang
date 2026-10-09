import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'

import type { DanbooruCatalogRequest } from '@/hooks/use-danbooru-catalog'
import type {
  DanbooruCatalog,
  DanbooruFavorite,
} from '@/types/danbooru-catalog'
import type { TagChip } from '@/types/tag-composer'

type Result = {
  data?: DanbooruCatalog
  previous?: DanbooruCatalog
  error: boolean
  loading: boolean
  retry: () => void
}

const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
  update: vi.fn(),
  addWithPrompt: vi.fn(() => 1),
  flash: vi.fn(),
  retry: vi.fn(),
  phone: false,
  chips: [] as TagChip[],
  mode: 'free' as 'free' | 'grid' | null,
  characters: [] as { prompt: string; negativePrompt: string }[],
  activeIndex: null as number | null,
  requests: [] as (DanbooruCatalogRequest | null)[],
  favorites: [] as DanbooruFavorite[],
  toggleFavorite: vi.fn(),
  answer: (() => ({})) as (request: DanbooruCatalogRequest) => Partial<{
    data: unknown
    previous: unknown
    error: boolean
    loading: boolean
  }>,
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}(${Object.values(values).join('|')})` : key,
  useLocale: () => 'en',
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
vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => mocks.phone,
  useIsTablet: () => false,
}))
vi.mock('@/contexts/studio-context', () => ({
  useStudioForm: () => ({
    state: { tagChips: mocks.chips },
    dispatch: mocks.dispatch,
  }),
  useStudioGen: () => ({ isGenerating: false }),
}))
vi.mock('@/hooks/use-novelai-characters', () => ({
  useNovelAiCharacters: () => ({
    mode: mocks.mode,
    max: 6,
    characters: mocks.characters,
    activeIndex: mocks.activeIndex,
    update: mocks.update,
    addWithPrompt: mocks.addWithPrompt,
  }),
}))
vi.mock('@/hooks/use-tag-target-flash', () => ({
  flashTagTarget: mocks.flash,
}))
vi.mock('@/hooks/use-danbooru-catalog', () => ({
  useDanbooruCatalog: (request: DanbooruCatalogRequest | null): Result => {
    mocks.requests.push(request)
    const answer = request ? mocks.answer(request) : {}
    return {
      error: false,
      loading: false,
      retry: mocks.retry,
      ...(answer as Partial<Result>),
    }
  },
}))

vi.mock('@/hooks/use-danbooru-favorites', () => ({
  useDanbooruFavorites: () => ({
    loaded: true,
    of: (kind: string) =>
      mocks.favorites.filter((favorite) => favorite.kind === kind),
    has: (kind: string, name: string) =>
      mocks.favorites.some(
        (favorite) => favorite.kind === kind && favorite.name === name,
      ),
    toggle: mocks.toggleFavorite,
  }),
}))

import { StudioDanbooruPanel } from './StudioDanbooruPanel'

const catalog = (partial: Partial<DanbooruCatalog>): DanbooruCatalog => ({
  candidates: [],
  crossHint: null,
  detail: null,
  ...partial,
})

const miku = catalog({
  candidates: [
    {
      name: 'hatsune_miku',
      count: 152000,
      category: 4,
      work: 'vocaloid',
      previews: ['https://cdn.donmai.us/p1.jpg'],
    },
    {
      name: 'snow_miku',
      count: 5140,
      category: 4,
      work: 'vocaloid',
      previews: [],
    },
  ],
})

const mikuDetail = catalog({
  detail: {
    tag: 'hatsune_miku',
    count: 152000,
    work: 'vocaloid',
    aliases: ['初音ミク'],
    sampleSize: 20,
    traits: [
      { tag: 'twintails', count: 19 },
      { tag: 'aqua_hair', count: 19 },
    ],
    images: [
      {
        id: 7,
        url: 'https://cdn.donmai.us/7s.jpg',
        large: 'https://cdn.donmai.us/7.jpg',
      },
    ],
  },
})

const artists = catalog({
  candidates: [
    {
      name: 'mizuiro_sora',
      count: 1200,
      category: 1,
      work: null,
      previews: ['https://cdn.donmai.us/a1.jpg'],
    },
  ],
})

const artistDetail = catalog({
  detail: {
    tag: 'mizuiro_sora',
    count: 1200,
    work: null,
    aliases: [],
    sampleSize: 20,
    traits: [{ tag: 'flower', count: 11 }],
    images: [],
  },
})

const works = catalog({
  candidates: [
    {
      name: 'genshin_impact',
      count: 90000,
      category: 3,
      work: null,
      previews: [],
    },
  ],
})

const workDetail = catalog({
  detail: {
    tag: 'genshin_impact',
    count: 90000,
    work: null,
    aliases: ['原神'],
    sampleSize: 20,
    traits: [{ tag: 'paimon_(genshin_impact)', count: 9 }],
    images: [],
  },
})

const features = catalog({
  candidates: [
    { name: 'maid', count: 80000, category: 0, work: null, previews: [] },
  ],
})

const featureDetail = catalog({
  detail: {
    tag: 'maid',
    count: 80000,
    work: null,
    aliases: [],
    sampleSize: 20,
    traits: [{ tag: 'maid_headdress', count: 15 }],
    images: [],
  },
})

/** 角色页搜 miku，别的页随便看看，详情各给一份。 */
function answerFixtures(request: DanbooruCatalogRequest) {
  if (request.tag === 'hatsune_miku') return { data: mikuDetail }
  if (request.tag === 'mizuiro_sora') return { data: artistDetail }
  if (request.tag === 'genshin_impact') return { data: workDetail }
  if (request.tag === 'maid') return { data: featureDetail }
  if (request.kind === 'copyright') return { data: works }
  if (request.kind === 'general') return { data: features }
  if (request.kind === 'artist') return { data: artists }
  if (request.query === 'miku') return { data: miku }
  return {}
}

function search(text: string) {
  fireEvent.change(screen.getByRole('searchbox', { name: 'searchCharacter' }), {
    target: { value: text },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.phone = false
  mocks.chips = []
  mocks.mode = 'free'
  mocks.characters = []
  mocks.activeIndex = null
  mocks.requests = []
  mocks.favorites = []
  mocks.answer = answerFixtures
})

describe('查资料 B · 角色', () => {
  it('还没搜：随便看看一批角色，换一批重新抽', () => {
    mocks.answer = (request) =>
      request.kind === 'character' && request.random
        ? request.round === 1
          ? { loading: true, previous: miku }
          : { data: miku }
        : answerFixtures(request)
    render(<StudioDanbooruPanel onClose={vi.fn()} />)
    expect(screen.getByText('randomCharacterTitle(2)')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /^hatsune miku.*rowWork/ }),
    ).toHaveAttribute('aria-current', 'true')
    fireEvent.click(screen.getByRole('button', { name: /reroll/ }))
    expect(screen.getByText('rerolling')).toBeInTheDocument()
    expect(screen.getAllByRole('status', { name: 'loading' })).toHaveLength(2)
  })

  it('点样图就地看大图，原帖链接在大图底下；Esc 只关大图', () => {
    const onClose = vi.fn()
    render(<StudioDanbooruPanel onClose={onClose} />)
    search('miku')
    fireEvent.click(screen.getByRole('button', { name: 'sample(7)' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('img')).toHaveAttribute(
      'src',
      'https://cdn.donmai.us/7.jpg',
    )
    expect(
      within(dialog).getByRole('link', { name: 'openPost' }),
    ).toHaveAttribute('href', 'https://danbooru.donmai.us/posts/7')
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('一搜就选中第一个，右边出详情；角色名默认选上', () => {
    render(<StudioDanbooruPanel onClose={vi.fn()} />)
    search('miku')
    expect(screen.getByText('characterCount(miku|2)')).toBeInTheDocument()
    const first = screen.getByRole('button', { name: /^hatsune miku.*rowWork/ })
    expect(first).toHaveAttribute('aria-current', 'true')
    expect(
      screen.getByRole('button', { name: 'hatsune miku', pressed: true }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /twintails/, pressed: false }),
    ).toBeInTheDocument()
    // 样图用大图，点开 Danbooru 原帖。
    expect(screen.getByRole('img', { name: 'sample(7)' })).toHaveAttribute(
      'src',
      'https://cdn.donmai.us/7.jpg',
    )
    expect(
      mocks.requests.some(
        (request) =>
          request?.tag === 'hatsune_miku' && request.kind === 'character',
      ),
    ).toBe(true)
  })

  it('加到整体：排在画师标签之后，已经在的不重复；按钮说「已加进」', () => {
    mocks.chips = [
      { text: 'artist:sora', weight: 1 },
      { text: 'aqua hair', weight: 1 },
    ]
    render(<StudioDanbooruPanel onClose={vi.fn()} />)
    search('miku')
    fireEvent.click(screen.getByRole('button', { name: /aqua hair/ }))
    fireEvent.click(screen.getByRole('button', { name: 'addTags(2)' }))
    expect(mocks.dispatch).toHaveBeenCalledWith({
      type: 'SET_TAG_CHIPS',
      payload: {
        polarity: 'positive',
        chips: [
          { text: 'artist:sora', weight: 1 },
          { text: 'hatsune miku', weight: 1 },
          { text: 'aqua hair', weight: 1 },
        ],
      },
    })
    expect(
      screen.getByRole('button', { name: 'addedTo(targetWhole)' }),
    ).toBeInTheDocument()
  })

  it('加到角色 1：并进那一位的标签，输入框那一页亮个点', () => {
    mocks.characters = [{ prompt: 'solo', negativePrompt: '' }]
    mocks.activeIndex = 0
    render(<StudioDanbooruPanel onClose={vi.fn()} />)
    search('miku')
    // 默认跟着输入框当前那一页。
    const targets = screen.getByRole('tablist', { name: 'targetsLabel' })
    expect(
      within(targets).getByRole('tab', { name: 'characterNumber(1)' }),
    ).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'addTags(1)' }))
    expect(mocks.update).toHaveBeenCalledWith(0, {
      prompt: 'hatsune miku, solo',
    })
    expect(mocks.flash).toHaveBeenCalledWith(0)
  })

  it('＋新角色：带着标签建一位，之后接着加到它', () => {
    render(<StudioDanbooruPanel onClose={vi.fn()} />)
    search('miku')
    fireEvent.click(screen.getByRole('tab', { name: 'targetNew' }))
    fireEvent.click(screen.getByRole('button', { name: 'addTags(1)' }))
    expect(mocks.addWithPrompt).toHaveBeenCalledWith('hatsune miku')
    expect(mocks.flash).toHaveBeenCalledWith(1)
  })

  it('模型没有角色构图：只剩整体，不给灰按钮', () => {
    mocks.mode = null
    render(<StudioDanbooruPanel onClose={vi.fn()} />)
    search('miku')
    expect(
      screen.queryByRole('tablist', { name: 'targetsLabel' }),
    ).not.toBeInTheDocument()
    expect(screen.getByText(/noComposition/)).toBeInTheDocument()
  })

  it('角色页查不到、其实是画师：说出来并带着同一个词去画风页', () => {
    mocks.answer = (request) =>
      request.kind === 'character' && request.query === 'fukemachi'
        ? {
            data: catalog({
              crossHint: { kind: 'artist', name: 'fukemachi', count: 260 },
            }),
          }
        : answerFixtures(request)
    render(<StudioDanbooruPanel onClose={vi.fn()} />)
    search('fukemachi')
    expect(
      screen.getByText('crossTitle(tabCharacter|fukemachi)'),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'goPage(tabStyle)' }))
    expect(screen.getByRole('tab', { name: 'tabStyle' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(
      mocks.requests.some(
        (request) =>
          request?.kind === 'artist' && request.query === 'fukemachi',
      ),
    ).toBe(true)
  })

  it('两边都查不到：给 Danbooru 直链', () => {
    mocks.answer = () => ({ data: catalog({}) })
    render(<StudioDanbooruPanel onClose={vi.fn()} />)
    search('zzqx')
    expect(screen.getByText('noneTitle(zzqx)')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /searchDanbooru/ }),
    ).toHaveAttribute(
      'href',
      'https://danbooru.donmai.us/tags?search%5Bname_matches%5D=*zzqx*',
    )
  })

  it('Danbooru 访问不了：和查不到分开说，给重试', () => {
    mocks.answer = () => ({ error: true })
    render(<StudioDanbooruPanel onClose={vi.fn()} />)
    search('miku')
    expect(screen.getByText('errorTitle')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /retry/ }))
    expect(mocks.retry).toHaveBeenCalled()
  })

  it('换词重搜：旧列表原地留着，⛔ 不刷成骨架', () => {
    mocks.answer = (request) =>
      request.query === 'mik'
        ? { loading: true, previous: miku }
        : answerFixtures(request)
    render(<StudioDanbooruPanel onClose={vi.fn()} />)
    search('mik')
    expect(
      screen.getByRole('button', { name: /^hatsune miku.*rowWork/ }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('status', { name: 'loading' })).toBeNull()
  })

  it('第一次搜、还没结果：左右都是骨架', () => {
    mocks.answer = (request) =>
      request.query === 'miku' ? { loading: true } : answerFixtures(request)
    render(<StudioDanbooruPanel onClose={vi.fn()} />)
    search('miku')
    expect(screen.getAllByRole('status', { name: 'loading' })).toHaveLength(2)
  })
})

describe('查资料 B · 画风', () => {
  it('随便看看；加入 = artist:名字 放最前，再点撤回', () => {
    mocks.chips = [{ text: '1girl', weight: 1 }]
    const { rerender } = render(<StudioDanbooruPanel onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('tab', { name: 'tabStyle' }))
    expect(
      mocks.requests.some(
        (request) => request?.kind === 'artist' && request.random,
      ),
    ).toBe(true)
    expect(screen.getByText('randomTitle(1)')).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: 'addArtist(artist:mizuiro sora)' }),
    )
    expect(mocks.dispatch).toHaveBeenLastCalledWith({
      type: 'SET_TAG_CHIPS',
      payload: {
        polarity: 'positive',
        chips: [
          { text: 'artist:mizuiro sora', weight: 1 },
          { text: '1girl', weight: 1 },
        ],
      },
    })
    // 已经在正向标签里：按钮是「已加入」、左栏行尾标出来，再点就拿掉。
    mocks.chips = [
      { text: 'artist:mizuiro sora', weight: 1 },
      { text: '1girl', weight: 1 },
    ]
    rerender(<StudioDanbooruPanel onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'artistAdded' }))
    expect(mocks.dispatch).toHaveBeenLastCalledWith({
      type: 'SET_TAG_CHIPS',
      payload: { polarity: 'positive', chips: [{ text: '1girl', weight: 1 }] },
    })
  })

  it('换一批：整批换掉，左右都是骨架', () => {
    mocks.answer = (request) =>
      request.random && request.round === 1
        ? { loading: true, previous: artists }
        : answerFixtures(request)
    render(<StudioDanbooruPanel onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('tab', { name: 'tabStyle' }))
    fireEvent.click(screen.getByRole('button', { name: /reroll/ }))
    expect(screen.getByText('rerolling')).toBeInTheDocument()
    expect(screen.getAllByRole('status', { name: 'loading' })).toHaveLength(2)
  })

  it('「常画的」只是参考，不是按钮', () => {
    render(<StudioDanbooruPanel onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('tab', { name: 'tabStyle' }))
    expect(screen.getByText('flower')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /flower/ })).toBeNull()
  })
})

describe('查资料 · 作品 / 特征', () => {
  it('没点过的页不查；点开作品页才随便看看', () => {
    render(<StudioDanbooruPanel onClose={vi.fn()} />)
    expect(
      mocks.requests.some((request) => request?.kind === 'copyright'),
    ).toBe(false)
    fireEvent.click(screen.getByRole('tab', { name: 'tabWork' }))
    expect(
      mocks.requests.some(
        (request) => request?.kind === 'copyright' && request.random,
      ),
    ).toBe(true)
    expect(screen.getByText('randomWorkTitle(1)')).toBeInTheDocument()
  })

  it('作品：作品名默认选上，点一个角色一起加进整体', () => {
    render(<StudioDanbooruPanel onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('tab', { name: 'tabWork' }))
    fireEvent.click(screen.getByRole('button', { name: /paimon/ }))
    fireEvent.click(screen.getByRole('button', { name: 'addTags(2)' }))
    expect(mocks.dispatch).toHaveBeenLastCalledWith({
      type: 'SET_TAG_CHIPS',
      payload: {
        polarity: 'positive',
        chips: [
          { text: 'genshin impact', weight: 1 },
          { text: 'paimon (genshin impact)', weight: 1 },
        ],
      },
    })
  })

  it('特征：常一起出现的可以点选，切页回来选中项还在', () => {
    render(<StudioDanbooruPanel onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('tab', { name: 'tabFeature' }))
    expect(screen.getByText('randomFeatureTitle(1)')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /maid headdress/ }))
    fireEvent.click(screen.getByRole('tab', { name: 'tabWork' }))
    fireEvent.click(screen.getByRole('tab', { name: 'tabFeature' }))
    expect(
      screen.getByRole('button', { name: 'addTags(2)' }),
    ).toBeInTheDocument()
  })
})

describe('查资料 · 收藏', () => {
  const snowMiku: DanbooruFavorite = {
    id: 'fav_1',
    kind: 'character',
    name: 'snow_miku',
    count: 5140,
    work: 'vocaloid',
    previews: [],
    createdAt: '2026-09-28T00:00:00.000Z',
  }

  it('收藏页按类别分段，默认选中第一条并出它的详情', () => {
    mocks.favorites = [
      snowMiku,
      {
        ...snowMiku,
        id: 'fav_2',
        kind: 'artist',
        name: 'mizuiro_sora',
        work: null,
      },
    ]
    render(<StudioDanbooruPanel onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('tab', { name: 'tabFavorites' }))
    expect(
      screen.getByText('favoritesSection(kindCharacter|1)'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('favoritesSection(kindArtist|1)'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/favoritesSection\(kindWork/)).toBeNull()
    expect(screen.getByRole('button', { name: /^snow miku/ })).toHaveAttribute(
      'aria-current',
      'true',
    )
    expect(
      mocks.requests.some(
        (request) =>
          request?.kind === 'character' && request.tag === 'snow_miku',
      ),
    ).toBe(true)
  })

  it('收藏页点一个画师：右边换成画师详情', () => {
    mocks.favorites = [
      snowMiku,
      { ...snowMiku, id: 'fav_2', kind: 'artist', name: 'mizuiro_sora' },
    ]
    render(<StudioDanbooruPanel onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('tab', { name: 'tabFavorites' }))
    fireEvent.click(
      screen.getByRole('button', { name: /^artist:mizuiro sora/ }),
    )
    expect(
      screen.getByRole('button', { name: 'addArtist(artist:mizuiro sora)' }),
    ).toBeInTheDocument()
  })

  it('没有收藏：说怎么收', () => {
    render(<StudioDanbooruPanel onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('tab', { name: 'tabFavorites' }))
    expect(screen.getByText('favoritesEmpty')).toBeInTheDocument()
  })

  it('其余四页不再置顶收藏', () => {
    mocks.favorites = [snowMiku]
    render(<StudioDanbooruPanel onClose={vi.fn()} />)
    expect(screen.queryByText(/favoritesSection/)).toBeNull()
  })

  it('点星收藏这一条：存左栏那一行的快照', () => {
    render(<StudioDanbooruPanel onClose={vi.fn()} />)
    search('miku')
    const star = screen.getByRole('button', {
      name: 'favorite(hatsune miku)',
    })
    expect(star).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(star)
    expect(mocks.toggleFavorite).toHaveBeenCalledWith({
      kind: 'character',
      name: 'hatsune_miku',
      count: 152000,
      work: 'vocaloid',
      previews: ['https://cdn.donmai.us/p1.jpg'],
    })
  })

  it('已收藏的星是按下的，文案是取消收藏', () => {
    mocks.favorites = [{ ...snowMiku, name: 'hatsune_miku' }]
    render(<StudioDanbooruPanel onClose={vi.fn()} />)
    search('miku')
    expect(
      screen.getByRole('button', { name: 'unfavorite(hatsune miku)' }),
    ).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('查资料 B · 手机', () => {
  it('列表一页，点一行推进详情，‹ 回到候选', async () => {
    mocks.phone = true
    Element.prototype.scrollIntoView = vi.fn()
    render(<StudioDanbooruPanel onClose={vi.fn()} />)
    search('miku')
    expect(screen.getByText('pickHint')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'addTags(1)' }),
    ).not.toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: /^hatsune miku.*rowWork/ }),
    )
    expect(
      await screen.findByRole('button', { name: 'addTags(1)' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'hatsune miku' })).toHaveFocus()
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
      block: 'start',
    })
    expect(
      vi.mocked(Element.prototype.scrollIntoView).mock.contexts.at(-1),
    ).toBe(screen.getByRole('region', { name: 'title' }))
    // 手机上说短一点（画板 LkFPhone）。
    expect(screen.getByText('tagsHintPhone')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'backToList' }))
    expect(
      await screen.findByRole('searchbox', { name: 'searchCharacter' }),
    ).toBeInTheDocument()
  })
})

it('Esc 关掉面板', () => {
  const onClose = vi.fn()
  render(<StudioDanbooruPanel onClose={onClose} />)
  fireEvent.keyDown(
    screen.getByRole('searchbox', { name: 'searchCharacter' }),
    {
      key: 'Escape',
    },
  )
  expect(onClose).toHaveBeenCalled()
})
