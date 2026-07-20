import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { HuggingFaceLoraSearchItem } from '@/types'

import { HuggingFaceLoraLibrary } from './HuggingFaceLoraLibrary'

// S3 统一详情抽屉（docs/references/pages/lora-workbench.md §2.4）：卡面不
// 再自带 file Select/import 按钮——点卡开抽屉，文件选择 + 收藏都在抽屉里。
// 这个文件之前直接在卡上测试 import 流程，S3 后改成「点卡 → 抽屉出现 →
// 抽屉内选文件 → 点收藏」。

const mockUseHuggingFaceLoraLibrary = vi.hoisted(() => vi.fn())
const mockImport = vi.hoisted(() => vi.fn())
const mockUnfavoriteByUrl = vi.hoisted(() => vi.fn())
const mockStackPush = vi.hoisted(() => vi.fn())
const mockSetBaseModelFamily = vi.hoisted(() => vi.fn())
const mockSetSort = vi.hoisted(() => vi.fn())
const mockSetContentType = vi.hoisted(() => vi.fn())

// S1 统一外壳：pane 现在自己读/写 family·q·sort 到 URL（与 civitai pane 同
// 一套约定），所以需要和 LoraWorkbench.library.test.tsx 一样 mock 导航钩子。
let mockLibraryQuery = ''

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}:${key}`,
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    message: vi.fn(),
  },
}))

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(mockLibraryQuery),
}))

vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/studio/lora',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}))

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}))

vi.mock('@/hooks/use-active-lora-stack', () => ({
  useActiveLoraStack: () => ({
    items: [],
    push: mockStackPush,
    setScale: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
  }),
}))

vi.mock('@/hooks/use-huggingface-lora-library', () => ({
  useHuggingFaceLoraLibrary: mockUseHuggingFaceLoraLibrary,
}))

function makeItem(): HuggingFaceLoraSearchItem {
  return {
    repoId: 'example/anima-style',
    name: 'anima style',
    modelPageUrl: 'https://huggingface.co/example/anima-style',
    revision: 'abc123',
    files: [
      {
        filename: 'weights/anima-style.safetensors',
        downloadUrl:
          'https://huggingface.co/example/anima-style/resolve/abc123/weights/anima-style.safetensors',
        sizeBytes: 1024,
        baseModelFamily: 'anima-dit',
      },
      {
        filename: 'weights/anima-style-v2.safetensors',
        downloadUrl:
          'https://huggingface.co/example/anima-style/resolve/abc123/weights/anima-style-v2.safetensors',
        sizeBytes: 2048,
        baseModelFamily: 'pony',
      },
    ],
    triggerWord: 'anima style',
    type: 'style',
    baseModelFamily: 'anima-dit',
    coverImageUrl: null,
    tags: ['lora', 'base_model:anima'],
    downloads: 120,
    likes: 8,
    license: 'apache-2.0',
    gated: false,
    private: false,
  }
}

function libraryState(item = makeItem()) {
  return {
    items: [item],
    search: '',
    debouncedSearch: '',
    baseModelFamily: 'all' as const,
    sort: 'downloads' as const,
    contentType: 'all' as const,
    total: null,
    page: 1,
    hasNextPage: false,
    isLoading: false,
    isRevalidating: false,
    error: null,
    setSearch: vi.fn(),
    setBaseModelFamily: mockSetBaseModelFamily,
    setSort: mockSetSort,
    setContentType: mockSetContentType,
    nextPage: vi.fn(),
    previousPage: vi.fn(),
    refresh: vi.fn(),
  }
}

function renderLibrary(
  isFavorited: (loraUrl: string) => boolean = () => false,
) {
  // R1：搜索/排序/刷新挪去调用方（LoraLibraryTabs/LoraWorkbench）持有的常驻
  // 顶栏槽，通过 portal 挂进去——测试里手动接真实 DOM 节点当槽位，内容仍落
  // 在 document 里，screen 查询照常命中。
  const searchSlotNode = document.createElement('div')
  document.body.appendChild(searchSlotNode)
  const controlsSlotNode = document.createElement('div')
  document.body.appendChild(controlsSlotNode)
  return render(
    <HuggingFaceLoraLibrary
      onImport={mockImport}
      onUnfavoriteByUrl={mockUnfavoriteByUrl}
      isFavorited={isFavorited}
      searchSlotNode={searchSlotNode}
      controlsSlotNode={controlsSlotNode}
    />,
  )
}

describe('HuggingFaceLoraLibrary', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn()
    // jsdom has no ResizeObserver; cmdk (the base-model filter combobox) calls
    // it on mount. Stub a no-op so opening the dropdown doesn't crash.
    if (typeof globalThis.ResizeObserver === 'undefined') {
      class ResizeObserverStub {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      }
      globalThis.ResizeObserver =
        ResizeObserverStub as unknown as typeof ResizeObserver
    }
    mockLibraryQuery = ''
    mockImport.mockReset().mockResolvedValue(null)
    mockUnfavoriteByUrl.mockReset().mockResolvedValue(true)
    mockStackPush.mockReset()
    mockSetBaseModelFamily.mockReset()
    mockSetSort.mockReset()
    mockSetContentType.mockReset()
    mockUseHuggingFaceLoraLibrary.mockReset().mockReturnValue(libraryState())
  })

  it('expands the detail in place when a row is clicked, with no file-select chrome on the collapsed row', () => {
    renderLibrary()

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(
      screen.queryByText('weights/anima-style.safetensors'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'LoraWorkbench:useThisLora' }),
    ).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'anima style' }))

    // In-place detail — not a dialog — with the confirmed primary action.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'LoraWorkbench:useThisLora' }),
    ).toBeInTheDocument()
  })

  it('imports the exact SafeTensors file selected in the expanded detail (never files[0] silently)', async () => {
    renderLibrary()

    fireEvent.click(screen.getByRole('button', { name: 'anima style' }))

    // Multi-file repo: the select starts unselected — clicking favorite before
    // picking a file must not silently import files[0].
    fireEvent.click(
      screen.getByRole('button', { name: 'LoraWorkbench:favorite' }),
    )
    expect(mockImport).not.toHaveBeenCalled()

    fireEvent.click(
      screen.getByRole('combobox', {
        name: 'LoraWorkbench:huggingFaceSelectFile',
      }),
    )
    fireEvent.click(
      screen.getByRole('option', {
        name: 'anima-style-v2.safetensors · pony',
      }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'LoraWorkbench:favorite' }),
    )

    await waitFor(() => {
      expect(mockImport).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'huggingface',
          loraUrl: expect.stringContaining('anima-style-v2.safetensors'),
          baseModelFamily: 'pony',
        }),
      )
    })
  })

  it('shows that no trigger was provided instead of inventing one from the repository name', () => {
    const item = makeItem()
    item.triggerWord = ''
    mockUseHuggingFaceLoraLibrary.mockReturnValue(libraryState(item))

    renderLibrary()
    fireEvent.click(screen.getByRole('button', { name: 'anima style' }))

    expect(
      screen.getByText(/LoraWorkbench:huggingFaceNoTrigger/),
    ).toBeInTheDocument()
  })

  it('maps the base-model dropdown selection to the hub family slug', () => {
    renderLibrary()

    // R1: family filter is a searchable dropdown now (not a chip row). Open it
    // and pick the Anima option → hook receives the source-specific family.
    fireEvent.click(
      screen.getByRole('button', {
        name: /LoraWorkbench:baseModelFilterLabel/,
      }),
    )
    fireEvent.click(
      screen.getByRole('option', {
        name: 'LoraWorkbench:familyLabel.anima',
      }),
    )
    expect(mockSetBaseModelFamily).toHaveBeenCalledWith('anima-dit')
  })

  it('renders a sort control that maps to the Hub sort values', () => {
    renderLibrary()

    // Default sort ('downloads') shows as the closed trigger's value.
    expect(
      screen.getByRole('combobox', {
        name: 'LoraWorkbench:communitySortFilter',
      }),
    ).toHaveTextContent('LoraWorkbench:sortMostDownloaded')

    // civitai 排序三值复用的 labelKey：推荐/最多下载/最新——open the popover
    // to confirm all three options are present (Radix only renders option
    // text once open).
    fireEvent.click(
      screen.getByRole('combobox', {
        name: 'LoraWorkbench:communitySortFilter',
      }),
    )
    expect(
      screen.getByRole('option', { name: 'LoraWorkbench:sortHighestRated' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('option', { name: 'LoraWorkbench:sortNewest' }),
    ).toBeInTheDocument()
  })

  it('parses family/q/sort off the URL into the hook initial seed, including legacy family values', () => {
    mockLibraryQuery = 'family=Illustrious&q=anime&sort=lastModified'

    renderLibrary()

    expect(mockUseHuggingFaceLoraLibrary).toHaveBeenCalledWith(
      expect.objectContaining({
        initialSearch: 'anime',
        initialBaseModelFamily: 'illustrious',
        initialSort: 'lastModified',
      }),
    )
  })

  it('falls back to defaults for unknown query values instead of leaking them', () => {
    mockLibraryQuery = 'family=not-a-real-family&sort=also-bogus'

    renderLibrary()

    expect(mockUseHuggingFaceLoraLibrary).toHaveBeenCalledWith(
      expect.objectContaining({
        initialBaseModelFamily: 'all',
        initialSort: undefined,
      }),
    )
  })

  it('favorites a single-file repo from its expanded detail (auto-selected file)', () => {
    const singleFileItem: HuggingFaceLoraSearchItem = {
      ...makeItem(),
      files: [makeItem().files[0]!],
    }
    mockUseHuggingFaceLoraLibrary.mockReturnValue(libraryState(singleFileItem))

    renderLibrary()

    // Expand the row first — favorite lives in the in-place detail. Single-file
    // repos auto-select the only file, so no explicit pick is needed.
    fireEvent.click(screen.getByRole('button', { name: 'anima style' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'LoraWorkbench:favorite' }),
    )

    expect(mockImport).toHaveBeenCalledWith(
      expect.objectContaining({
        loraUrl: singleFileItem.files[0]!.downloadUrl,
        baseModelFamily: 'anima-dit',
      }),
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
