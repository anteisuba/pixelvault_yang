import { act, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { API_ENDPOINTS } from '@/constants/config'
import { AI_MODELS } from '@/constants/models'
import { STUDIO_GUIDE_SEEN_STORAGE_KEY } from '@/constants/studio'
import type {
  DanbooruCatalog,
  DanbooruFavorite,
} from '@/types/danbooru-catalog'
import type { NovelAiCharacterLayout } from '@/types/novelai'
import { useTagTargetFlash } from '@/hooks/use-tag-target-flash'
import { queryClient } from '@/lib/query-client'
import { compactPostCount } from '@/lib/tag-lookup'
import { stubBrowserLayout } from '@/test/browser-stubs'
import { text } from '@/test/i18n-text'
import {
  fakeStudioServer,
  renderWithStudio,
  type StudioHandle,
} from '@/test/studio-harness'
import { DESKTOP_WIDTH, MOBILE_WIDTH, setViewportWidth } from '@/test/viewport'

import { StudioDanbooruPanel } from './StudioDanbooruPanel'

/**
 * 查资料面板，全程真的：真 `useDanbooruCatalog`（真去抖、真「旧列表留着」）、真
 * `useDanbooruFavorites`（真乐观收藏）、真 `useTagLookupAdder` 往真工作台里加标签、真
 * 角色构图；只假网络（`GET /api/danbooru/catalog` 按问法回 fixture、收藏增删查）、屏宽、
 * 时钟。动效按「减少动效」跑（外部包 `motion/react` 的偏好开关），换场不用等。
 *
 * ⚠ 原「模型没有角色构图：只剩整体」没有迁：这块面板只挂在标签台，标签台只上架
 * NovelAI（四个型号都能角色构图），真页面上到不了。
 */

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: 'user-lookup' }),
}))
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/studio/image/tags',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/studio/image/tags',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('motion/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('motion/react')>()),
  useReducedMotion: () => true,
}))

const L = (key: string, values?: Record<string, string | number>) =>
  text(`StudioTags.lookup.${key}`, values)
const ok = (data: unknown) => Response.json({ success: true, data })

const catalog = (partial: Partial<DanbooruCatalog>): DanbooruCatalog => ({
  candidates: [],
  crossHint: null,
  nextPage: null,
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
    kind: 'character',
    wiki: null,
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
    kind: 'artist',
    wiki: null,
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
    kind: 'copyright',
    wiki: null,
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
    kind: 'general',
    wiki: null,
    count: 80000,
    work: null,
    aliases: [],
    sampleSize: 20,
    traits: [{ tag: 'maid_headdress', count: 15 }],
    images: [],
  },
})

/** 服务端收到的一次查资料（URL 上的那几个参数）。 */
type Ask = { kind?: string; query?: string; tag?: string; random?: string }
/** 一次问法回什么：`'hang'` = 一直没回来；`'fail'` = 上游挂了（502）。 */
type Reply = DanbooruCatalog | 'hang' | 'fail'

/** 角色页搜 miku，别的页随便看看，详情各给一份。 */
function fixtures(ask: Ask): DanbooruCatalog {
  if (ask.tag === 'hatsune_miku') return mikuDetail
  if (ask.tag === 'mizuiro_sora') return artistDetail
  if (ask.tag === 'genshin_impact') return workDetail
  if (ask.tag === 'maid') return featureDetail
  if (ask.kind === 'copyright') return works
  if (ask.kind === 'general') return features
  if (ask.kind === 'artist') return artists
  if (ask.query === 'miku' || ask.random) return miku
  return catalog({})
}

