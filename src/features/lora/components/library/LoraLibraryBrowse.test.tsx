import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { CivitaiLoraLibraryItem } from '@/types'

import {
  LoraStackProvider,
  useActiveLoraStack,
} from '@/features/lora/hooks/use-active-lora-stack'
import { __resetCivitaiLibraryCacheForTests } from '@/features/lora/hooks/use-civitai-lora-library'
import { __resetMinedPromptsCacheForTests } from '@/features/lora/hooks/use-civitai-mined-prompts'
import { __resetModelDescriptionCacheForTests } from '@/features/lora/hooks/use-civitai-model-description'
import {
  getLoraLibraryAgentState,
  requestLoraLibrarySearch,
  resetLoraLibraryAgent,
  showLoraLibraryPicks,
} from '@/features/lora/hooks/use-lora-library-agent'
import {
  getOperatorState,
  resetOperatorThread,
} from '@/hooks/use-studio-operator-store'
import {
  LORA_STACK_CLERK_ID,
  loraAsset,
  seedLoraStack,
} from '@/test/lora-stack'

import { LoraLibraryBrowse } from './LoraLibraryBrowse'

// 真 useCivitaiLoraLibraryWithUrl（含网址那层）、真挂载栈、真下载闸、真详情 / 挖配方
// hook；只在 api-client 边界上假那几跳。筛选是否生效看下一次列表请求带了什么。

// 和真 next-intl 一样，同一个命名空间回同一个 `t`（真 hook 的 effect 依赖它）。
const intl = vi.hoisted(() => {
  const byNamespace = new Map<
    string,
    (key: string, values?: Record<string, unknown>) => string
  >()
  const formatter = {
    number: (value: number) => value.toLocaleString('en-US'),
    relativeTime: () => '12 minutes ago',
    dateTime: () => 'Aug 14',
  }
  return {
    formatter,
    t(ns: string) {
      let t = byNamespace.get(ns)
      if (!t) {
        t = (key, values) =>
          values ? `${ns}:${key}:${JSON.stringify(values)}` : `${ns}:${key}`
        byNamespace.set(ns, t)
      }
      return t
    },
  }
})
vi.mock('next-intl', () => ({
  useTranslations: (ns: string) => intl.t(ns),
  useFormatter: () => intl.formatter,
}))

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, userId: LORA_STACK_CLERK_ID }),
}))

vi.mock('sonner', () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
}))

// 库的筛选记在网址里：首帧读这份，写回网址这一跳不管。
const nav = vi.hoisted(() => ({ query: '', params: new URLSearchParams() }))
vi.mock('next/navigation', () => ({
  useSearchParams: () => nav.params,
}))
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/studio/lora',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}))

const civ = vi.hoisted(() => ({ list: vi.fn() }))
vi.mock('@/lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-client')>()),
  fetchCivitaiLoraDownloadPolicyAPI: async () => ({
    success: true,
    data: { downloadDisabled: false },
  }),
}))
vi.mock('@/lib/api-client/lora-assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-client/lora-assets')>()),
  listCivitaiLoraAssetsAPI: civ.list,
  fetchCivitaiModelDescriptionAPI: async () => ({
    success: true,
    data: { descriptionText: null, versions: [] },
  }),
  mineCivitaiLoraPromptsAPI: async () => ({
    success: true,
    data: { recipes: [], previewImages: [] },
  }),
}))

function makeItem(id: string, name: string): CivitaiLoraLibraryItem {
  return {
    id,
    styleCode: id,
    name,
    source: 'imported',
    type: 'style',
    baseModelFamily: 'Illustrious',
    provider: 'civitai',
    triggerWord: name.toLowerCase(),
    triggerAlternates: [],
    recommendedPrompt: null,
    recommendedPromptAlternates: [],
    triggerSource: 'official',
    fileHashAutoV3: null,
    loraUrl: `https://civitai.com/api/download/models/${id}`,
    coverImageUrl: null,
    coverImageUrlOriginal: null,
    thumbImageUrl: null,
    previewImageUrls: [],
    defaultScale: 1,
    isPublic: true,
    isOwn: false,
    createdAt: '2026-08-14T00:00:00.000Z',
    modelId: 1,
    modelVersionId: 1,
    versionName: 'v1',
    creatorName: null,
    creatorAvatarUrl: null,
    modelPageUrl: `https://civitai.com/models/${id}`,
    tags: [],
    downloadCount: 8100,
    thumbsUpCount: 1200,
    allowCommercialUse: [],
    allowDerivatives: false,
  }
}

type ListParams = {
  page?: number
  pageSize?: number
  search?: string
  baseModel?: string
  nsfwFilter?: string
}

/** 列表那一跳回什么（`page` 跟着请求走）。 */
function listResult(
  params: ListParams,
  overrides: Record<string, unknown> = {},
) {
  return {
    success: true,
    data: {
      items: [makeItem('roccia', 'Roccia'), makeItem('jinhsi', 'Jinhsi')],
      total: 18402,
      totalCapped: false,
      hasNextPage: true,
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 30,
      literalTotal: 2,
      fallback: null,
      ...overrides,
    },
  }
}

