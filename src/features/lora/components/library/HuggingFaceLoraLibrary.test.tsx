import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LoraStackProvider } from '@/features/lora/hooks/use-active-lora-stack'
import { LORA_STACK_CLERK_ID } from '@/test/lora-stack'
import { PHONE_WIDTH, setViewport } from '@/test/viewport'
import type { HuggingFaceLoraSearchItem } from '@/types'

import { HuggingFaceLoraLibrary } from './HuggingFaceLoraLibrary'

// S3 统一详情抽屉（docs/references/pages/lora-workbench.md §2.4）：卡面不
// 再自带 file Select/import 按钮——点卡开抽屉，文件选择 + 收藏都在抽屉里。
// 真 useHuggingFaceLoraLibrary（+ 网址那层）、真挂载栈；只在 api-client 边界上假
// HF 列表那一跳，筛选是否生效看下一次请求带了什么。

const mockImport = vi.hoisted(() => vi.fn())
const mockUnfavoriteByUrl = vi.hoisted(() => vi.fn())
const mockSetSource = vi.hoisted(() => vi.fn())
const hf = vi.hoisted(() => ({ list: vi.fn() }))

// pane 自己读/写 family·q·sort·type 到 URL。
let mockLibraryQuery = ''

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}:${key}`,
  useFormatter: () => ({ number: (value: number) => String(value) }),
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

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, userId: LORA_STACK_CLERK_ID }),
}))

vi.mock('@/lib/api-client/lora-assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-client/lora-assets')>()),
  listHuggingFaceLoraAssetsAPI: hf.list,
}))

// 这批结果回到浏览器的那一刻 —— 导入时写进 sourceSnapshot.retrievedAt。
const RETRIEVED_AT = '2026-08-21T09:30:00.000Z'

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

function serve(item = makeItem()) {
  hf.list.mockResolvedValue({
    success: true,
    data: { items: [item], total: null, hasNextPage: false, nextCursor: null },
  })
}

type ListParams = {
  search?: string
  baseModelFamily?: string
  sort?: string
  contentType?: string
}
const lastListParams = (): ListParams =>
  hf.list.mock.calls.at(-1)?.[0] as ListParams

function renderLibrary(
  isFavorited: (loraUrl: string) => boolean = () => false,
) {
  // 搜索框 portal 进 LoraWorkbench 卡内那一格 —— 测试里手动接一个真实 DOM 节点当
  // 槽位，内容仍落在 document 里，screen 查询照常命中。
  const searchSlotNode = document.createElement('div')
  document.body.appendChild(searchSlotNode)
  return render(
    <LoraStackProvider>
      <HuggingFaceLoraLibrary
        onImport={mockImport}
        onUnfavoriteByUrl={mockUnfavoriteByUrl}
        isFavorited={isFavorited}
        searchSlotNode={searchSlotNode}
        source="huggingface"
        onSourceChange={mockSetSource}
      />
    </LoraStackProvider>,
  )
}

const openCard = async () =>
  fireEvent.click(await screen.findByRole('button', { name: 'anima style' }))

describe('HuggingFaceLoraLibrary', () => {
  beforeEach(() => {
    // 只假 Date：retrievedAt 落成固定时刻，setTimeout 照旧走真的（0ms 的 defer）。
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(RETRIEVED_AT))
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
    // 这个面板只剩手机（<1024）：封面网格 + 底部详情抽屉 + 筛选 sheet。
    setViewport(PHONE_WIDTH)
    window.localStorage.clear()
    mockLibraryQuery = ''
    mockImport.mockReset().mockResolvedValue(null)
    mockUnfavoriteByUrl.mockReset().mockResolvedValue(true)
    mockSetSource.mockReset()
    hf.list.mockReset()
    serve()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('opens grid cards in the detail drawer', async () => {
    renderLibrary()
    await screen.findByRole('button', { name: 'anima style' })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(
      screen.queryByText('weights/anima-style.safetensors'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'LoraWorkbench:useThisLora' }),
    ).not.toBeInTheDocument()

    await openCard()

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'LoraWorkbench:useThisLora' }),
    ).toBeInTheDocument()
  })

  it('opens the detail in a bottom drawer (not in place) on mobile, keeping the same primary action', async () => {
    renderLibrary()
    await screen.findByRole('button', { name: 'anima style' })

    // 网格形态：整张卡是一个按钮，卡上没有第二动作。
    expect(
      screen.queryByRole('button', { name: 'LoraWorkbench:useThisLora' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await openCard()

    // 抽屉（vaul → Radix Dialog）承载与桌面同一份详情：同一个主动作、同一个
    // 多文件选择门。
    const drawer = await screen.findByRole('dialog')
    expect(
      screen.getByRole('button', { name: 'LoraWorkbench:useThisLora' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('combobox', {
        name: 'LoraWorkbench:huggingFaceSelectFile',
      }),
    ).toBeInTheDocument()
    expect(drawer).toBeInTheDocument()
  })

  // <1024：顶栏那几行控件收成一行 chip + 底部筛选 sheet（pages/lora-library.md
  // 「移动端」）。桌面的类型/底模下拉与排序 Select 在这一档必须**不渲染**。
  it('collapses the desktop filter rows into a single chip row on mobile', async () => {
    renderLibrary()
    await screen.findByRole('button', { name: 'anima style' })

    expect(
      screen.queryByRole('button', {
        name: /LoraWorkbench:baseModelFilterLabel/,
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('combobox', {
        name: 'LoraWorkbench:communitySortFilter',
      }),
    ).not.toBeInTheDocument()

    expect(
      screen.getByRole('group', { name: 'LoraWorkbench:mobileFilterBar' }),
    ).toBeInTheDocument()
    // 来源 / 排序 / 筛选 / 刷新 —— 刷新不能在收敛里被丢掉。
    expect(
      screen.getByRole('button', {
        name: 'LoraWorkbench:librarySourceLabel：LoraWorkbench:librarySourceHuggingFace',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', {
        name: 'LoraWorkbench:communitySortFilter：LoraWorkbench:sortMostDownloaded',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'LoraWorkbench:refresh' }),
    ).toBeInTheDocument()
  })

  it('opens the filter sheet from the chip row and applies a type immediately (no draft state)', async () => {
    renderLibrary()
    await screen.findByRole('button', { name: 'anima style' })

    fireEvent.click(
      screen.getByRole('button', { name: 'LoraWorkbench:mobileFilters' }),
    )

    const sheet = await screen.findByRole('dialog')
    // 分区标签：来源 / 排序 / 类型 / 底模（HF 无分级，安全分区不渲染）。
    for (const label of [
      'LoraWorkbench:librarySourceLabel',
      'LoraWorkbench:communitySortFilter',
      'LoraWorkbench:libraryTypeFilter',
      'LoraWorkbench:libraryFamilyFilter',
    ]) {
      expect(
        within(sheet).getByRole('heading', { name: label }),
      ).toBeInTheDocument()
    }
    expect(
      within(sheet).queryByRole('heading', {
        name: 'LoraWorkbench:safetyLabel',
      }),
    ).not.toBeInTheDocument()

    // 点选项即生效（没有本地草稿）：下一次列表请求就带上这个类型。
    fireEvent.click(
      within(sheet).getByRole('button', { name: 'LoraWorkbench:typeStyle' }),
    )
    await waitFor(() => expect(lastListParams().contentType).toBe('style'))
  })

  it('shows the non-default filter count on the filter chip', async () => {
    mockLibraryQuery = 'type=style&family=flux'
    renderLibrary()

    await waitFor(() =>
      expect(screen.getByTestId('lora-mobile-filter-badge')).toHaveTextContent(
        '2',
      ),
    )
  })

  it('imports the exact SafeTensors file selected in the expanded detail (never files[0] silently)', async () => {
    renderLibrary()

    await openCard()

    // Multi-file repo: the select starts unselected — clicking favorite before
    // picking a file must not silently import files[0].
    fireEvent.click(
      await screen.findByRole('button', { name: 'LoraWorkbench:favorite' }),
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

  it('shows that no trigger was provided instead of inventing one from the repository name', async () => {
    const item = makeItem()
    item.triggerWord = ''
    serve(item)

    renderLibrary()
    await openCard()

    expect(
      await screen.findByText(/LoraWorkbench:huggingFaceNoTrigger/),
    ).toBeInTheDocument()
  })

  it('parses family/q/sort off the URL into the first request, including legacy family values', async () => {
    mockLibraryQuery = 'family=Illustrious&q=anime&sort=lastModified'

    renderLibrary()

    await waitFor(() => expect(hf.list).toHaveBeenCalled())
    expect(hf.list.mock.calls[0]?.[0]).toMatchObject({
      search: 'anime',
      baseModelFamily: 'illustrious',
      sort: 'lastModified',
    })
  })

  it('falls back to defaults for unknown query values instead of leaking them', async () => {
    mockLibraryQuery = 'family=not-a-real-family&sort=also-bogus'

    renderLibrary()

    await waitFor(() => expect(hf.list).toHaveBeenCalled())
    const first = hf.list.mock.calls[0]?.[0] as ListParams
    expect(first.baseModelFamily).toBe('all')
    expect(first.sort).not.toBe('also-bogus')
  })

  it('favorites a single-file repo from its expanded detail (auto-selected file)', async () => {
    const singleFileItem: HuggingFaceLoraSearchItem = {
      ...makeItem(),
      files: [makeItem().files[0]!],
    }
    serve(singleFileItem)

    renderLibrary()

    // Single-file repos auto-select the only file, so no explicit pick is needed.
    await openCard()
    fireEvent.click(
      await screen.findByRole('button', { name: 'LoraWorkbench:favorite' }),
    )

    expect(mockImport).toHaveBeenCalledWith(
      expect.objectContaining({
        loraUrl: singleFileItem.files[0]!.downloadUrl,
        baseModelFamily: 'anima-dit',
        // 策略 C：收藏也要带出处快照 —— 这个 pane 有两个导入点，
        // 「使用此 LoRA」与这里的「收藏」，少接一个就是一半的行没有出处。
        sourceSnapshot: expect.objectContaining({
          source: 'huggingface',
          retrievedAt: RETRIEVED_AT,
        }),
      }),
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
