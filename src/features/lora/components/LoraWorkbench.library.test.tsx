import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { API_ENDPOINTS } from '@/constants/config'
import type { CivitaiLoraLibraryItem } from '@/types'

import { ApiKeysProvider } from '@/contexts/api-keys-context'
import { LoraStackProvider } from '@/features/lora/hooks/use-active-lora-stack'
import { __resetCivitaiLibraryCacheForTests } from '@/features/lora/hooks/use-civitai-lora-library'
import { __resetMinedPromptsCacheForTests } from '@/features/lora/hooks/use-civitai-mined-prompts'
import { __resetModelDescriptionCacheForTests } from '@/features/lora/hooks/use-civitai-model-description'
import { PromptTagProvider } from '@/hooks/use-prompt-tag-stack'
import { fakeServer } from '@/test/app-harness'
import { LORA_STACK_CLERK_ID } from '@/test/lora-stack'
import { MOBILE_WIDTH, setViewportWidth } from '@/test/viewport'

import { LoraWorkbench } from './LoraWorkbench'

// ── 手机上的公开库（封面网格 + 按需抽屉 + 翻页）。桌面的库挂在生成台那副舞台里，
// 测试在 library/LoraLibraryBrowse.test.tsx。
//
// 真 useIsMobile（先把视口设成手机宽）、真 Civitai / HF 库 hook、真收藏、真挂载栈、
// 真搜索历史；只假网络。筛选 / 翻页 / 检索生效没有，看下一次列表请求带了什么。

// 和真 next-intl 一样，同一个命名空间回同一个 `t`（真 hook 的 effect 依赖它）。
const intl = vi.hoisted(() => {
  const byNamespace = new Map<string, (key: string) => string>()
  const formatter = {
    number: (value: number) => String(value),
    relativeTime: () => 'relative-time',
    dateTime: () => 'date',
  }
  return {
    formatter,
    t(ns: string) {
      let t = byNamespace.get(ns)
      if (!t) {
        t = (key) => `${ns}:${key}`
        byNamespace.set(ns, t)
      }
      return t
    },
  }
})
vi.mock('next-intl', () => ({
  useTranslations: (ns: string) => intl.t(ns),
  useFormatter: () => intl.formatter,
  useLocale: () => 'en',
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    message: vi.fn(),
  },
}))

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, userId: LORA_STACK_CLERK_ID }),
  useUser: () => ({ isLoaded: true, user: null }),
}))

// 库的筛选记在网址里：首帧读这份，写回网址这一跳不管。
const nav = vi.hoisted(() => ({ query: '' }))
vi.mock('next/navigation', () => ({
  useSearchParams: () =>
    new URLSearchParams(
      ['section=community', nav.query].filter(Boolean).join('&'),
    ),
}))
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/studio/lora',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}))

function makeLibraryItem(
  overrides: Partial<CivitaiLoraLibraryItem> & { id: string; name: string },
): CivitaiLoraLibraryItem {
  return {
    styleCode: overrides.id,
    source: 'imported',
    type: 'style',
    baseModelFamily: 'Illustrious',
    provider: 'civitai',
    triggerWord: 'trigger',
    loraUrl: `https://civitai.com/api/download/models/${overrides.id}`,
    coverImageUrl: null,
    previewImageUrls: [],
    defaultScale: 1,
    isPublic: true,
    isOwn: false,
    createdAt: '2026-08-14T00:00:00.000Z',
    modelId: 1,
    modelVersionId: 1,
    versionName: 'v1',
    creatorName: 'creator',
    creatorAvatarUrl: null,
    modelPageUrl: 'https://civitai.com/models/1',
    tags: [],
    downloadCount: 100,
    thumbsUpCount: 10,
    allowCommercialUse: ['Image'],
    allowDerivatives: true,
    thumbImageUrl: null,
    coverImageUrlOriginal: null,
    triggerAlternates: [],
    recommendedPrompt: null,
    recommendedPromptAlternates: [],
    triggerSource: 'official',
    fileHashAutoV3: null,
    ...overrides,
  }
}