let asks: Ask[]
let reply: (ask: Ask, nth: number) => Reply
let favorites: DanbooruFavorite[]
let favoritePosts: unknown[]

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  stubBrowserLayout()
  setViewportWidth(DESKTOP_WIDTH)
  localStorage.setItem(STUDIO_GUIDE_SEEN_STORAGE_KEY, '1')
  Element.prototype.scrollIntoView = vi.fn()
  queryClient.clear()
  asks = []
  reply = (ask) => fixtures(ask)
  favorites = []
  favoritePosts = []
  fakeStudioServer()
    .on('GET', API_ENDPOINTS.DANBOORU_CATALOG, (request) => {
      const ask = Object.fromEntries(request.nextUrl.searchParams) as Ask
      asks.push(ask)
      const answer = reply(
        ask,
        asks.filter((other) => JSON.stringify(other) === JSON.stringify(ask))
          .length,
      )
      if (answer === 'hang') return new Promise<Response>(() => {})
      if (answer === 'fail')
        return Response.json(
          { success: false, error: 'UPSTREAM_ERROR' },
          { status: 502 },
        )
      return ok(answer)
    })
    .on('GET', API_ENDPOINTS.DANBOORU_FAVORITES, () => ok(favorites))
    .on('POST', API_ENDPOINTS.DANBOORU_FAVORITES, async (request) => {
      const body = await request.json()
      favoritePosts.push(body)
      return ok({ ...body, id: 'fav_new', createdAt: '2026-11-01T00:00:00Z' })
    })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/** 跑完请求与去抖（打字停手 300ms 才查）。 */
const tick = (ms = 0) => act(() => vi.advanceTimersByTimeAsync(ms))

type Character = NovelAiCharacterLayout['characters'][number]
const person = (prompt: string): Character => ({
  prompt,
  negativePrompt: '',
  position: { x: 0.5, y: 0.5 },
})

/** 查资料「加到角色 N」之后输入框那一页亮的点（真 store）。 */
function FlashProbe() {
  const flashing = useTagTargetFlash()
  return <output data-testid="flash">{flashing ?? ''}</output>
}

/** 真标签台（NovelAI V5）里打开查资料：摆好整体标签 / 角色 / 正在编辑谁。 */
async function renderPanel({
  onClose = vi.fn(),
  tags = [] as string[],
  characters = [] as Character[],
  active = null as number | null,
} = {}) {
  const view = renderWithStudio(
    <>
      <FlashProbe />
      <StudioDanbooruPanel onClose={onClose} />
    </>,
  )
  act(() => {
    const { dispatch } = view.studio.current
    dispatch({ type: 'SET_PROMPT_DIALECT', payload: 'tags' })
    dispatch({
      type: 'SET_OPTION_ID',
      payload: `workspace:${AI_MODELS.NOVELAI_V5_FULL}`,
    })
  })
  act(() => {
    const { dispatch, state } = view.studio.current
    if (characters.length)
      dispatch({
        type: 'SET_ADVANCED_PARAMS',
        payload: {
          ...state.advancedParams,
          novelAiLayout: { positioning: 'auto', characters },
        },
      })
  })
  act(() => {
    const { dispatch } = view.studio.current
    dispatch({
      type: 'SET_TAG_CHIPS',
      payload: {
        polarity: 'positive',
        chips: tags.map((tag) => ({ text: tag, weight: 1 })),
      },
    })
    dispatch({ type: 'SET_ACTIVE_TAG_CHARACTER', payload: active })
  })
  await tick()
  return view.studio as { current: StudioHandle }
}

const tagsOf = (studio: { current: StudioHandle }) =>
  studio.current.state.tagChips.map((chip) => chip.text)

async function search(value: string) {
  fireEvent.change(
    screen.getByRole('searchbox', { name: L('searchCharacter') }),
    {
      target: { value },
    },
  )
  await tick(300)
  await tick()
}

async function openTab(name: string) {
  fireEvent.click(screen.getByRole('tab', { name }))
  await tick()
  await tick()
}

const mikuRow = () =>
  screen.getByRole('button', { name: /^hatsune miku.*vocaloid/ })

