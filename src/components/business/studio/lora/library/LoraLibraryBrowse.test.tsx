import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CivitaiLoraLibraryItem } from '@/types'

import {
  getLoraLibraryAgentState,
  requestLoraLibrarySearch,
  resetLoraLibraryAgent,
  showLoraLibraryPicks,
} from '@/hooks/use-lora-library-agent'
import {
  getOperatorState,
  resetOperatorThread,
} from '@/hooks/use-studio-operator-store'

import { LoraLibraryBrowse } from './LoraLibraryBrowse'

vi.mock('next-intl', () => ({
  useTranslations:
    (ns: string) => (key: string, values?: Record<string, unknown>) =>
      values ? `${ns}:${key}:${JSON.stringify(values)}` : `${ns}:${key}`,
  useFormatter: () => ({
    number: (value: number) => value.toLocaleString('en-US'),
    relativeTime: () => '12 minutes ago',
    dateTime: () => 'Aug 14',
  }),
}))

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, userId: 'user-1' }),
}))

vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn() } }))

const mockPush = vi.fn()
let mockStackItems: { asset: { id: string; loraUrl: string } }[] = []
vi.mock('@/hooks/use-active-lora-stack', () => ({
  useActiveLoraStack: () => ({ items: mockStackItems, push: mockPush }),
}))

vi.mock('@/hooks/use-civitai-download-gate', () => ({
  useCivitaiDownloadGate: () => ({ ensureMountable: async () => true }),
}))

const mockListAPI = vi.fn()
vi.mock('@/lib/api-client/lora-assets', () => ({
  listCivitaiLoraAssetsAPI: (...args: unknown[]) => mockListAPI(...args),
}))

// 详情页的数据 hook：这里只验它从网格里升起来 / 关回去。
vi.mock('@/hooks/prompts/use-civitai-model-description', () => ({
  useCivitaiModelDetail: () => ({
    descriptionText: null,
    versions: [],
    isLoading: false,
  }),
}))
vi.mock('@/hooks/prompts/use-civitai-mined-prompts', () => ({
  useCivitaiMinedPrompts: () => ({
    recipes: [],
    previewImages: [],
    isLoading: false,
  }),
}))