const DEFAULT_ITEMS = [
  makeLibraryItem({ id: '1', name: 'Perlica' }),
  makeLibraryItem({ id: '2', name: 'Detail Tweaker' }),
]

/** 服务端这一回怎么答 Civitai 列表；`hold` = 迟迟不回。 */
const civitai: {
  items: CivitaiLoraLibraryItem[]
  hasNextPage: (page: number) => boolean
  hold: (page: number) => boolean
} = {
  items: DEFAULT_ITEMS,
  hasNextPage: () => true,
  hold: () => false,
}

let server: ReturnType<typeof fakeServer>
/** 列表请求一路带了什么（网格本身那几次，不算 pageSize=1 的放宽探测）。 */
let listQueries: URLSearchParams[]
let favoriteBodies: unknown[]

const json = (data: unknown) => Response.json({ success: true, data })

beforeEach(() => {
  setViewportWidth(MOBILE_WIDTH)
  window.localStorage.clear()
  nav.query = ''
  __resetCivitaiLibraryCacheForTests()
  __resetMinedPromptsCacheForTests()
  __resetModelDescriptionCacheForTests()
  civitai.items = DEFAULT_ITEMS
  civitai.hasNextPage = () => true
  civitai.hold = () => false
  listQueries = []
  favoriteBodies = []

  server = fakeServer()
    .on('GET', API_ENDPOINTS.API_KEYS, () => json([]))
    .on('GET', API_ENDPOINTS.LORA_ASSETS, () => json([]))
    .on('GET', `${API_ENDPOINTS.LORA_ASSETS}/discover`, () => json([]))
    .on('GET', API_ENDPOINTS.CHARACTER_LORAS, () => json([]))
    .on('GET', API_ENDPOINTS.PROMPT_TAG_STACK, () => json([]))
    // 人设这一跳失败：工作台照常用默认那套。
    .on('GET', '/api/assistant/persona', () =>
      Response.json({ success: false, error: 'offline' }, { status: 500 }),
    )
    .on('GET', API_ENDPOINTS.LORA_ASSETS_CIVITAI, (request) => {
      const query = request.nextUrl.searchParams
      const page = Number(query.get('page') ?? '1')
      const pageSize = Number(query.get('pageSize') ?? '12')
      if (pageSize !== 1) listQueries.push(query)
      if (civitai.hold(page)) return new Promise<Response>(() => {})
      const items = pageSize === 1 ? [] : civitai.items
      return json({
        items,
        page,
        pageSize,
        // 总数比这一页多：翻页按钮才有下一页可翻。
        total: items.length ? 100 : 0,
        totalCapped: false,
        hasNextPage: pageSize !== 1 && civitai.hasNextPage(page),
        literalTotal: items.length,
        fallback: null,
      })
    })
    .on('GET', API_ENDPOINTS.LORA_ASSETS_HUGGINGFACE, () =>
      json({
        items: [],
        total: 0,
        page: 1,
        limit: 24,
        hasNextPage: false,
        nextCursor: null,
      }),
    )
    .on('GET', API_ENDPOINTS.LORA_ASSETS_CIVITAI_MINED_PROMPTS, () =>
      json({ recipes: [], previewImages: [] }),
    )
    .on('GET', API_ENDPOINTS.LORA_ASSETS_CIVITAI_DESCRIPTION, () =>
      json({ descriptionText: null, versions: [] }),
    )
    .on('GET', API_ENDPOINTS.LORA_ASSETS_CIVITAI_DOWNLOAD_POLICY, () =>
      json({ downloadDisabled: false }),
    )
    .on('POST', API_ENDPOINTS.LORA_ASSETS_FAVORITE, async (request) => {
      favoriteBodies.push(await request.json())
      return Response.json(
        { success: false, error: 'not in this test' },
        { status: 500 },
      )
    })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function Providers({ children }: { children: ReactNode }) {
  return (
    <ApiKeysProvider>
      <LoraStackProvider>
        <PromptTagProvider>{children}</PromptTagProvider>
      </LoraStackProvider>
    </ApiKeysProvider>
  )
}

function renderWorkbench() {
  return render(<LoraWorkbench />, { wrapper: Providers })
}

async function renderLoaded() {
  const view = renderWorkbench()
  await screen.findByRole('button', { name: 'Perlica' })
  return view
}

const lastListQuery = () => listQueries.at(-1)!

const prevButton = () =>
  screen.getByRole('button', { name: /LoraWorkbench:communityPrevious/ })
const nextButton = () =>
  screen.getByRole('button', { name: /LoraWorkbench:communityNext/ })

describe('LoraWorkbench 手机公开库 — 封面网格 + 详情抽屉', () => {
  it('renders a grid card per library item, favorite only lives in the drawer', async () => {
    await renderLoaded()

    expect(
      screen.getByRole('button', { name: 'Detail Tweaker' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'LoraWorkbench:favorite' }),
    ).not.toBeInTheDocument()
  })

  it('switches the public library to Hugging Face when source=huggingface is in the URL', async () => {
    nav.query = 'source=huggingface'
    renderWorkbench()

    expect(
      await screen.findByRole('textbox', {
        name: 'LoraWorkbench:huggingFaceSearchPlaceholder',
      }),
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(server.requests.map((r) => r.path)).toContain(
        API_ENDPOINTS.LORA_ASSETS_HUGGINGFACE,
      ),
    )
    expect(screen.queryByText('Perlica')).not.toBeInTheDocument()
  })

  it('opens the detail drawer for the clicked card', async () => {
    await renderLoaded()

    expect(
      screen.queryByRole('button', { name: 'LoraWorkbench:useThisLora' }),
    ).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Detail Tweaker' }))

    const drawer = await screen.findByRole('dialog')
    expect(
      within(drawer).getAllByText('Detail Tweaker').length,
    ).toBeGreaterThan(0)
    expect(
      within(drawer).getByRole('button', { name: 'LoraWorkbench:useThisLora' }),
    ).toBeInTheDocument()
  })

  it('favorites from the drawer — sends that card to the server', async () => {
    await renderLoaded()
    fireEvent.click(screen.getByRole('button', { name: 'Perlica' }))

    fireEvent.click(
      await screen.findByRole('button', { name: 'LoraWorkbench:favorite' }),
    )

    await waitFor(() => expect(favoriteBodies).toHaveLength(1))
    expect(favoriteBodies[0]).toEqual(
      expect.objectContaining({
        loraUrl: 'https://civitai.com/api/download/models/1',
      }),
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('closes the detail drawer with Escape', async () => {
    await renderLoaded()
    fireEvent.click(screen.getByRole('button', { name: 'Perlica' }))
    const drawer = await screen.findByRole('dialog')

    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => expect(drawer).toHaveAttribute('data-state', 'closed'))
    expect(
      screen.queryByRole('button', { name: 'LoraWorkbench:useThisLora' }),
    ).not.toBeInTheDocument()
  })
})

describe('LoraWorkbench 手机公开库 — 翻页', () => {
  it('page 1: Previous disabled, Next asks the server for page 2', async () => {
    await renderLoaded()

    expect(prevButton()).toBeDisabled()
    expect(nextButton()).not.toBeDisabled()

    fireEvent.click(nextButton())

    await waitFor(() => expect(lastListQuery().get('page')).toBe('2'))
  })

  it('disables both buttons while the next page is on its way', async () => {
    civitai.hold = (page) => page === 2
    await renderLoaded()

    fireEvent.click(nextButton())

    await waitFor(() => expect(nextButton()).toBeDisabled())
    expect(prevButton()).toBeDisabled()
  })

  it('on the last page: Next disabled, Previous enabled', async () => {
    civitai.hasNextPage = (page) => page < 2
    await renderLoaded()

    fireEvent.click(nextButton())

    await waitFor(() => expect(prevButton()).not.toBeDisabled())
    expect(nextButton()).toBeDisabled()
  })
})

describe('LoraWorkbench 手机公开库 — 显式提交检索', () => {
  const searchInput = () =>
    screen.getByPlaceholderText('LoraWorkbench:communitySearch')

  function type(term: string) {
    fireEvent.change(searchInput(), { target: { value: term } })
  }

  it('typing alone never starts a search', async () => {
    // 旧行为敲一个键就打一次上游。
    await renderLoaded()
    const before = listQueries.length

    type('anima turbo')
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(searchInput()).toHaveValue('anima turbo')
    expect(listQueries).toHaveLength(before)
  })

  it('Enter submits the search', async () => {
    await renderLoaded()
    type('anima')

    fireEvent.keyDown(searchInput(), { key: 'Enter' })

    await waitFor(() => expect(lastListQuery().get('search')).toBe('anima'))
  })

  it('the search button submits too — mobile has no Enter key to press', async () => {
    await renderLoaded()
    type('anima')

    fireEvent.click(
      screen.getByRole('button', {
        name: 'LoraWorkbench:communitySearchSubmit',
      }),
    )

    await waitFor(() => expect(lastListQuery().get('search')).toBe('anima'))
  })

  it('does not submit on any other key', async () => {
    await renderLoaded()
    type('anima')
    const before = listQueries.length

    fireEvent.keyDown(searchInput(), { key: 'a' })
    fireEvent.keyDown(searchInput(), { key: 'Escape' })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(listQueries).toHaveLength(before)
    expect(listQueries.some((query) => query.has('search'))).toBe(false)
  })
})

describe('LoraWorkbench 手机公开库 — 网址深链', () => {
  it('seeds family/q/sort/nsfw from the URL into the first request', async () => {
    nav.query = 'family=Illustrious&q=detail&sort=Newest&nsfw=nsfwOnly'
    renderWorkbench()

    await waitFor(() => expect(listQueries.length).toBeGreaterThan(0))
    const first = listQueries[0]!
    expect(first.get('baseModel')).toBe('Illustrious')
    expect(first.get('search')).toBe('detail')
    expect(first.get('sort')).toBe('Newest')
    expect(first.get('nsfw')).toBe('nsfwOnly')
  })

  it('falls back to defaults for unknown/invalid query values instead of leaking them', async () => {
    nav.query = 'family=not-a-real-family&sort=also-bogus&nsfw=yes'
    renderWorkbench()

    await waitFor(() => expect(listQueries.length).toBeGreaterThan(0))
    const first = listQueries[0]!
    expect(first.get('baseModel')).toBe('all')
    expect(first.get('sort')).toBe('Highest Rated')
    expect(first.has('nsfw')).toBe(false)
  })
})

describe('LoraWorkbench 手机公开库 — 清空筛选', () => {
  beforeEach(() => {
    civitai.items = []
    civitai.hasNextPage = () => false
  })

  it('offers clear-filters on an empty filtered result and resets the request', async () => {
    nav.query = 'family=Illustrious&q=detail&nsfw=nsfwOnly'
    renderWorkbench()

    fireEvent.click(
      await screen.findByRole('button', { name: 'LoraWorkbench:clearFilters' }),
    )

    await waitFor(() => expect(lastListQuery().get('baseModel')).toBe('all'))
    expect(lastListQuery().has('search')).toBe(false)
    expect(lastListQuery().has('nsfw')).toBe(false)
  })

  it('hides the clear-filters action when no filter is active', async () => {
    renderWorkbench()

    // 空态已经出来了（「没有结果」那句在），里面没有清空键。
    await screen.findByText('LoraWorkbench:communityEmpty')
    expect(
      screen.queryByRole('button', { name: 'LoraWorkbench:clearFilters' }),
    ).not.toBeInTheDocument()
  })
})

describe('LoraWorkbench 手机公开库 — 卡面', () => {
  it('renders an external-family card with its family label', async () => {
    // Pony 是外部（这里生成不了）的家族：照常出卡、不崩。
    civitai.items = [
      makeLibraryItem({
        id: 'ext-1',
        name: 'Pony Card',
        baseModelFamily: 'Pony',
      }),
    ]
    renderWorkbench()

    const card = await screen.findByRole('button', { name: 'Pony Card' })
    expect(within(card).getByText('Pony')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'LoraWorkbench:favorite' }),
    ).not.toBeInTheDocument()
  })
})