describe('查资料 B · 角色', () => {
  it('还没搜：随便看看一批角色，换一批整批重抽（左右都是骨架）', async () => {
    await renderPanel()
    expect(
      screen.getByText(L('randomCharacterTitle', { count: 2 })),
    ).toBeInTheDocument()
    expect(mikuRow()).toHaveAttribute('aria-current', 'true')

    reply = (ask) => (ask.random ? 'hang' : fixtures(ask))
    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(L('reroll')) }),
    )
    await tick()
    expect(screen.getByText(L('rerolling'))).toBeInTheDocument()
    expect(screen.getAllByRole('status', { name: L('loading') })).toHaveLength(
      2,
    )
    expect(
      asks.filter((ask) => ask.kind === 'character' && ask.random),
    ).toHaveLength(2)
  })

  it('点样图就地看大图，原帖链接在大图底下；Esc 只关大图', async () => {
    const onClose = vi.fn()
    await renderPanel({ onClose })
    await search('miku')
    fireEvent.click(
      screen.getByRole('button', { name: L('sample', { id: 7 }) }),
    )
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('img')).toHaveAttribute(
      'src',
      'https://cdn.donmai.us/7.jpg',
    )
    expect(
      within(dialog).getByRole('link', { name: L('openPost') }),
    ).toHaveAttribute('href', 'https://danbooru.donmai.us/posts/7')
    fireEvent.keyDown(dialog, { key: 'Escape' })
    await tick()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('一搜就选中第一个，右边出详情；角色名默认选上，特征没选', async () => {
    await renderPanel()
    await search('miku')
    expect(
      screen.getByText(L('characterCount', { query: 'miku', count: 2 })),
    ).toBeInTheDocument()
    expect(mikuRow()).toHaveAttribute('aria-current', 'true')
    expect(
      screen.getByRole('button', { name: 'hatsune miku', pressed: true }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /twintails/, pressed: false }),
    ).toBeInTheDocument()
    expect(asks).toContainEqual({ kind: 'character', tag: 'hatsune_miku' })
  })

  it('打字停手 300ms 才查，⛔ 每个字都问一次', async () => {
    await renderPanel()
    const box = screen.getByRole('searchbox', { name: L('searchCharacter') })
    fireEvent.change(box, { target: { value: 'mi' } })
    await tick(100)
    fireEvent.change(box, { target: { value: 'mik' } })
    await tick(100)
    fireEvent.change(box, { target: { value: 'miku' } })
    await tick(300)
    expect(asks.filter((ask) => ask.query)).toEqual([
      { kind: 'character', query: 'miku' },
    ])
  })

  it('加到整体：排在画师标签之后，已经在的不重复；按钮说「已加进整体」', async () => {
    const studio = await renderPanel({ tags: ['artist:sora', 'aqua hair'] })
    await search('miku')
    fireEvent.click(screen.getByRole('button', { name: /aqua hair/ }))
    fireEvent.click(
      screen.getByRole('button', { name: L('addTags', { count: 2 }) }),
    )
    expect(tagsOf(studio)).toEqual(['artist:sora', 'hatsune miku', 'aqua hair'])
    expect(
      screen.getByRole('button', {
        name: L('addedTo', { target: L('targetWhole') }),
      }),
    ).toBeInTheDocument()
  })

  it('加到角色 1：默认跟着输入框当前那一页，并进那一位，那一页亮个点', async () => {
    const studio = await renderPanel({
      characters: [person('solo')],
      active: 0,
    })
    await search('miku')
    const targets = screen.getByRole('tablist', { name: L('targetsLabel') })
    expect(
      within(targets).getByRole('tab', {
        name: text('StudioTags.workbench.characterNumber', { number: 1 }),
      }),
    ).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(
      screen.getByRole('button', { name: L('addTags', { count: 1 }) }),
    )
    expect(
      studio.current.state.advancedParams.novelAiLayout?.characters[0]?.prompt,
    ).toBe('hatsune miku, solo')
    expect(tagsOf(studio)).toEqual([])
    expect(screen.getByTestId('flash')).toHaveTextContent('0')
  })

  it('＋新角色：带着标签建一位，⛔ 切过去，亮的是新那一页', async () => {
    const studio = await renderPanel()
    await search('miku')
    fireEvent.click(screen.getByRole('tab', { name: L('targetNew') }))
    fireEvent.click(
      screen.getByRole('button', { name: L('addTags', { count: 1 }) }),
    )
    const cast = studio.current.state.advancedParams.novelAiLayout?.characters
    expect(cast?.map((c) => c.prompt)).toEqual(['hatsune miku'])
    expect(studio.current.state.activeTagCharacterIndex).toBeNull()
    expect(screen.getByTestId('flash')).toHaveTextContent('0')
  })

  it('角色页查不到、其实是画师：说出来并带着同一个词去画风页', async () => {
    reply = (ask) =>
      ask.kind === 'character' && ask.query === 'fukemachi'
        ? catalog({
            crossHint: { kind: 'artist', name: 'fukemachi', count: 260 },
          })
        : fixtures(ask)
    await renderPanel()
    await search('fukemachi')
    expect(
      screen.getByText(
        L('crossTitle', { page: L('tabCharacter'), query: 'fukemachi' }),
      ),
    ).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', {
        name: L('goPage', { page: L('tabStyle') }),
      }),
    )
    // 带过去的词照样走打字那一道去抖。
    await tick(300)
    expect(screen.getByRole('tab', { name: L('tabStyle') })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(asks).toContainEqual({ kind: 'artist', query: 'fukemachi' })
  })

  it('两边都查不到：给 Danbooru 直链', async () => {
    reply = (ask) => (ask.query ? catalog({}) : fixtures(ask))
    await renderPanel()
    await search('zzqx')
    expect(
      screen.getByText(L('noneTitle', { query: 'zzqx' })),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', {
        name: new RegExp(L('searchDanbooru', { query: 'zzqx' })),
      }),
    ).toHaveAttribute(
      'href',
      'https://danbooru.donmai.us/tags?search%5Bname_matches%5D=*zzqx*',
    )
  })

  it('Danbooru 访问不了：和查不到分开说，重试再问一次就出来了', async () => {
    reply = (ask, nth) =>
      ask.query === 'miku' && nth === 1 ? 'fail' : fixtures(ask)
    await renderPanel()
    await search('miku')
    expect(screen.getByText(L('errorTitle'))).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(L('retry')) }),
    )
    await tick(300)
    await tick()
    expect(screen.queryByText(L('errorTitle'))).toBeNull()
    expect(mikuRow()).toBeInTheDocument()
  })

  it('换词重搜：旧列表原地留着，⛔ 不刷成骨架', async () => {
    await renderPanel()
    await search('miku')
    reply = (ask) => (ask.query === 'mik' ? 'hang' : fixtures(ask))
    await search('mik')
    expect(mikuRow()).toBeInTheDocument()
    expect(screen.queryByRole('status', { name: L('loading') })).toBeNull()
  })

  it('第一次搜、还没结果（随便看看那一批也还没回来）：左右都是骨架', async () => {
    reply = (ask) =>
      ask.query === 'miku' || ask.random ? 'hang' : fixtures(ask)
    await renderPanel()
    await search('miku')
    expect(screen.getAllByRole('status', { name: L('loading') })).toHaveLength(
      2,
    )
  })
})