const mockLoadMore = vi.fn()
const mockSetNsfwFilter = vi.fn()
let mockLibrary: Record<string, unknown> = {}
vi.mock('@/hooks/use-civitai-lora-library-url', () => ({
  useCivitaiLoraLibraryWithUrl: () => mockLibrary,
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

function libraryState(overrides: Record<string, unknown> = {}) {
  return {
    items: [makeItem('roccia', 'Roccia'), makeItem('jinhsi', 'Jinhsi')],
    total: 18402,
    hasNextPage: true,
    isLoading: false,
    isRevalidating: false,
    isReplacing: false,
    isLoadingMore: false,
    error: null,
    search: '',
    debouncedSearch: '',
    sort: 'Highest Rated',
    baseModel: 'all',
    nsfwFilter: 'safe',
    contentType: 'all',
    setSearch: vi.fn(),
    submitSearch: vi.fn(),
    commitSearchTerm: vi.fn(),
    setSort: vi.fn(),
    setBaseModel: vi.fn(),
    setNsfwFilter: mockSetNsfwFilter,
    setContentType: vi.fn(),
    loadMore: mockLoadMore,
    refresh: vi.fn(),
    ...overrides,
  }
}

function renderBrowse() {
  return render(
    <LoraLibraryBrowse
      sourceSwitch={<span>source</span>}
      onFavorite={vi.fn()}
      onUnfavoriteByUrl={vi.fn()}
      isFavorited={() => false}
    />,
  )
}

describe('LoraLibraryBrowse（库 B · Civitai）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStackItems = []
    mockLibrary = libraryState()
    resetLoraLibraryAgent()
    resetOperatorThread()
  })

  it('writes the exact count, however large', () => {
    const { rerender } = renderBrowse()
    expect(screen.getByText('18,402')).toBeInTheDocument()

    mockLibrary = libraryState({ total: 642554 })
    rerender(
      <LoraLibraryBrowse
        sourceSwitch={<span>source</span>}
        onFavorite={vi.fn()}
        onUnfavoriteByUrl={vi.fn()}
        isFavorited={() => false}
      />,
    )
    expect(screen.getByText('642,554')).toBeInTheDocument()
  })

  it('keeps type, base, rating and sort as dropdowns in the one bar', () => {
    renderBrowse()

    for (const label of [
      'typeFilterLabel',
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
    renderBrowse()

    fireEvent.click(
      screen.getByRole('button', {
        name: 'LoraWorkbench.browse:mountLabel:{"name":"Roccia"}',
      }),
    )

    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1))
    expect(mockPush.mock.calls[0][0]).toMatchObject({ id: 'roccia' })
  })

  it('shows a mounted tile as mounted and does not push it again', () => {
    mockStackItems = [
      {
        asset: {
          id: 'roccia',
          loraUrl: 'https://civitai.com/api/download/models/roccia',
        },
      },
    ]
    renderBrowse()

    const pill = screen.getByRole('button', {
      name: 'LoraWorkbench.browse:mountedLabel:{"name":"Roccia"}',
    })
    fireEvent.click(pill)
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('dims the old results while a new search replaces them', () => {
    mockLibrary = libraryState({
      isReplacing: true,
      isRevalidating: true,
      debouncedSearch: 'roccia',
    })
    const { container } = renderBrowse()

    expect(container.querySelector('.lora-lib-grid')?.className).toContain(
      'opacity-42',
    )
    expect(container.querySelector('.lora-search-run')).not.toBeNull()
  })

  it('asks for the next segment when the bottom comes within reach', () => {
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
    renderBrowse()

    act(() => {
      observers.at(-1)?.(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      )
    })
    expect(mockLoadMore).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('offers loosening one filter with the real count when nothing matches', async () => {
    mockLibrary = libraryState({
      items: [],
      total: 0,
      hasNextPage: false,
      debouncedSearch: 'ロッチャ',
      baseModel: 'Illustrious',
    })
    mockListAPI.mockImplementation(async (params: Record<string, unknown>) => ({
      success: true,
      data: {
        items: [],
        total: params.nsfwFilter === 'unrestricted' ? 3 : 1,
      },
    }))
    renderBrowse()

    expect(
      screen.getByText('LoraWorkbench.browse:emptyTitle:{"query":"ロッチャ"}'),
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
    expect(mockSetNsfwFilter).toHaveBeenCalledWith('unrestricted')
  })

  it('raises the detail page over the grid and puts it back on ‹', async () => {
    renderBrowse()

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
    it('applies the assistant request: term, commit, base model, then consumes it', () => {
      const setSearch = vi.fn()
      const commitSearchTerm = vi.fn()
      const setBaseModel = vi.fn()
      mockLibrary = libraryState({ setSearch, commitSearchTerm, setBaseModel })
      requestLoraLibrarySearch({ query: 'roccia', baseModel: 'Illustrious' })

      renderBrowse()

      expect(setSearch).toHaveBeenCalledWith('roccia')
      expect(commitSearchTerm).toHaveBeenCalledWith('roccia')
      expect(setBaseModel).toHaveBeenCalledWith('Illustrious')
      expect(getLoraLibraryAgentState().request).toBeNull()
    })

    it('rings the picks with a badge and marks the search box as the assistant’s', () => {
      mockLibrary = libraryState({
        search: 'roccia',
        debouncedSearch: 'roccia',
        baseModel: 'Illustrious',
      })
      requestLoraLibrarySearch({ query: 'roccia', baseModel: 'Illustrious' })
      renderBrowse()
      act(() =>
        showLoraLibraryPicks({
          query: 'roccia',
          picks: [{ candidateId: 'roccia', name: 'Roccia' }],
        }),
      )

      expect(
        screen.getAllByText('LoraWorkbench.browse:agentPick'),
      ).toHaveLength(1)
      expect(
        screen.getByText('LoraWorkbench.browse:agentSearched'),
      ).toBeInTheDocument()
    })

    it('drops the rings once you search something else', () => {
      mockLibrary = libraryState({
        search: 'roccia',
        debouncedSearch: 'roccia',
        baseModel: 'Illustrious',
      })
      requestLoraLibrarySearch({ query: 'roccia', baseModel: 'Illustrious' })
      const { rerender } = renderBrowse()
      act(() =>
        showLoraLibraryPicks({
          query: 'roccia',
          picks: [{ candidateId: 'roccia', name: 'Roccia' }],
        }),
      )

      mockLibrary = libraryState({
        search: 'jinhsi',
        debouncedSearch: 'jinhsi',
        baseModel: 'Illustrious',
      })
      rerender(
        <LoraLibraryBrowse
          sourceSwitch={<span>source</span>}
          onFavorite={vi.fn()}
          onUnfavoriteByUrl={vi.fn()}
          isFavorited={() => false}
        />,
      )

      expect(getLoraLibraryAgentState().picks).toHaveLength(0)
      expect(getLoraLibraryAgentState().query).toBeNull()
      expect(screen.queryByText('LoraWorkbench.browse:agentPick')).toBeNull()
    })

    it('mounting a ringed card drops its ring and tells the thread', async () => {
      mockLibrary = libraryState({
        search: 'roccia',
        debouncedSearch: 'roccia',
        baseModel: 'Illustrious',
      })
      requestLoraLibrarySearch({ query: 'roccia', baseModel: 'Illustrious' })
      renderBrowse()
      act(() =>
        showLoraLibraryPicks({
          query: 'roccia',
          picks: [{ candidateId: 'roccia', name: 'Roccia' }],
        }),
      )

      fireEvent.click(
        screen.getByRole('button', {
          name: 'LoraWorkbench.browse:mountLabel:{"name":"Roccia"}',
        }),
      )

      await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1))
      expect(getLoraLibraryAgentState().picks).toHaveLength(0)
      expect(getOperatorState().entries.at(-1)).toMatchObject({
        kind: 'system',
        code: 'loraLibraryPickMounted',
        subject: 'Roccia',
      })
    })
  })
})