/** 网格本身那几次请求（不算「放宽一档有几条」的探测，那几次 pageSize 是 1）。 */
const gridCalls = (): ListParams[] =>
  civ.list.mock.calls
    .map((call) => call[0] as ListParams)
    .filter((params) => params.pageSize !== 1)

function setQuery(query: string) {
  nav.query = query
  nav.params = new URLSearchParams(query)
}

/** 挂载栈里现在有哪几把（按名字）。 */
function StackProbe() {
  const stack = useActiveLoraStack()
  return (
    <output aria-label="stack">
      {stack.items.map((entry) => entry.asset.name).join(',')}
    </output>
  )
}

const browse = (
  <LoraStackProvider>
    <LoraLibraryBrowse
      sourceSwitch={<span>source</span>}
      onFavorite={vi.fn()}
      onUnfavoriteByUrl={vi.fn()}
      isFavorited={() => false}
    />
    <StackProbe />
  </LoraStackProvider>
)

function renderBrowse() {
  return render(browse)
}

async function renderLoaded() {
  const view = renderBrowse()
  await screen.findByRole('button', { name: 'Roccia' })
  return view
}

/** 在搜索框里敲一个词再点放大镜。 */
function searchFor(term: string) {
  fireEvent.change(
    screen.getByRole('textbox', { name: 'LoraWorkbench:communitySearch' }),
    { target: { value: term } },
  )
  fireEvent.click(
    screen.getByRole('button', { name: 'LoraWorkbench:communitySearchSubmit' }),
  )
}

/** 名叫 `name` 那一格的「更多」打开（挂载收在里面）。 */
function openMoreOf(name: string) {
  const tile = screen.getByRole('button', { name }).parentElement as HTMLElement
  fireEvent.pointerDown(
    within(tile).getByRole('button', { name: 'LoraWorkbench.browse:more' }),
    { button: 0, ctrlKey: false },
  )
}

const stackText = () => screen.getByRole('status', { name: 'stack' })

