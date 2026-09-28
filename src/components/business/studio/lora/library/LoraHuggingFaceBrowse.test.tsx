import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { HuggingFaceLoraSearchItem } from '@/types'

import { LoraHuggingFaceBrowse } from './LoraHuggingFaceBrowse'

vi.mock('next-intl', () => ({
  useTranslations:
    (ns: string) => (key: string, values?: Record<string, unknown>) =>
      values ? `${ns}:${key}:${JSON.stringify(values)}` : `${ns}:${key}`,
  useFormatter: () => ({
    number: (value: number) => value.toLocaleString('en-US'),
    relativeTime: () => 'now',
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

// 测试环境里 Runner 开关没开、所有底模都「不可用」：这里只验挂载本身。
vi.mock('@/constants/lora-base-models', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/constants/lora-base-models')>()),
  getCompatibleBases: () => [{ available: true }],
}))

vi.mock('@/hooks/use-huggingface-showcase-cover', () => ({
  useHuggingFaceShowcaseCover: (
    _repoId: string,
    _revision: string,
    cover: string | null,
  ) => ({ coverUrl: cover, isPending: false, setObservedElement: vi.fn() }),
}))

// 详情页的数据 hook：Hugging Face 的样例是 README 里的图。
vi.mock('@/hooks/use-huggingface-lora-showcase', () => ({
  useHuggingFaceLoraShowcase: () => ({
    images: [],
    prompts: [],
    isLoading: false,
  }),
}))
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

const mockCommitSearch = vi.fn()
const mockSetBaseModelFamily = vi.fn()
let mockLibrary: Record<string, unknown> = {}
vi.mock('@/hooks/use-huggingface-lora-library-url', () => ({
  useHuggingFaceLoraLibraryWithUrl: () => mockLibrary,
}))

const RESOLVE = 'https://huggingface.co/example/anima-style/resolve/abc123'

function makeRepo(
  overrides: Partial<HuggingFaceLoraSearchItem> = {},
): HuggingFaceLoraSearchItem {
  return {
    repoId: 'example/anima-style',
    name: 'anima style',
    modelPageUrl: 'https://huggingface.co/example/anima-style',
    revision: 'abc123',
    files: [
      {
        filename: 'anima-style.safetensors',
        downloadUrl: `${RESOLVE}/anima-style.safetensors`,
        sizeBytes: 1024,
        baseModelFamily: 'illustrious',
      },
    ],
    triggerWord: 'anima style',
    type: 'style',
    baseModelFamily: 'illustrious',
    coverImageUrl: null,
    tags: ['lora'],
    downloads: 1200,
    likes: 8,
    license: 'apache-2.0',
    gated: false,
    private: false,
    ...overrides,
  }
}

const twoFiles = makeRepo({
  repoId: 'example/two-files',
  name: 'two files',
  files: [
    {
      filename: 'weights/epoch-10.safetensors',
      downloadUrl: `${RESOLVE}/weights/epoch-10.safetensors`,
      sizeBytes: 1024,
      baseModelFamily: 'illustrious',
    },
    {
      filename: 'weights/epoch-20.safetensors',
      downloadUrl: `${RESOLVE}/weights/epoch-20.safetensors`,
      sizeBytes: 2048,
      baseModelFamily: 'illustrious',
    },
  ],
})

function libraryState(overrides: Record<string, unknown> = {}) {
  return {
    items: [makeRepo(), twoFiles],
    search: '',
    debouncedSearch: '',
    baseModelFamily: 'all',
    sort: 'downloads',
    contentType: 'all',
    total: null,
    page: 1,
    hasNextPage: true,
    retrievedAt: '2026-09-28T01:00:00.000Z',
    retrievedAtFor: () => '2026-09-28T00:30:00.000Z',
    isLoading: false,
    isRevalidating: false,
    isReplacing: false,
    isLoadingMore: false,
    error: null,
    setSearch: vi.fn(),
    commitSearch: mockCommitSearch,
    setBaseModelFamily: mockSetBaseModelFamily,
    setSort: vi.fn(),
    setContentType: vi.fn(),
    nextPage: vi.fn(),
    previousPage: vi.fn(),
    loadMore: vi.fn(),
    refresh: vi.fn(),
    ...overrides,
  }
}

function renderBrowse(
  props: Partial<Parameters<typeof LoraHuggingFaceBrowse>[0]> = {},
) {
  const all = {
    sourceSwitch: <span>source</span>,
    onImport: vi.fn().mockResolvedValue(null),
    onUnfavoriteByUrl: vi.fn().mockResolvedValue(true),
    isFavorited: () => false,
    ...props,
  }
  render(<LoraHuggingFaceBrowse {...all} />)
  return all
}

describe('LoraHuggingFaceBrowse（库 B · Hugging Face）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Element.prototype.scrollIntoView = vi.fn()
    if (typeof globalThis.ResizeObserver === 'undefined') {
      class ResizeObserverStub {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      }
      globalThis.ResizeObserver =
        ResizeObserverStub as unknown as typeof ResizeObserver
    }
    mockStackItems = []
    mockLibrary = libraryState()
  })

  it('says how many are shown — Hugging Face reports no total, so none is made up', () => {
    renderBrowse()

    expect(
      screen.getByText('LoraWorkbench.browse:shownCount:{"count":"2"}'),
    ).toBeInTheDocument()
    expect(screen.getAllByText('↓ 1.2k · ♥ 8')).toHaveLength(2)
  })

  it('has no rating filter — the source does not rate', () => {
    renderBrowse()

    expect(
      screen.getByRole('button', { name: /LoraWorkbench:typeFilterLabel/ }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /LoraWorkbench:nsfwToggleHint/ }),
    ).toBeNull()
  })

  it('mounts a single-file repo in place — straight to the stack, not favorited', () => {
    const props = renderBrowse()

    fireEvent.click(
      screen.getByRole('button', {
        name: 'LoraWorkbench.browse:mountLabel:{"name":"anima style"}',
      }),
    )

    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'huggingface',
        loraUrl: `${RESOLVE}/anima-style.safetensors`,
        baseModelFamily: 'illustrious',
      }),
    )
    expect(props.onImport).not.toHaveBeenCalled()
  })

  it('sends a multi-file repo to its detail page to pick the file, then mounts that file', async () => {
    renderBrowse()

    fireEvent.click(
      screen.getByRole('button', {
        name: 'LoraWorkbench.browse:mountChooseLabel:{"name":"two files"}',
      }),
    )
    expect(mockPush).not.toHaveBeenCalled()
    expect(await screen.findByTestId('lora-library-detail')).toBeInTheDocument()
    expect(screen.getByText('LoraWorkbench.browse:files')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /epoch-20/ }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'LoraWorkbench.browse:mount' }),
    )
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        loraUrl: `${RESOLVE}/weights/epoch-20.safetensors`,
      }),
    )
  })

  it('favorites from the detail page with the snapshot of when that batch came back', async () => {
    const props = renderBrowse()

    fireEvent.click(screen.getByRole('button', { name: 'anima style' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'LoraWorkbench:favorite' }),
    )

    await waitFor(() =>
      expect(props.onImport).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'huggingface',
          loraUrl: `${RESOLVE}/anima-style.safetensors`,
          sourceSnapshot: expect.objectContaining({
            source: 'huggingface',
            retrievedAt: '2026-09-28T00:30:00.000Z',
          }),
        }),
      ),
    )
  })

  it('searches only on Enter, not while typing', () => {
    renderBrowse()

    const input = screen.getByRole('textbox', {
      name: 'LoraWorkbench:huggingFaceSearchPlaceholder',
    })
    fireEvent.change(input, { target: { value: 'roccia' } })
    expect(mockCommitSearch).not.toHaveBeenCalled()

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(mockCommitSearch).toHaveBeenCalledWith('roccia')
  })

  it('maps the base-model dropdown to the hub family', () => {
    renderBrowse()

    fireEvent.click(
      screen.getByRole('button', {
        name: /LoraWorkbench:baseModelFilterLabel/,
      }),
    )
    fireEvent.click(
      screen.getByRole('option', { name: 'LoraWorkbench:familyLabel.anima' }),
    )
    expect(mockSetBaseModelFamily).toHaveBeenCalledWith('anima-dit')
  })

  it('writes the real total once the end is reached', () => {
    mockLibrary = libraryState({ hasNextPage: false })
    renderBrowse()

    expect(screen.getByText('2')).toBeInTheDocument()
    expect(
      screen.getByText('LoraWorkbench.browse:end:{"count":"2"}'),
    ).toBeInTheDocument()
  })
})
