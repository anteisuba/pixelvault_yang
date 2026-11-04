import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import {
  LoraStackProvider,
  useActiveLoraStack,
} from '@/features/lora/hooks/use-active-lora-stack'
import { LORA_STACK_CLERK_ID } from '@/test/lora-stack'
import type { HuggingFaceLoraSearchItem } from '@/types'

import { LoraHuggingFaceBrowse } from './LoraHuggingFaceBrowse'

// 真 useHuggingFaceLoraLibraryWithUrl（接着往下滚那种）、真挂载栈、真底模表（Runner
// 开关走环境变量）、真封面 / 详情 hook；只在 api-client 边界上假那几跳。
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_FF_COMFY_RUNNER = 'true'
})

// 和真 next-intl 一样，同一个命名空间回同一个 `t`（真 hook 的 effect 依赖它）。
const intl = vi.hoisted(() => {
  const byNamespace = new Map<
    string,
    (key: string, values?: Record<string, unknown>) => string
  >()
  const formatter = {
    number: (value: number) => value.toLocaleString('en-US'),
    relativeTime: () => 'now',
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

const nav = vi.hoisted(() => ({ params: new URLSearchParams() }))
vi.mock('next/navigation', () => ({
  useSearchParams: () => nav.params,
}))
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/studio/lora',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}))

const hf = vi.hoisted(() => ({ list: vi.fn() }))
vi.mock('@/lib/api-client/lora-assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-client/lora-assets')>()),
  listHuggingFaceLoraAssetsAPI: hf.list,
  // Hugging Face 的样例是 README 里的图；这里没有图。
  fetchHuggingFaceShowcaseAPI: async () => ({
    success: true,
    data: { images: [], prompts: [] },
  }),
  fetchCivitaiModelDescriptionAPI: async () => ({
    success: true,
    data: { descriptionText: null, versions: [] },
  }),
  mineCivitaiLoraPromptsAPI: async () => ({
    success: true,
    data: { recipes: [], previewImages: [] },
  }),
}))

// 这一批回到浏览器的那一刻 —— 收藏时写进 sourceSnapshot.retrievedAt。
const RETRIEVED_AT = '2026-09-28T00:30:00.000Z'

afterAll(() => {
  delete process.env.NEXT_PUBLIC_FF_COMFY_RUNNER
})

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

type ListParams = {
  search?: string
  baseModelFamily?: string
  page?: number
}
const listCalls = (): ListParams[] =>
  hf.list.mock.calls.map((call) => call[0] as ListParams)

function serve(overrides: Record<string, unknown> = {}) {
  hf.list.mockImplementation(async () => ({
    success: true,
    data: {
      items: [makeRepo(), twoFiles],
      total: null,
      hasNextPage: true,
      nextCursor: 'next',
      ...overrides,
    },
  }))
}

/** 挂载栈里现在有哪几个文件（按链接）。 */
function StackProbe() {
  const stack = useActiveLoraStack()
  return (
    <output aria-label="stack">
      {stack.items.map((entry) => entry.asset.loraUrl).join(',')}
    </output>
  )
}
const stackText = () => screen.getByRole('status', { name: 'stack' })

async function renderBrowse(
  props: Partial<Parameters<typeof LoraHuggingFaceBrowse>[0]> = {},
) {
  const all = {
    sourceSwitch: <span>source</span>,
    onImport: vi.fn().mockResolvedValue(null),
    onUnfavoriteByUrl: vi.fn().mockResolvedValue(true),
    isFavorited: () => false,
    ...props,
  }
  render(
    <LoraStackProvider>
      <LoraHuggingFaceBrowse {...all} />
      <StackProbe />
    </LoraStackProvider>,
  )
  await screen.findByRole('button', { name: 'anima style' })
  return all
}

/** 名叫 `name` 那一格的「更多」打开（挂载收在里面）。 */
function openMoreOf(name: string) {
  const tile = screen.getByRole('button', { name }).parentElement as HTMLElement
  fireEvent.pointerDown(
    within(tile).getByRole('button', { name: 'LoraWorkbench.browse:more' }),
    { button: 0, ctrlKey: false },
  )
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
    // 只假 Date：retrievedAt 落成固定时刻，setTimeout 照旧走真的（0ms 的 defer）。
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(RETRIEVED_AT))
    window.localStorage.clear()
    nav.params = new URLSearchParams()
    hf.list.mockReset()
    serve()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('writes downloads and likes under each name', async () => {
    await renderBrowse()

    expect(screen.getAllByText('↓ 1.2k · ♥ 8')).toHaveLength(2)
  })

  it('has no rating filter — the source does not rate', async () => {
    await renderBrowse()

    expect(
      screen.getByRole('tablist', { name: 'LoraWorkbench:typeFilterLabel' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /LoraWorkbench:nsfwToggleHint/ }),
    ).toBeNull()
  })

  it('mounts a single-file repo in place — straight to the stack, not favorited', async () => {
    const props = await renderBrowse()

    openMoreOf('anima style')
    fireEvent.click(
      screen.getByRole('menuitem', {
        name: 'LoraWorkbench.browse:mountLabel:{"name":"anima style"}',
      }),
    )

    await waitFor(() =>
      expect(stackText()).toHaveTextContent(
        `${RESOLVE}/anima-style.safetensors`,
      ),
    )
    expect(props.onImport).not.toHaveBeenCalled()
  })

  it('sends a multi-file repo to its detail page to pick the file, then mounts that file', async () => {
    await renderBrowse()

    openMoreOf('two files')
    fireEvent.click(
      screen.getByRole('menuitem', {
        name: 'LoraWorkbench.browse:mountChooseLabel:{"name":"two files"}',
      }),
    )
    expect(stackText()).toBeEmptyDOMElement()
    expect(await screen.findByTestId('lora-library-detail')).toBeInTheDocument()
    expect(screen.getByText('LoraWorkbench.browse:files')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /epoch-20/ }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'LoraWorkbench.browse:mount' }),
    )
    await waitFor(() =>
      expect(stackText()).toHaveTextContent(
        `${RESOLVE}/weights/epoch-20.safetensors`,
      ),
    )
  })

  it('favorites from the detail page with the snapshot of when that batch came back', async () => {
    const props = await renderBrowse()

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
            retrievedAt: RETRIEVED_AT,
          }),
        }),
      ),
    )
  })

  it('searches only on Enter, not while typing', async () => {
    await renderBrowse()

    const input = screen.getByRole('textbox', {
      name: 'LoraWorkbench:huggingFaceSearchPlaceholder',
    })
    fireEvent.change(input, { target: { value: 'roccia' } })
    expect(listCalls().map((params) => params.search)).not.toContain('roccia')

    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() =>
      expect(listCalls().at(-1)).toMatchObject({ search: 'roccia', page: 1 }),
    )
  })

  it('maps the base-model dropdown to the hub family', async () => {
    await renderBrowse()

    fireEvent.click(
      screen.getByRole('button', {
        name: /LoraWorkbench:baseModelFilterLabel/,
      }),
    )
    fireEvent.click(
      screen.getByRole('option', { name: 'LoraWorkbench:familyLabel.anima' }),
    )
    await waitFor(() =>
      expect(listCalls().at(-1)?.baseModelFamily).toBe('anima-dit'),
    )
  })

  it('writes the real total once the end is reached', async () => {
    serve({ hasNextPage: false, nextCursor: null })
    await renderBrowse()

    expect(
      screen.getByText('LoraWorkbench.browse:end:{"count":"2"}'),
    ).toBeInTheDocument()
  })
})
