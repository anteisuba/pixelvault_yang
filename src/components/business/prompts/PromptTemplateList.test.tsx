import type { ReactNode } from 'react'
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { ROUTES } from '@/constants/routes'
import { STUDIO_PREFILL_PROMPT_STORAGE_KEY } from '@/constants/studio'

import {
  PromptTemplateList,
  type PromptTemplateListItem,
} from './PromptTemplateList'

/**
 * 提示词页 A 的回归闸（pages/prompts.md）：
 *  ① 类型只有 全部 / 图片 / 视频 / LoRA（⛔ 音频），音频模板只在「全部」里；
 *  ② LoRA 卡带「名字 权重」，补不到名字写 LoRA；
 *  ③ 搜索与数量、「最近用过」排序；
 *  ④ 两种空态各给出路；
 *  ⑤ 「使用」：LoRA 回 LoRA 台 `?template=`，别的预填提示词回对应的台，都记一次使用；
 *  ⑥ 详情是一页：LoRA 那一栏（搭配 · 参数 · 提示词 · 负面）、返回焦点回卡、⋯ 删除、编辑存新一版。
 */

vi.mock('next-intl', () => {
  const t = Object.assign(
    (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${JSON.stringify(values)}` : key,
    {
      rich: (key: string, values?: Record<string, unknown>) =>
        `${key}:${String(values?.count)}`,
    },
  )
  return { useTranslations: () => t }
})

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const mockPush = vi.fn()
const mockRefresh = vi.fn()
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
  Link: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

const mockDeleteRecipe = vi.fn()
const mockGetRecipe = vi.fn()
const mockListGenerations = vi.fn()
const mockUpdateRecipe = vi.fn()
const mockMarkUsed = vi.fn()
vi.mock('@/lib/api-client/recipes', () => ({
  deleteRecipeAPI: (...args: unknown[]) => mockDeleteRecipe(...args),
  getRecipeAPI: (...args: unknown[]) => mockGetRecipe(...args),
  listRecipeGenerationsAPI: (...args: unknown[]) =>
    mockListGenerations(...args),
  updateRecipeAPI: (...args: unknown[]) => mockUpdateRecipe(...args),
  markRecipeUsedAPI: (...args: unknown[]) => mockMarkUsed(...args),
  setRecipeVisibilityAPI: vi.fn(),
}))

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const originalScrollIntoView = Element.prototype.scrollIntoView

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
  Element.prototype.scrollIntoView = vi.fn()
})

afterAll(() => {
  Element.prototype.scrollIntoView = originalScrollIntoView
  vi.unstubAllGlobals()
})

beforeEach(() => {
  vi.clearAllMocks()
  window.sessionStorage.clear()
  mockMarkUsed.mockResolvedValue({ success: true })
  mockListGenerations.mockResolvedValue({ success: true, data: [] })
})

function makeItem(
  overrides: Partial<PromptTemplateListItem> = {},
): PromptTemplateListItem {
  return {
    id: 'recipe-1',
    outputType: 'IMAGE',
    name: 'Sunset portrait',
    compiledPrompt: 'a cinematic sunset portrait',
    modelId: 'flux-2-pro',
    version: 1,
    createdAt: '2026-06-14T00:00:00.000Z',
    templateKind: 'IMAGE',
    lora: null,
    lastUsedAt: null,
    ...overrides,
  }
}

const LORA_ITEM = makeItem({
  id: 'lora-1',
  name: '祀 · 终末地站姿',
  compiledPrompt: 'sue (arknights), 1girl, standing',
  modelId: 'illustrious-recipe-clone',
  templateKind: 'LORA',
  lora: {
    baseId: 'illustrious-runner',
    items: [
      { name: '祀 (Sue)', scale: 0.9 },
      { name: null, scale: 0.6 },
    ],
  },
})

const cardTitles = () =>
  screen.getAllByRole('heading', { level: 3 }).map((node) => node.textContent)

function openMenu(label: string) {
  fireEvent.click(
    screen.getByRole('button', { name: new RegExp(`^${label}：`) }),
  )
}

describe('PromptTemplateList（提示词页 A）', () => {
  it('类型只有 全部 / 图片 / 视频 / LoRA，音频模板只在「全部」里', () => {
    render(
      <PromptTemplateList
        locale="en"
        recipes={[
          makeItem({ id: 'img', name: 'Image one' }),
          makeItem({
            id: 'aud',
            name: 'Audio one',
            outputType: 'AUDIO',
            templateKind: 'AUDIO',
          }),
        ]}
      />,
    )

    openMenu('typeFilterShort')
    const options = screen
      .getAllByRole('option')
      .map((option) => option.textContent)
    expect(options).toEqual([
      'typeFilterAll',
      'outputTypeImage',
      'outputTypeVideo',
      'typeLora',
    ])
    expect(cardTitles()).toContain('Audio one')

    fireEvent.click(screen.getByRole('option', { name: 'outputTypeImage' }))
    expect(cardTitles()).toEqual(['Image one'])
  })

  it('LoRA 卡带「名字 权重」，补不到名字写 LoRA', () => {
    render(<PromptTemplateList locale="en" recipes={[LORA_ITEM]} />)

    const card = screen
      .getByRole('heading', { name: '祀 · 终末地站姿' })
      .closest('article')!
    expect(within(card).getByText('typeLora')).toBeInTheDocument()
    expect(card.textContent).toContain('祀 (Sue)0.90')
    expect(card.textContent).toContain('loraUnnamed0.60')
  })

  it('搜索标题或正文，数量跟着换', () => {
    render(
      <PromptTemplateList
        locale="en"
        recipes={[
          makeItem({ id: 'a', name: 'Sunset', compiledPrompt: 'warm light' }),
          makeItem({ id: 'b', name: 'Night', compiledPrompt: 'neon city' }),
        ]}
      />,
    )
    expect(screen.getByText('countLine:2')).toBeInTheDocument()

    fireEvent.change(screen.getByRole('textbox', { name: 'searchTemplates' }), {
      target: { value: 'neon' },
    })
    expect(cardTitles()).toEqual(['Night'])
    expect(screen.getByText('countLine:1')).toBeInTheDocument()
  })

  it('默认「最近用过」：用过的在前，没用过的按新建时间；可以换成「最近新建」', () => {
    render(
      <PromptTemplateList
        locale="en"
        recipes={[
          makeItem({
            id: 'new',
            name: 'Newest never used',
            createdAt: '2026-09-20T00:00:00.000Z',
          }),
          makeItem({
            id: 'used',
            name: 'Old but used',
            createdAt: '2026-01-01T00:00:00.000Z',
            lastUsedAt: '2026-09-27T00:00:00.000Z',
          }),
          makeItem({
            id: 'mid',
            name: 'Middle never used',
            createdAt: '2026-05-01T00:00:00.000Z',
          }),
        ]}
      />,
    )
    expect(cardTitles()).toEqual([
      'Old but used',
      'Newest never used',
      'Middle never used',
    ])

    openMenu('sortLabel')
    fireEvent.click(screen.getByRole('option', { name: 'sortCreated' }))
    expect(cardTitles()).toEqual([
      'Newest never used',
      'Middle never used',
      'Old but used',
    ])
  })

  it('一个 LoRA 模板都没有：说明从 LoRA 台「存成模板」来，给去 LoRA 台的路', () => {
    render(<PromptTemplateList locale="en" recipes={[makeItem()]} />)

    openMenu('typeFilterShort')
    fireEvent.click(screen.getByRole('option', { name: 'typeLora' }))

    expect(screen.getByText('loraEmptyTitle')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'openLoraStudio' }),
    ).toHaveAttribute('href', ROUTES.STUDIO_LORA)
  })

  it('搜不到：写明哪个条件没有，去掉类型 / 清空搜索都能回来', () => {
    render(
      <PromptTemplateList
        locale="en"
        recipes={[makeItem({ id: 'img', name: 'Image one' }), LORA_ITEM]}
      />,
    )
    openMenu('typeFilterShort')
    fireEvent.click(screen.getByRole('option', { name: 'typeLora' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'searchTemplates' }), {
      target: { value: 'cyberpunk' },
    })

    expect(screen.getByRole('heading', { level: 4 }).textContent).toBe(
      'emptyQueryType:{"query":"cyberpunk","type":"typeLora"}',
    )
    fireEvent.click(
      screen.getByRole('button', {
        name: 'removeTypeFilter:{"type":"typeLora"}',
      }),
    )
    expect(screen.getByRole('heading', { level: 4 }).textContent).toBe(
      'emptyQuery:{"query":"cyberpunk"}',
    )
    // 搜索框里那颗 ✕ 与空态里这一颗同名（都是清空搜索），点空态里的。
    const empty = screen.getByRole('heading', { level: 4 }).parentElement!
    fireEvent.click(within(empty).getByRole('button', { name: 'clearSearch' }))
    expect(cardTitles()).toHaveLength(2)
  })

  it('LoRA 模板「使用」回 LoRA 台带 ?template=，并记一次使用', () => {
    render(<PromptTemplateList locale="en" recipes={[LORA_ITEM]} />)

    fireEvent.click(screen.getByRole('button', { name: 'useAction' }))

    expect(mockPush).toHaveBeenCalledWith(
      `${ROUTES.STUDIO_LORA}?template=lora-1`,
    )
    expect(mockMarkUsed).toHaveBeenCalledWith('lora-1')
    expect(
      window.sessionStorage.getItem(STUDIO_PREFILL_PROMPT_STORAGE_KEY),
    ).toBeNull()
  })

  it('图片模板「使用」预填提示词回图片台，并记一次使用', () => {
    render(<PromptTemplateList locale="en" recipes={[makeItem()]} />)

    fireEvent.click(screen.getByRole('button', { name: 'useAction' }))

    expect(
      window.sessionStorage.getItem(STUDIO_PREFILL_PROMPT_STORAGE_KEY),
    ).toBe('a cinematic sunset portrait')
    expect(mockPush).toHaveBeenCalledWith(ROUTES.STUDIO_IMAGE)
    expect(mockMarkUsed).toHaveBeenCalledWith('recipe-1')
  })
})

describe('PromptTemplateDetailPage（详情是一页）', () => {
  const LORA_DETAIL = {
    id: 'lora-1',
    name: '祀 · 终末地站姿',
    outputType: 'IMAGE',
    compiledPrompt: 'sue (arknights), 1girl, standing',
    negativePrompt: 'worst quality, low quality',
    modelId: 'illustrious-recipe-clone',
    provider: 'runner',
    parentGenerationId: 'gen-1',
    version: 2,
    visibility: 'PRIVATE',
    params: {
      aspectRatio: '3:4',
      advancedParams: {
        steps: 28,
        guidanceScale: 5,
        runnerSampler: 'euler_ancestral',
        runnerWidth: 832,
        runnerHeight: 1216,
        loras: [
          { url: 'https://civitai.com/api/download/models/111', scale: 0.9 },
          { url: 'https://civitai.com/api/download/models/222', scale: 0.6 },
        ],
      },
    },
  }

  function openLoraDetail() {
    mockGetRecipe.mockResolvedValue({ success: true, data: LORA_DETAIL })
    render(<PromptTemplateList locale="en" recipes={[LORA_ITEM]} />)
    const opener = screen.getByRole('button', {
      name: 'viewDetail: 祀 · 终末地站姿',
    })
    fireEvent.click(opener)
    return opener
  }

  it('LoRA 那一栏：搭配（名字 权重）· 参数（种子回随机）· 提示词 · 负面', async () => {
    openLoraDetail()

    const page = await screen.findByTestId('prompt-template-detail')
    await waitFor(() =>
      expect(page.textContent).toContain(
        'euler_ancestral · paramSteps:{"steps":28} · CFG 5 · 832×1216 · paramSeedRandom',
      ),
    )
    // 旧存的只有链接：名字用列表补好的那一格，补不到写 Civitai 版本号。
    expect(page.textContent).toContain('祀 (Sue)0.90')
    expect(page.textContent).toContain('Civitai 2220.60')
    expect(page.textContent).toContain('worst quality, low quality')
    expect(page.textContent).toContain('loraUseNote')
  })

  it('返回：关上详情，焦点回到点开它的那张卡', async () => {
    const opener = openLoraDetail()
    await screen.findByTestId('prompt-template-detail')

    fireEvent.click(screen.getByRole('button', { name: 'back' }))

    await waitFor(() =>
      expect(screen.queryByTestId('prompt-template-detail')).toBeNull(),
    )
    await waitFor(() => expect(opener).toHaveFocus())
  })

  it('⋯ → 删除：确认之后才删，卡片跟着消失', async () => {
    mockDeleteRecipe.mockResolvedValue({ success: true })
    openLoraDetail()
    await screen.findByTestId('prompt-template-detail')

    fireEvent.pointerDown(screen.getByRole('button', { name: 'moreActions' }), {
      button: 0,
      ctrlKey: false,
    })
    fireEvent.click(
      await screen.findByRole('menuitem', { name: 'deleteAction' }),
    )
    expect(mockDeleteRecipe).not.toHaveBeenCalled()

    fireEvent.click(
      await screen.findByRole('button', { name: 'deleteConfirmAction' }),
    )
    await waitFor(() => expect(mockDeleteRecipe).toHaveBeenCalledWith('lora-1'))
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: '祀 · 终末地站姿' }),
      ).toBeNull(),
    )
  })

  it('编辑：存成新一版，卡片名字跟着换', async () => {
    mockUpdateRecipe.mockResolvedValue({
      success: true,
      data: { ...LORA_DETAIL, name: '祀 · 夜景', version: 3 },
    })
    openLoraDetail()
    await screen.findByTestId('prompt-template-detail')
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /editShort/ })).toBeEnabled(),
    )

    fireEvent.click(screen.getByRole('button', { name: /editShort/ }))
    fireEvent.change(screen.getByRole('textbox', { name: 'createNameLabel' }), {
      target: { value: '祀 · 夜景' },
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'editSubmit' }))
    })

    expect(mockUpdateRecipe).toHaveBeenCalledWith(
      'lora-1',
      expect.objectContaining({
        name: '祀 · 夜景',
        compiledPrompt: 'sue (arknights), 1girl, standing',
        modelId: 'illustrious-recipe-clone',
        provider: 'runner',
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'back' }))
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { level: 3, name: '祀 · 夜景' }),
      ).toBeInTheDocument(),
    )
  })
})