describe('LoraLibraryBrowse（库 B · Civitai）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    setQuery('')
    __resetCivitaiLibraryCacheForTests()
    __resetModelDescriptionCacheForTests()
    __resetMinedPromptsCacheForTests()
    civ.list.mockReset()
    civ.list.mockImplementation(async (params: ListParams) =>
      listResult(params),
    )
    resetLoraLibraryAgent()
    resetOperatorThread()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps base, rating and sort as pills in the one bar, type as a switch bar', async () => {
    await renderLoaded()

    expect(
      screen.getByRole('tablist', { name: 'LoraWorkbench:typeFilterLabel' }),
    ).toBeInTheDocument()
    for (const label of [
      'baseModelFilterLabel',
      'nsfwToggleHint',
      'communitySortFilter',
    ]) {
      expect(
        screen.getByRole('button', {
          name: new RegExp(`LoraWorkbench:${label}`),
        }),
      ).toBeInTheDocument()
    }
  })

  it('mounts from a tile in place — pushes to the stack, no navigation', async () => {
    await renderLoaded()

    openMoreOf('Roccia')
    fireEvent.click(
      screen.getByRole('menuitem', {
        name: 'LoraWorkbench.browse:mountLabel:{"name":"Roccia"}',
      }),
    )

    await waitFor(() => expect(stackText()).toHaveTextContent(/^Roccia$/))
  })

  it('shows a mounted tile as mounted and does not push it again', async () => {
    seedLoraStack([
      {
        asset: loraAsset('roccia', {
          name: 'Roccia',
          loraUrl: 'https://civitai.com/api/download/models/roccia',
        }),
      },
    ])
    await renderLoaded()

    expect(
      screen.getAllByRole('img', { name: 'LoraWorkbench.browse:mounted' }),
    ).toHaveLength(1)
    openMoreOf('Roccia')
    const pill = screen.getByRole('menuitem', {
      name: 'LoraWorkbench.browse:mountedLabel:{"name":"Roccia"}',
    })
    fireEvent.click(pill)
    expect(stackText()).toHaveTextContent(/^Roccia$/)
  })

  it('dims the old results while a new search replaces them', async () => {
    const { container } = await renderLoaded()
    // 新词的第一段迟迟不回来：旧结果留在屏上变淡。
    civ.list.mockImplementation(() => new Promise(() => {}))

    searchFor('roccia')

    await waitFor(() =>
      expect(container.querySelector('.opacity-42')).not.toBeNull(),
    )
    expect(container.querySelector('.lora-search-run')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Roccia' })).toBeInTheDocument()
  })

  it('asks for the next segment when the bottom comes within reach', async () => {
    const observers: IntersectionObserverCallback[] = []
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: IntersectionObserverCallback) {
          observers.push(callback)
        }
        observe() {}
        disconnect() {}
      },
    )
    await renderLoaded()

    act(() => {
      observers.at(-1)?.(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      )
    })
    await waitFor(() =>
      expect(gridCalls().map((params) => params.page)).toContain(2),
    )
  })

  it('offers loosening one filter with the real count when nothing matches', async () => {
    setQuery('q=ロッチャ&family=illustrious')
    civ.list.mockImplementation(async (params: ListParams) =>
      listResult(params, {
        items: [],
        literalTotal: 0,
        hasNextPage: false,
        total:
          params.pageSize === 1
            ? params.nsfwFilter === 'unrestricted'
              ? 3
              : 1
            : 0,
      }),
    )
    renderBrowse()

    expect(
      await screen.findByText(
        'LoraWorkbench.browse:emptyTitle:{"query":"ロッチャ"}',
      ),
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(
        screen.getByText('LoraWorkbench.browse:relaxCount:{"count":3}'),
      ).toBeInTheDocument(),
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: /LoraWorkbench\.browse:relaxNsfw/,
      }),
    )
    await waitFor(() =>
      expect(gridCalls().at(-1)).toMatchObject({
        search: 'ロッチャ',
        nsfwFilter: 'unrestricted',
      }),
    )
  })

  it('labels the corrected and similar-meaning segments after the literal hits', async () => {
    setQuery('q=endfeild')
    civ.list.mockImplementation(async (params: ListParams) =>
      listResult(params, {
        items: [
          makeItem('a', 'Alpha'),
          makeItem('b', 'Beta'),
          makeItem('c', 'Gamma'),
        ],
        literalTotal: 0,
        fallback: { kind: 'corrected', query: 'endfield', total: 2 },
      }),
    )
    renderBrowse()

    expect(
      await screen.findByText(
        'LoraWorkbench.browse:segmentCorrected:{"query":"endfeild","corrected":"endfield","count":"2"}',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText('LoraWorkbench.browse:segmentMeaning'),
    ).toBeInTheDocument()
  })

  it('raises the detail page over the grid and puts it back on ‹', async () => {
    await renderLoaded()

    fireEvent.click(screen.getByRole('button', { name: 'Roccia' }))
    expect(await screen.findByTestId('lora-library-detail')).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: 'LoraWorkbench.browse:back' }),
    )
    await waitFor(() =>
      expect(screen.queryByTestId('lora-library-detail')).toBeNull(),
    )
  })

  /**
   * 助手当面搜（lora-assistant §13.2）：请求照「点一条搜索历史」那条路落到库页，
   * 圈与小标跟着助手搜的那一组走，你一改词就撤；挂上圈里那把在线程里落一行。
   */
  describe('助手当面搜', () => {
    async function renderWithAgentPicks() {
      requestLoraLibrarySearch({ query: 'roccia', baseModel: 'Illustrious' })
      const view = renderBrowse()
      await waitFor(() =>
        expect(gridCalls().at(-1)).toMatchObject({
          search: 'roccia',
          baseModel: 'Illustrious',
        }),
      )
      await screen.findByRole('button', { name: 'Roccia' })
      act(() =>
        showLoraLibraryPicks({
          query: 'roccia',
          picks: [{ candidateId: 'roccia', name: 'Roccia' }],
        }),
      )
      return view
    }

    it('applies the assistant request: term, commit, base model, then consumes it', async () => {
      requestLoraLibrarySearch({ query: 'roccia', baseModel: 'Illustrious' })

      renderBrowse()

      await waitFor(() =>
        expect(gridCalls().at(-1)).toMatchObject({
          search: 'roccia',
          baseModel: 'Illustrious',
        }),
      )
      expect(
        screen.getByRole('textbox', { name: 'LoraWorkbench:communitySearch' }),
      ).toHaveValue('roccia')
      expect(getLoraLibraryAgentState().request).toBeNull()
    })

    it('rings the picks with a badge and marks the search box as the assistant’s', async () => {
      await renderWithAgentPicks()

      expect(
        screen.getAllByText('LoraWorkbench.browse:agentPick'),
      ).toHaveLength(1)
      expect(
        screen.getByText('LoraWorkbench.browse:agentSearched'),
      ).toBeInTheDocument()
    })

    it('drops the rings once you search something else', async () => {
      await renderWithAgentPicks()

      searchFor('jinhsi')

      await waitFor(() =>
        expect(getLoraLibraryAgentState().picks).toHaveLength(0),
      )
      expect(getLoraLibraryAgentState().query).toBeNull()
      expect(screen.queryByText('LoraWorkbench.browse:agentPick')).toBeNull()
    })

    it('mounting a ringed card drops its ring and tells the thread', async () => {
      await renderWithAgentPicks()

      openMoreOf('Roccia')
      fireEvent.click(
        screen.getByRole('menuitem', {
          name: 'LoraWorkbench.browse:mountLabel:{"name":"Roccia"}',
        }),
      )

      await waitFor(() => expect(stackText()).toHaveTextContent(/^Roccia$/))
      expect(getLoraLibraryAgentState().picks).toHaveLength(0)
      expect(getOperatorState().entries.at(-1)).toMatchObject({
        kind: 'system',
        code: 'loraLibraryPickMounted',
        subject: 'Roccia',
      })
    })
  })
})
