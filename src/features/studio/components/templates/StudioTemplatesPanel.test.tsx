import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { API_ENDPOINTS, IMAGE_GENERATION } from '@/constants/config'
import { AI_MODELS } from '@/constants/models'
import { __resetRecipesCacheForTests } from '@/features/prompts/hooks/use-recipes'
import { renderWithApp } from '@/test/app-harness'
import { stubBrowserLayout } from '@/test/browser-stubs'
import { generationFixture } from '@/test/generation-fixture'
import { text } from '@/test/i18n-text'
import {
  fakeStudioServer,
  renderWithStudio,
  resetCharacterCardsCache,
} from '@/test/studio-harness'
import type { RecipeRecord } from '@/types'

import { StudioTemplatesPanel } from './StudioTemplatesPanel'

/**
 * 模板面板（模板 C），全程真的：真 `useRecipes`（会话缓存 + 真 api-client）、真「存成模板」框、
 * 真确认窗、真文案；工作台那一份「最近一张」走真生成。只假网络（模板的列、建、改、删）。
 * 「存下了什么」看服务端收到的请求体；「列表变成什么样」看卡片。
 */

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: 'user-tpl' }),
}))
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/studio/image',
  useRouter: () => ({ push: vi.fn() }),
}))

const T = (key: string, values?: Record<string, string | number>) =>
  text(`StudioTemplates.${key}`, values)
const ok = (data: unknown) => Response.json({ success: true, data })

function recipe(overrides: Partial<RecipeRecord>): RecipeRecord {
  return {
    id: 'r',
    userId: 'u',
    outputType: 'IMAGE',
    name: 'Template',
    compiledPrompt: 'a prompt',
    negativePrompt: null,
    modelId: 'gpt-image-2',
    provider: 'OpenAI',
    params: {},
    parentGenerationId: null,
    version: 1,
    isDeleted: false,
    createdAt: '2026-09-20T00:00:00.000Z',
    updatedAt: '2026-09-20T00:00:00.000Z',
    ...overrides,
  }
}

const IMAGE = recipe({
  id: 'image',
  name: '雨夜人像',
  createdAt: '2026-09-25T00:00:00.000Z',
})
const OLDER = recipe({
  id: 'older',
  name: '清晨街景',
  compiledPrompt: '老城街道',
  createdAt: '2026-09-01T00:00:00.000Z',
})
const VIDEO = recipe({ id: 'video', name: 'Video one', outputType: 'VIDEO' })
const LORA = recipe({
  id: 'lora',
  name: 'LoRA one',
  params: {
    advancedParams: {
      loras: [{ url: 'https://civitai.com/api/download/models/2', scale: 1 }],
    },
  },
})
const TAGS = recipe({
  id: 'tags',
  name: 'Tag one',
  params: { promptDialect: 'tags' },
})

const SAVE = {
  outputType: 'IMAGE' as const,
  prompt: '雨夜霓虹街头的少女\n第二行',
  params: { aspectRatio: '1:1' },
  modelId: 'gpt-image-2',
  provider: 'OpenAI',
}

/** 服务端那张模板表 + 收到过的写请求。 */
let store: RecipeRecord[] = []
let created: Array<Record<string, unknown>> = []
let updated: Array<{ id: string; body: Record<string, unknown> }> = []
let deleted: string[] = []
let server: ReturnType<typeof fakeStudioServer>

function installServer() {
  server = fakeStudioServer()
    .on('GET', API_ENDPOINTS.RECIPES, () =>
      ok({ recipes: store, total: store.length, page: 1, limit: 50 }),
    )
    .on('POST', API_ENDPOINTS.RECIPES, async (request) => {
      const body = (await request.json()) as Record<string, unknown>
      created.push(body)
      const row = recipe({
        ...(body as Partial<RecipeRecord>),
        id: `new-${created.length}`,
        createdAt: '2026-10-01T00:00:00.000Z',
      })
      store = [row, ...store]
      return ok(row)
    })
    .on(
      'PATCH',
      `${API_ENDPOINTS.RECIPES}/:id`,
      async (request, { params }) => {
        const { id } = await params
        const body = (await request.json()) as Record<string, unknown>
        updated.push({ id, body })
        const row = {
          ...store.find((r) => r.id === id)!,
          ...body,
        } as RecipeRecord
        store = store.map((r) => (r.id === id ? row : r))
        return ok(row)
      },
    )
    .on('DELETE', `${API_ENDPOINTS.RECIPES}/:id`, async (_r, { params }) => {
      const { id } = await params
      deleted.push(id)
      store = store.filter((r) => r.id !== id)
      return ok({ id })
    })
}