describe('查资料 B · 画风', () => {
  it('随便看看；加入 = artist:名字 放最前，再点撤回', async () => {
    const studio = await renderPanel({ tags: ['1girl'] })
    await openTab(L('tabStyle'))
    expect(asks).toContainEqual({ kind: 'artist', random: '1' })
    expect(screen.getByText(L('randomTitle', { count: 1 }))).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', {
        name: L('addArtist', { tag: 'artist:mizuiro sora' }),
      }),
    )
    expect(tagsOf(studio)).toEqual(['artist:mizuiro sora', '1girl'])
    // 已经在正向标签里：按钮是「已加入」，再点就拿掉。
    fireEvent.click(screen.getByRole('button', { name: L('artistAdded') }))
    expect(tagsOf(studio)).toEqual(['1girl'])
  })

  it('换一批：整批换掉，左右都是骨架', async () => {
    await renderPanel()
    await openTab(L('tabStyle'))
    reply = (ask) =>
      ask.kind === 'artist' && ask.random ? 'hang' : fixtures(ask)
    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(L('reroll')) }),
    )
    await tick()
    expect(screen.getByText(L('rerolling'))).toBeInTheDocument()
    expect(screen.getAllByRole('status', { name: L('loading') })).toHaveLength(
      2,
    )
  })

  it('「常画的」只是参考，不是按钮', async () => {
    await renderPanel()
    await openTab(L('tabStyle'))
    expect(screen.getByText('flower')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /flower/ })).toBeNull()
  })

  /** owner 2026-10-22：画风页分「画师 + 画法」两段，画法原样加、⛔ 不带 artist:。 */
  it('两段：画法在前、画师在后；画法原样加，接在画师标签后面', async () => {
    reply = (ask) =>
      ask.tag === 'watercolor_(medium)'
        ? catalog({
            detail: {
              tag: 'watercolor_(medium)',
              kind: 'artist',
              wiki: null,
              count: 150000,
              work: null,
              aliases: [],
              sampleSize: 20,
              traits: [{ tag: 'flower', count: 9 }],
              images: [],
            },
          })
        : ask.kind === 'artist' && !ask.tag
          ? catalog({
              candidates: [
                {
                  name: 'watercolor_(medium)',
                  count: 150000,
                  category: 5,
                  work: null,
                  previews: [],
                },
                ...artists.candidates,
              ],
            })
          : fixtures(ask)
    const studio = await renderPanel({ tags: ['artist:sora', '1girl'] })
    await openTab(L('tabStyle'))

    const media = screen.getByText(
      L('section', { kind: L('kindMedium'), count: 1 }),
    )
    const painters = screen.getByText(
      L('section', { kind: L('kindArtist'), count: 1 }),
    )
    expect(
      media.compareDocumentPosition(painters) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    // 一行写原样的名字，副标题说是画法；默认选中第一行，右边是它的详情。
    expect(
      screen.getByRole('button', { name: /^watercolor \(medium\)/ }),
    ).toHaveAttribute('aria-current', 'true')
    expect(
      screen.getByText(
        L('rowMedium', {
          posts: L('posts', { count: compactPostCount(150000, 'zh') }),
        }),
      ),
    ).toBeInTheDocument()
    expect(screen.getByText(L('mediumRefsTitle'))).toBeInTheDocument()
    expect(screen.getByText(new RegExp(L('mediumWhere')))).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', {
        name: L('addArtist', { tag: 'watercolor (medium)' }),
      }),
    )
    expect(tagsOf(studio)).toEqual([
      'artist:sora',
      'watercolor (medium)',
      '1girl',
    ])
  })
})

