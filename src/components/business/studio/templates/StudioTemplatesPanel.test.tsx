import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { RecipeRecord } from '@/types'

const mocks = vi.hoisted(() => ({
  recipes: [] as RecipeRecord[],
  isLoading: false,
  lastGeneration: {
    id: 'gen-1',
    outputType: 'IMAGE',
    thumbnailUrl: 'https://cdn.test/1.png',
  } as {
    id: string
    outputType: string
    thumbnailUrl: string | null
    url?: string
  } | null,
  addRecipe: vi.fn(),
  replaceRecipe: vi.fn(),
  removeRecipe: vi.fn(),
  restoreRecipe: vi.fn(),
  refresh: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  push: vi.fn(),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${Object.values(values).join(',')}` : key,
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}))
vi.mock('@/contexts/studio-context', () => ({
  useStudioGen: () => ({ lastGeneration: mocks.lastGeneration }),
}))
vi.mock('@/hooks/prompts/use-recipes', () => ({
  useRecipes: () => ({
    recipes: mocks.recipes,
    isLoading: mocks.isLoading,
    error: false,
    refresh: mocks.refresh,
    addRecipe: mocks.addRecipe,
    replaceRecipe: mocks.replaceRecipe,
    removeRecipe: mocks.removeRecipe,
    restoreRecipe: mocks.restoreRecipe,
  }),
}))
vi.mock('@/lib/api-client/recipes', () => ({
  createRecipeAPI: mocks.create,
  updateRecipeAPI: mocks.update,
  deleteRecipeAPI: mocks.remove,
}))

import { StudioTemplatesPanel } from './StudioTemplatesPanel'

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
  } as RecipeRecord
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
  params: { advancedParams: { loras: [{ id: 'style', weight: 1 }] } },
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

function renderPanel(
  overrides: Partial<Parameters<typeof StudioTemplatesPanel>[0]> = {},
) {
  const onApply = vi.fn()
  const onClose = vi.fn()
  render(
    <StudioTemplatesPanel
      dialect="natural"
      save={SAVE}
      onApply={onApply}
      onClose={onClose}
      {...overrides}
    />,
  )
  return { onApply, onClose }
}

describe('模板面板（模板 C）', () => {
  beforeAll(() => {
    // jsdom 没有 `scrollIntoView`（面板打开时把标题滚到看得见）。
    Element.prototype.scrollIntoView = vi.fn()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.recipes = [OLDER, VIDEO, LORA, TAGS, IMAGE]
    mocks.isLoading = false
    mocks.lastGeneration = {
      id: 'gen-1',
      outputType: 'IMAGE',
      thumbnailUrl: 'https://cdn.test/1.png',
    }
  })

  it('首次加载还没数出来时，标题写「…」不写「0」', () => {
    mocks.recipes = []
    mocks.isLoading = true
    renderPanel()
    expect(screen.getByText('titleImage:…')).toBeInTheDocument()
  })

  it('图片台只列图片模板，新的在前；点一张即套用', () => {
    const { onApply } = renderPanel()
    expect(screen.getByText('titleImage:2')).toBeInTheDocument()
    const names = screen
      .getAllByRole('button', { name: /^apply:/ })
      .map((button) => button.getAttribute('aria-label'))
    expect(names).toEqual(['apply:雨夜人像', 'apply:清晨街景'])
    fireEvent.click(screen.getByRole('button', { name: 'apply:雨夜人像' }))
    expect(onApply).toHaveBeenCalledWith(IMAGE)
  })

  it('标签台列 LoRA 与标签台存的，LoRA 那张带角标', () => {
    renderPanel({ dialect: 'tags' })
    expect(screen.getByText('titleTags:2')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'apply:LoRA one' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'apply:Tag one' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'apply:雨夜人像' })).toBeNull()
    expect(screen.getAllByText('lora')).toHaveLength(1)
  })

  it('搜索过滤；没有结果时给一句话和「清空搜索」', async () => {
    renderPanel()
    const search = screen.getByRole('searchbox', { name: 'search' })
    fireEvent.change(search, { target: { value: '老城' } })
    // 被筛掉的卡要演完退场才摘掉。
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /^apply:/ })).toHaveLength(
        1,
      ),
    )
    fireEvent.change(search, { target: { value: '赛博朋克' } })
    expect(screen.getByText('noResult:赛博朋克')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'clearSearch' }))
    expect(screen.getAllByRole('button', { name: /^apply:/ })).toHaveLength(2)
  })

  it('这一台一条都没有时说清怎么存', () => {
    mocks.recipes = [VIDEO]
    renderPanel()
    expect(screen.getByText('emptyImage')).toBeInTheDocument()
    expect(screen.getByText('emptyHintImage')).toBeInTheDocument()
  })

  it('「存下」把当前提示词存成模板：名字取首行、封面挂最近一张', async () => {
    mocks.create.mockResolvedValue({
      success: true,
      data: recipe({ id: 'new', name: '雨夜霓虹街头的少女' }),
    })
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'save' }))
    await waitFor(() =>
      expect(
        screen.getByText('savedTitle:雨夜霓虹街头的少女'),
      ).toBeInTheDocument(),
    )
    expect(mocks.create).toHaveBeenCalledWith({
      name: '雨夜霓虹街头的少女',
      outputType: 'IMAGE',
      compiledPrompt: SAVE.prompt,
      modelId: 'gpt-image-2',
      provider: 'OpenAI',
      params: SAVE.params,
      parentGenerationId: 'gen-1',
    })
    expect(mocks.addRecipe).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'new',
        coverThumbnailUrl: 'https://cdn.test/1.png',
      }),
    )
  })

  it('新建：自己填名字和提示词，存完回到列表，焦点落在新的那张', async () => {
    mocks.create.mockResolvedValue({
      success: true,
      data: recipe({ id: 'mine', name: '我的模板' }),
    })
    mocks.addRecipe.mockImplementation((added: RecipeRecord) => {
      mocks.recipes = [added, ...mocks.recipes]
    })
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'create' }))
    expect(screen.getByRole('textbox', { name: 'nameLabel' })).toHaveFocus()
    fireEvent.change(screen.getByRole('textbox', { name: 'nameLabel' }), {
      target: { value: '我的模板' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: 'promptLabel' }), {
      target: { value: '一只橘猫' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'saveForm' }))
    await waitFor(() => expect(mocks.addRecipe).toHaveBeenCalled())
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: '我的模板', compiledPrompt: '一只橘猫' }),
    )
    expect(screen.getByText('titleImage:3')).toBeInTheDocument()
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'apply:我的模板' }),
      ).toHaveFocus(),
    )
  })

  it('⋯ → 改名：就地改，回车保存，整份字段一起送回去', async () => {
    mocks.update.mockResolvedValue({
      success: true,
      data: recipe({ id: 'image', name: '雨夜 · 红裙' }),
    })
    renderPanel()
    fireEvent.keyDown(screen.getByRole('button', { name: 'more:雨夜人像' }), {
      key: 'Enter',
    })
    fireEvent.click(await screen.findByRole('menuitem', { name: 'rename' }))
    const input = await screen.findByRole('textbox', { name: 'renameLabel' })
    fireEvent.change(input, { target: { value: '雨夜 · 红裙' } })
    // 回车被吞掉：焦点这一拍就回到卡上，不吞的话紧跟的 keypress 会顺手套用它。
    expect(fireEvent.keyDown(input, { key: 'Enter' })).toBe(false)
    fireEvent.blur(input)
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'apply:雨夜人像' }),
      ).toHaveFocus(),
    )
    expect(mocks.replaceRecipe).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'image', name: '雨夜 · 红裙' }),
    )
    expect(mocks.update).toHaveBeenCalledTimes(1)
    expect(mocks.update).toHaveBeenCalledWith('image', {
      name: '雨夜 · 红裙',
      outputType: 'IMAGE',
      compiledPrompt: 'a prompt',
      modelId: 'gpt-image-2',
      provider: 'OpenAI',
      params: {},
    })
  })

  it('⋯ → 删除：第一下变红「确认删除」、菜单不关，第二下才删', async () => {
    mocks.remove.mockResolvedValue({ success: true })
    renderPanel()
    fireEvent.keyDown(screen.getByRole('button', { name: 'more:雨夜人像' }), {
      key: 'Enter',
    })
    fireEvent.click(await screen.findByRole('menuitem', { name: 'delete' }))
    expect(mocks.remove).not.toHaveBeenCalled()
    fireEvent.click(
      await screen.findByRole('menuitem', { name: 'confirmDelete' }),
    )
    expect(mocks.removeRecipe).toHaveBeenCalledWith('image')
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith('image'))
    // 删掉的那张在退场：焦点落到标题，⛔ 不掉到 body 上。
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'titleImage:2' }),
      ).toHaveFocus(),
    )
  })

  it('Esc 收起面板；新建表单开着时 Esc 先回列表', () => {
    const { onClose } = renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'create' }))
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'nameLabel' }), {
      key: 'Escape',
    })
    expect(onClose).not.toHaveBeenCalled()
    expect(
      screen.getByRole('searchbox', { name: 'search' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'create' })).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('searchbox', { name: 'search' }), {
      key: 'Escape',
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('视频台只列视频模板；存下时 ⛔ 挂别档的上一件', async () => {
    mocks.create.mockResolvedValue({
      success: true,
      data: recipe({ id: 'v2', outputType: 'VIDEO', name: '海边日落' }),
    })
    renderPanel({ save: { ...SAVE, outputType: 'VIDEO', prompt: '海边日落' } })
    expect(screen.getByText('titleVideo:1')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'apply:Video one' }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'save' }))
    await waitFor(() => expect(mocks.addRecipe).toHaveBeenCalled())
    // 最近那一件是图片 —— 不是这一台的，⛔ 当成视频模板的出处和封面。
    expect(mocks.create).toHaveBeenCalledWith(
      expect.not.objectContaining({ parentGenerationId: expect.anything() }),
    )
    expect(mocks.addRecipe).toHaveBeenCalledWith(
      expect.objectContaining({ coverThumbnailUrl: null }),
    )
  })

  it('视频的封面只认封面帧，⛔ 把视频文件当成图画出来', () => {
    mocks.lastGeneration = {
      id: 'gen-v',
      outputType: 'VIDEO',
      thumbnailUrl: null,
      url: 'https://cdn.test/clip.mp4',
    }
    const { container } = render(
      <StudioTemplatesPanel
        dialect="natural"
        save={{ ...SAVE, outputType: 'VIDEO' }}
        onApply={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(container.querySelector('img[src$=".mp4"]')).toBeNull()
  })

  it('手机版：‹ 返回 · 标题 · ＋，搜索独占一行，⛔ 没有底下那行说明', () => {
    const { onClose } = renderPanel({ variant: 'phone' })
    expect(screen.getByText('titleImage:2')).toBeInTheDocument()
    expect(
      screen.getByRole('searchbox', { name: 'search' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('footImage')).toBeNull()
    expect(screen.queryByRole('button', { name: 'manage' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'create' }))
    expect(screen.getByRole('textbox', { name: 'nameLabel' })).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: 'back' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('提示词不在舞台下面时，空着的那张 ⛔ 说「在下面写」', () => {
    renderPanel({ save: { ...SAVE, prompt: '' }, promptBelow: false })
    expect(screen.getByText('nowEmptyPrompt')).toBeInTheDocument()
    expect(screen.queryByText('nowEmptyImage')).toBeNull()
  })

  it('⋯ 菜单里的 Esc 只收菜单，⛔ 不连面板一起收', async () => {
    const { onClose } = renderPanel()
    fireEvent.keyDown(screen.getByRole('button', { name: 'more:雨夜人像' }), {
      key: 'Enter',
    })
    fireEvent.keyDown(await screen.findByRole('menuitem', { name: 'rename' }), {
      key: 'Escape',
    })
    expect(onClose).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  })
})