beforeAll(() => {
  // jsdom 没有 `scrollIntoView`（面板打开时把标题滚到看得见）。
  Element.prototype.scrollIntoView = vi.fn()
})
beforeEach(() => {
  stubBrowserLayout()
  __resetRecipesCacheForTests()
  resetCharacterCardsCache()
  store = [OLDER, VIDEO, LORA, TAGS, IMAGE]
  created = []
  updated = []
  deleted = []
  installServer()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

type PanelProps = Parameters<typeof StudioTemplatesPanel>[0]

/** 不在工作台里（宿主自己给 `save.lastGeneration`，或者没有最近一张）。 */
async function renderPanel(overrides: Partial<PanelProps> = {}) {
  const onApply = vi.fn()
  const onClose = vi.fn()
  const view = renderWithApp(
    <StudioTemplatesPanel
      dialect="natural"
      save={SAVE}
      onApply={onApply}
      onClose={onClose}
      {...overrides}
    />,
  )
  return { onApply, onClose, ...view }
}

const applyButtons = () =>
  screen
    .getAllByRole('button', { name: /^套用「/ })
    .map((button) => button.getAttribute('aria-label'))

/** 打开「存成模板」框，用它的默认（名字取首行、全勾、不挂角色）点「存」。 */
function saveWithDefaults() {
  fireEvent.click(screen.getByRole('button', { name: T('save') }))
  fireEvent.click(
    screen.getByRole('button', { name: text('SaveTemplate.save') }),
  )
}

describe('模板面板（模板 C）', () => {
  it('首次加载还没数出来时，标题写「…」不写「0」', async () => {
    server.on('GET', API_ENDPOINTS.RECIPES, () => new Promise(() => {}))
    await renderPanel()
    expect(
      screen.getByText(T('titleImage', { count: '…' })),
    ).toBeInTheDocument()
  })

  it('图片台只列图片模板，新的在前；点一张即套用', async () => {
    const { onApply } = await renderPanel()
    expect(
      await screen.findByText(T('titleImage', { count: 2 })),
    ).toBeInTheDocument()
    expect(applyButtons()).toEqual([
      T('apply', { name: '雨夜人像' }),
      T('apply', { name: '清晨街景' }),
    ])
    fireEvent.click(
      screen.getByRole('button', { name: T('apply', { name: '雨夜人像' }) }),
    )
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining(IMAGE))
  })

  it('标签台列 LoRA 与标签台存的，LoRA 那张带角标', async () => {
    await renderPanel({ dialect: 'tags' })
    expect(
      await screen.findByText(T('titleTags', { count: 2 })),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: T('apply', { name: 'LoRA one' }) }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: T('apply', { name: 'Tag one' }) }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: T('apply', { name: '雨夜人像' }) }),
    ).toBeNull()
    expect(screen.getAllByText(T('lora'))).toHaveLength(1)
  })

  it('搜索过滤；没有结果时给一句话和「清空搜索」', async () => {
    await renderPanel()
    await screen.findByText(T('titleImage', { count: 2 }))
    const search = screen.getByRole('searchbox', { name: T('search') })
    fireEvent.change(search, { target: { value: '老城' } })
    // 被筛掉的卡要演完退场才摘掉。
    await waitFor(() => expect(applyButtons()).toHaveLength(1))
    fireEvent.change(search, { target: { value: '赛博朋克' } })
    expect(
      screen.getByText(T('noResult', { query: '赛博朋克' })),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: T('clearSearch') }))
    expect(applyButtons()).toHaveLength(2)
  })

  it('这一台一条都没有时说清怎么存', async () => {
    store = [VIDEO]
    await renderPanel()
    expect(await screen.findByText(T('emptyImage'))).toBeInTheDocument()
    expect(screen.getByText(T('emptyHintImage'))).toBeInTheDocument()
  })

  it('LoRA 台：列标签模板、说明换成 LoRA 那一句；存下挂台自己给的那一张', async () => {
    const params = { aspectRatio: '1:1', loraSetup: { baseId: 'b', items: [] } }
    await renderPanel({
      dialect: 'tags',
      bench: 'lora',
      save: {
        ...SAVE,
        prompt: 'rossi',
        params,
        lastGeneration: {
          id: 'lora-gen',
          outputType: 'IMAGE',
          url: 'https://cdn.test/lora.png',
        },
      },
    })
    expect(screen.getByText(T('footLora'))).toBeInTheDocument()
    expect(
      await screen.findByRole('button', {
        name: T('apply', { name: 'LoRA one' }),
      }),
    ).toBeInTheDocument()
    saveWithDefaults()
    await waitFor(() => expect(created).toHaveLength(1))
    expect(created[0]).toMatchObject({ params, parentGenerationId: 'lora-gen' })
    // 封面就是台给的那一张。
    expect(await screen.findByText(T('savedWithCover'))).toBeInTheDocument()
  })

  it('工作台里「存下」：名字取首行、出处与封面挂刚出的最近一张', async () => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
    })
    const last = generationFixture({
      id: 'gen-1',
      url: 'https://cdn.test/1.png',
      thumbnailUrl: 'https://cdn.test/1-thumb.png',
    })
    server
      .on('POST', API_ENDPOINTS.STUDIO_GENERATE, () =>
        ok({ jobId: 'job-1', requestId: 'req-1' }),
      )
      .on('GET', API_ENDPOINTS.STUDIO_GENERATE_STATUS, () =>
        ok({ jobId: 'job-1', status: 'COMPLETED', generation: last }),
      )
    const { studio } = renderWithStudio(
      <StudioTemplatesPanel
        dialect="natural"
        save={SAVE}
        onApply={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    await act(async () => {
      void studio.current.generation.generate({
        mode: 'image',
        image: {
          modelId: AI_MODELS.OPENAI_GPT_IMAGE_2,
          freePrompt: 'x',
          aspectRatio: '1:1',
        },
      })
      await vi.advanceTimersByTimeAsync(IMAGE_GENERATION.POLL_INTERVAL_MS)
    })
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(studio.current.generation.lastGeneration?.id).toBe('gen-1')
    vi.useRealTimers()

    saveWithDefaults()
    expect(
      await screen.findByText(T('savedTitle', { name: '雨夜霓虹街头的少女' })),
    ).toBeInTheDocument()
    expect(created).toEqual([
      {
        name: '雨夜霓虹街头的少女',
        outputType: 'IMAGE',
        compiledPrompt: SAVE.prompt,
        modelId: 'gpt-image-2',
        provider: 'OpenAI',
        params: SAVE.params,
        parentGenerationId: 'gen-1',
      },
    ])
    const card = await screen.findByRole('button', {
      name: T('apply', { name: '雨夜霓虹街头的少女' }),
    })
    expect(card.querySelector('img')?.getAttribute('src')).toContain(
      '1-thumb.png',
    )
  })

  it('新建：自己填名字和提示词，存完回到列表，焦点落在新的那张', async () => {
    await renderPanel()
    await screen.findByText(T('titleImage', { count: 2 }))
    fireEvent.click(screen.getByRole('button', { name: T('create') }))
    const name = screen.getByRole('textbox', { name: T('nameLabel') })
    expect(name).toHaveFocus()
    fireEvent.change(name, { target: { value: '我的模板' } })
    fireEvent.change(screen.getByRole('textbox', { name: T('promptLabel') }), {
      target: { value: '一只橘猫' },
    })
    fireEvent.click(screen.getByRole('button', { name: T('saveForm') }))
    await waitFor(() => expect(created).toHaveLength(1))
    expect(created[0]).toMatchObject({
      name: '我的模板',
      compiledPrompt: '一只橘猫',
    })
    expect(
      await screen.findByText(T('titleImage', { count: 3 })),
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: T('apply', { name: '我的模板' }) }),
      ).toHaveFocus(),
    )
  })

  it('⋯ → 改名：就地改，回车保存，整份字段一起送回去', async () => {
    await renderPanel()
    const more = await screen.findByRole('button', {
      name: T('more', { name: '雨夜人像' }),
    })
    fireEvent.keyDown(more, { key: 'Enter' })
    fireEvent.click(await screen.findByRole('menuitem', { name: T('rename') }))
    const input = await screen.findByRole('textbox', {
      name: T('renameLabel'),
    })
    fireEvent.change(input, { target: { value: '雨夜 · 红裙' } })
    // 回车被吞掉：焦点这一拍就回到卡上，不吞的话紧跟的 keypress 会顺手套用它。
    expect(fireEvent.keyDown(input, { key: 'Enter' })).toBe(false)
    fireEvent.blur(input)
    // 焦点回到同一张卡（它的名字已经换了）。
    await waitFor(() =>
      expect(
        screen.getByRole('button', {
          name: T('apply', { name: '雨夜 · 红裙' }),
        }),
      ).toHaveFocus(),
    )
    await waitFor(() => expect(updated).toHaveLength(1))
    expect(updated[0]).toEqual({
      id: 'image',
      body: {
        name: '雨夜 · 红裙',
        outputType: 'IMAGE',
        compiledPrompt: 'a prompt',
        modelId: 'gpt-image-2',
        provider: 'OpenAI',
        params: {},
      },
    })
  })

  it('⋯ → 删除：先弹确认窗（owner 10-27），点删除才删', async () => {
    await renderPanel()
    fireEvent.keyDown(
      await screen.findByRole('button', {
        name: T('more', { name: '雨夜人像' }),
      }),
      { key: 'Enter' },
    )
    fireEvent.click(await screen.findByRole('menuitem', { name: T('delete') }))
    expect(deleted).toHaveLength(0)
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent(T('deleteTitle'))
    fireEvent.click(
      screen.getByRole('button', {
        name: text('Feedback.deleteDialog.confirm'),
      }),
    )
    await waitFor(() => expect(deleted).toEqual(['image']))
    // 删掉的那张在退场：焦点落到标题，⛔ 不掉到 body 上。
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: T('titleImage', { count: 1 }) }),
      ).toHaveFocus(),
    )
  })

  it('Esc 收起面板；新建表单开着时 Esc 先回列表', async () => {
    const { onClose } = await renderPanel()
    fireEvent.click(screen.getByRole('button', { name: T('create') }))
    fireEvent.keyDown(screen.getByRole('textbox', { name: T('nameLabel') }), {
      key: 'Escape',
    })
    expect(onClose).not.toHaveBeenCalled()
    const search = screen.getByRole('searchbox', { name: T('search') })
    expect(screen.getByRole('button', { name: T('create') })).toHaveFocus()
    fireEvent.keyDown(search, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('视频台只列视频模板；存下时 ⛔ 挂别档的上一件', async () => {
    await renderPanel({
      save: {
        ...SAVE,
        outputType: 'VIDEO',
        prompt: '海边日落',
        lastGeneration: {
          id: 'gen-1',
          outputType: 'IMAGE',
          thumbnailUrl: 'https://cdn.test/1.png',
        },
      },
    })
    expect(
      await screen.findByText(T('titleVideo', { count: 1 })),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: T('apply', { name: 'Video one' }) }),
    ).toBeInTheDocument()
    saveWithDefaults()
    await waitFor(() => expect(created).toHaveLength(1))
    // 最近那一件是图片 —— 不是这一台的，⛔ 当成视频模板的出处和封面。
    expect(created[0]).not.toHaveProperty('parentGenerationId')
    expect(await screen.findByText(T('savedNoCover'))).toBeInTheDocument()
  })

  it('视频的封面只认封面帧，⛔ 把视频文件当成图画出来', async () => {
    const { container } = await renderPanel({
      save: {
        ...SAVE,
        outputType: 'VIDEO',
        lastGeneration: {
          id: 'gen-v',
          outputType: 'VIDEO',
          thumbnailUrl: null,
          url: 'https://cdn.test/clip.mp4',
        },
      },
    })
    await screen.findByText(T('titleVideo', { count: 1 }))
    expect(container.querySelector('img[src*=".mp4"]')).toBeNull()
  })

  it('手机版：‹ 返回 · 标题 · ＋，搜索独占一行，⛔ 没有底下那行说明', async () => {
    const { onClose } = await renderPanel({ variant: 'phone' })
    expect(
      await screen.findByText(T('titleImage', { count: 2 })),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('searchbox', { name: T('search') }),
    ).toBeInTheDocument()
    expect(screen.queryByText(T('footImage'))).toBeNull()
    expect(screen.queryByRole('button', { name: T('manage') })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: T('create') }))
    expect(screen.getByRole('textbox', { name: T('nameLabel') })).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: T('back') }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('提示词不在舞台下面时，空着的那张 ⛔ 说「在下面写」', async () => {
    await renderPanel({ save: { ...SAVE, prompt: '' }, promptBelow: false })
    expect(screen.getByText(T('nowEmptyPrompt'))).toBeInTheDocument()
    expect(screen.queryByText(T('nowEmptyImage'))).toBeNull()
  })

  it('⋯ 菜单里的 Esc 只收菜单，⛔ 不连面板一起收', async () => {
    const { onClose } = await renderPanel()
    fireEvent.keyDown(
      await screen.findByRole('button', {
        name: T('more', { name: '雨夜人像' }),
      }),
      { key: 'Enter' },
    )
    fireEvent.keyDown(
      await screen.findByRole('menuitem', { name: T('rename') }),
      { key: 'Escape' },
    )
    expect(onClose).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  })
})