describe('查资料 · 作品 / 特征', () => {
  it('没点过的页不查；点开作品页才随便看看', async () => {
    await renderPanel()
    expect(asks.some((ask) => ask.kind === 'copyright')).toBe(false)
    await openTab(L('tabWork'))
    expect(asks).toContainEqual({ kind: 'copyright', random: '1' })
    expect(
      screen.getByText(L('randomWorkTitle', { count: 1 })),
    ).toBeInTheDocument()
  })

  it('作品：作品名默认选上，点一个角色一起加进整体', async () => {
    const studio = await renderPanel()
    await openTab(L('tabWork'))
    fireEvent.click(screen.getByRole('button', { name: /paimon/ }))
    fireEvent.click(
      screen.getByRole('button', { name: L('addTags', { count: 2 }) }),
    )
    expect(tagsOf(studio)).toEqual([
      'genshin impact',
      'paimon (genshin impact)',
    ])
  })

  it('特征：常一起出现的可以点选，切页回来选中项还在', async () => {
    await renderPanel()
    await openTab(L('tabFeature'))
    expect(
      screen.getByText(L('randomFeatureTitle', { count: 1 })),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /maid headdress/ }))
    await openTab(L('tabWork'))
    await openTab(L('tabFeature'))
    expect(
      screen.getByRole('button', { name: L('addTags', { count: 2 }) }),
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
  const section = (kind: string) => L('section', { kind: L(kind), count: 1 })

  it('收藏页按类别分段，默认选中第一条并出它的详情', async () => {
    favorites = [
      snowMiku,
      {
        ...snowMiku,
        id: 'fav_2',
        kind: 'artist',
        name: 'mizuiro_sora',
        work: null,
      },
    ]
    await renderPanel()
    await openTab(L('tabFavorites'))
    expect(screen.getByText(section('kindCharacter'))).toBeInTheDocument()
    expect(screen.getByText(section('kindArtist'))).toBeInTheDocument()
    expect(screen.queryByText(section('kindWork'))).toBeNull()
    expect(screen.getByRole('button', { name: /^snow miku/ })).toHaveAttribute(
      'aria-current',
      'true',
    )
    expect(asks).toContainEqual({ kind: 'character', tag: 'snow_miku' })
  })

  it('收藏里的画风也分画法 / 画师两段', async () => {
    favorites = [
      { ...snowMiku, id: 'fav_2', kind: 'artist', name: 'mizuiro_sora' },
      {
        ...snowMiku,
        id: 'fav_3',
        kind: 'artist',
        name: 'watercolor_(medium)',
        work: null,
      },
    ]
    await renderPanel()
    await openTab(L('tabFavorites'))
    expect(screen.getByText(section('kindMedium'))).toBeInTheDocument()
    expect(screen.getByText(section('kindArtist'))).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /^watercolor \(medium\)/ }),
    ).toBeInTheDocument()
  })

  it('收藏页点一个画师：右边换成画师详情', async () => {
    favorites = [
      snowMiku,
      { ...snowMiku, id: 'fav_2', kind: 'artist', name: 'mizuiro_sora' },
    ]
    await renderPanel()
    await openTab(L('tabFavorites'))
    fireEvent.click(
      screen.getByRole('button', { name: /^artist:mizuiro sora/ }),
    )
    await tick()
    expect(
      screen.getByRole('button', {
        name: L('addArtist', { tag: 'artist:mizuiro sora' }),
      }),
    ).toBeInTheDocument()
  })

  it('没有收藏：说怎么收', async () => {
    await renderPanel()
    await openTab(L('tabFavorites'))
    expect(screen.getByText(L('favoritesEmpty'))).toBeInTheDocument()
  })

  it('其余四页不再置顶收藏', async () => {
    favorites = [snowMiku]
    await renderPanel()
    expect(screen.queryByText(section('kindCharacter'))).toBeNull()
  })

  it('点星收藏这一条：存左栏那一行的快照，星当场亮', async () => {
    await renderPanel()
    await search('miku')
    const star = screen.getByRole('button', {
      name: L('favorite', { name: 'hatsune miku' }),
    })
    expect(star).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(star)
    await tick()
    expect(favoritePosts).toEqual([
      {
        kind: 'character',
        name: 'hatsune_miku',
        count: 152000,
        work: 'vocaloid',
        previews: ['https://cdn.donmai.us/p1.jpg'],
      },
    ])
    expect(
      screen.getByRole('button', {
        name: L('unfavorite', { name: 'hatsune miku' }),
      }),
    ).toHaveAttribute('aria-pressed', 'true')
  })

  it('已收藏的星是按下的，文案是取消收藏', async () => {
    favorites = [{ ...snowMiku, name: 'hatsune_miku' }]
    await renderPanel()
    await search('miku')
    expect(
      screen.getByRole('button', {
        name: L('unfavorite', { name: 'hatsune miku' }),
      }),
    ).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('查资料 B · 手机', () => {
  it('列表一页，点一行推进详情，‹ 回到候选', async () => {
    setViewportWidth(MOBILE_WIDTH)
    await renderPanel()
    await search('miku')
    expect(screen.getByText(L('pickHint'))).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: L('addTags', { count: 1 }) }),
    ).not.toBeInTheDocument()

    fireEvent.click(mikuRow())
    await tick()
    expect(
      screen.getByRole('button', { name: L('addTags', { count: 1 }) }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'hatsune miku' })).toHaveFocus()
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
      block: 'start',
    })
    expect(
      vi.mocked(Element.prototype.scrollIntoView).mock.contexts.at(-1),
    ).toBe(screen.getByRole('region', { name: L('title') }))
    // 手机上说短一点（画板 LkFPhone）。
    expect(screen.getByText(L('tagsHintPhone'))).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: L('backToList') }))
    await tick()
    expect(
      screen.getByRole('searchbox', { name: L('searchCharacter') }),
    ).toBeInTheDocument()
  })
})

it('Esc 关掉面板', async () => {
  const onClose = vi.fn()
  await renderPanel({ onClose })
  fireEvent.keyDown(
    screen.getByRole('searchbox', { name: L('searchCharacter') }),
    { key: 'Escape' },
  )
  expect(onClose).toHaveBeenCalled()
})
