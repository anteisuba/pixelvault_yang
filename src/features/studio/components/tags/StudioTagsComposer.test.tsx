import { act, fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AI_MODELS } from '@/constants/models'
import {
  __resetTagPromptBlocksForTests,
  replaceTagPromptBlocks,
} from '@/hooks/use-tag-prompt-blocks'
import type { NovelAiCharacterLayout } from '@/types/novelai'
import { stubBrowserLayout } from '@/test/browser-stubs'
import { text } from '@/test/i18n-text'
import {
  fakeStudioServer,
  renderWithStudio,
  settle,
  type StudioHandle,
} from '@/test/studio-harness'
import { DESKTOP_WIDTH, MOBILE_WIDTH, setViewportWidth } from '@/test/viewport'

import { StudioTagsComposer } from './StudioTagsComposer'

/**
 * 标签台底部输入框，全程真的：真工作台（真 reducer 存整体标签 / 角色构图）、真
 * `useNovelAiCharacters`、真标签输入框、真页签、真「画面文字 / 台词 / 人数提示」、真工具行；
 * 只假网络（工作台挂载那几条回空）、屏宽，以及 jsdom 没有的 `scrollIntoView`。
 * 「编辑谁」看的是真工作台状态里那一份标签落到了哪。
 *
 * ⚠ 原「模型不支持角色构图时页签只剩两格」没有迁：标签台只上架 NovelAI（四个型号都能
 * 角色构图，PixAI 暂停），没选模型时工作台也会自动落一个 NovelAI —— 真页面上到不了。
 */

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: 'user-tags' }),
}))
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/studio/image/tags',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/studio/image/tags',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

const T = (key: string, values?: Record<string, string | number>) =>
  text(`StudioTags.${key}`, values)
const CAST = (key: string, values?: Record<string, string | number>) =>
  T(`cast.${key}`, values)

type Character = NovelAiCharacterLayout['characters'][number]
const person = (prompt: string, negativePrompt = ''): Character => ({
  prompt,
  negativePrompt,
  position: { x: 0.5, y: 0.5 },
})

const scrollIntoView = vi.fn()

beforeEach(() => {
  __resetTagPromptBlocksForTests()
  stubBrowserLayout()
  setViewportWidth(DESKTOP_WIDTH)
  scrollIntoView.mockClear()
  Element.prototype.scrollIntoView = scrollIntoView
  fakeStudioServer()
})
afterEach(() => vi.unstubAllGlobals())

/**
 * 真标签台：选一个 NovelAI 型号（缺省 V5，自由站位），
 * 摆好整体标签 / 角色 / 正在编辑谁，再渲染底部输入框。
 */
async function renderComposer(
  props: Partial<React.ComponentProps<typeof StudioTagsComposer>> = {},
  {
    modelId = AI_MODELS.NOVELAI_V5_FULL as string,
    tags = ['solo'],
    negative = [] as string[],
    characters = [person('red eyes')],
    active = null as number | null,
  } = {},
) {
  const view = renderWithStudio(
    <StudioTagsComposer onOpenPanel={vi.fn()} {...props} />,
  )
  await settle()
  act(() => {
    const { dispatch } = view.studio.current
    dispatch({ type: 'SET_PROMPT_DIALECT', payload: 'tags' })
    dispatch({ type: 'SET_OPTION_ID', payload: `workspace:${modelId}` })
  })
  // 先落角色（`SET_ADVANCED_PARAMS` 整份换掉），再写标签（负向会同步进 advancedParams）。
  act(() => {
    const { dispatch, state } = view.studio.current
    if (characters.length)
      dispatch({
        type: 'SET_ADVANCED_PARAMS',
        payload: {
          ...state.advancedParams,
          novelAiLayout: { positioning: 'auto', characters },
        },
      })
  })
  act(() => {
    const { dispatch } = view.studio.current
    const chips = (list: string[]) => list.map((t) => ({ text: t, weight: 1 }))
    dispatch({
      type: 'SET_TAG_CHIPS',
      payload: { polarity: 'positive', chips: chips(tags) },
    })
    dispatch({
      type: 'SET_TAG_CHIPS',
      payload: { polarity: 'negative', chips: chips(negative) },
    })
    dispatch({ type: 'SET_ACTIVE_TAG_CHARACTER', payload: active })
  })
  return view.studio as { current: StudioHandle }
}

const field = (name: string) =>
  screen.getByRole('combobox', { name }) as HTMLTextAreaElement

/** 在框尾补一格 `rain`，像真的打字（逗号收成一格）。 */
function appendRain(input: HTMLTextAreaElement) {
  const value = input.value ? `${input.value}, rain, ` : 'rain, '
  fireEvent.change(input, {
    target: { value, selectionStart: value.length, selectionEnd: value.length },
  })
}

const layoutOf = (studio: { current: StudioHandle }) =>
  studio.current.state.advancedParams.novelAiLayout?.characters ?? []
const tagsOf = (studio: { current: StudioHandle }) =>
  studio.current.state.tagChips.map((chip) => chip.text)

describe('标签台底部输入框 · 编辑谁（桌面）', () => {
  it('整体页改的是全局标签，⛔ 碰角色', async () => {
    const studio = await renderComposer()
    const input = field(T('positiveLabel'))
    expect(input).toHaveValue('solo')

    appendRain(input)
    expect(tagsOf(studio)).toEqual(['solo', 'rain'])
    expect(layoutOf(studio)[0]?.prompt).toBe('red eyes')
  })

  it('角色页改的是那一位角色，⛔ 碰全局', async () => {
    const studio = await renderComposer({}, { active: 0 })
    const input = field(T('characterPositiveLabel', { number: 1 }))
    expect(input).toHaveValue('red eyes')

    appendRain(input)
    expect(layoutOf(studio)[0]?.prompt).toBe('red eyes, rain')
    expect(tagsOf(studio)).toEqual(['solo'])
  })

  it('页签切换的就是工作台里那一份「正在编辑谁」（角色构图面板读的同一份）', async () => {
    const studio = await renderComposer()
    fireEvent.click(
      screen.getByRole('tab', {
        name: new RegExp(`^${T('workbench.characterNumber', { number: 1 })}`),
      }),
    )
    expect(studio.current.state.activeTagCharacterIndex).toBe(0)
    expect(
      field(T('characterPositiveLabel', { number: 1 })),
    ).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('tab', { name: new RegExp(`^${T('wholeTab')}`) }),
    )
    expect(studio.current.state.activeTagCharacterIndex).toBeNull()
  })

  // 画风串 2026-09-27 取消：工具行里没有那颗 chip 了。
  it('工具行没有「画风串」', async () => {
    await renderComposer()
    expect(
      screen.queryByRole('button', { name: T('workbench.blocks') }),
    ).not.toBeInTheDocument()
  })

  // 方向 1（2026-11-27）：正负紧挨上下联排同显，随页签联动，不再需要切「负向」页签。
  it('整体页直接同时显示正向与负向，改负向只更新整体负向', async () => {
    const studio = await renderComposer(
      {},
      {
        negative: ['lowres'],
        characters: [person('girl', 'bad hands'), person('boy')],
      },
    )
    expect(field(T('positiveLabel'))).toHaveValue('solo')
    const negativeInput = field(T('tabs.negative'))
    expect(negativeInput).toHaveValue('lowres')

    appendRain(negativeInput)
    expect(
      studio.current.state.tagNegativeChips.map((chip) => chip.text),
    ).toEqual(['lowres', 'rain'])
    expect(layoutOf(studio)[0]?.negativePrompt).toBe('bad hands')
  })

  it('切到角色 1 时正负同时联动到角色 1，改负向只改她的负向', async () => {
    const studio = await renderComposer(
      {},
      {
        active: 0,
        negative: ['lowres'],
        characters: [person('girl', 'bad hands')],
      },
    )
    expect(field(T('characterPositiveLabel', { number: 1 }))).toHaveValue(
      'girl',
    )
    const negativeInput = field(
      `${T('tabs.negative')} · ${T('workbench.characterNumber', { number: 1 })}`,
    )
    expect(negativeInput).toHaveValue('bad hands')
    appendRain(negativeInput)
    expect(layoutOf(studio)[0]?.negativePrompt).toBe('bad hands, rain')
    expect(
      studio.current.state.tagNegativeChips.map((chip) => chip.text),
    ).toEqual(['lowres'])
  })

  it('V5 Full Medium 锁定 Heavy UC 时不渲染自定义负向框，而是提示改用正向负权重', async () => {
    await renderComposer({}, { modelId: AI_MODELS.NOVELAI_V5_FULL_MEDIUM })
    expect(
      screen.queryByRole('combobox', { name: T('tabs.negative') }),
    ).toBeNull()
    expect(
      screen.getByTestId('novelai-medium-negative-notice'),
    ).toBeInTheDocument()
  })

  it('精确参考卡：按 V5 契约展示类型、强度与同衣开关，报实时 +5N Anlas，并能一键清除 V5 重绘冲突', async () => {
    const studio = await renderComposer(
      {},
      { modelId: AI_MODELS.NOVELAI_V5_FULL },
    )
    act(() => {
      const { dispatch, state } = studio.current
      dispatch({
        type: 'SET_ADVANCED_PARAMS',
        payload: {
          ...state.advancedParams,
          inpaintMask: 'data:image/png;base64,AAA',
          novelAi: {
            preciseReferences: [
              {
                id: 'ref-1',
                url: 'https://cdn.example.com/a.png',
                kind: 'character&style',
                strength: 1.5,
                fidelity: 1,
                preferSameOutfit: true,
                source: { type: 'user' },
              },
              {
                id: 'ref-2',
                url: 'https://cdn.example.com/b.png',
                kind: 'outfit',
                strength: 1,
                fidelity: 1,
                preferSameOutfit: false,
                source: { type: 'user' },
              },
            ],
          },
        },
      })
    })
    expect(screen.getAllByTestId('novelai-precise-ref-card')).toHaveLength(2)
    // ≥2 张精确参考时展示高斯手风琴预览条，点任意切片同步展开对应微调卡。
    const accordion = screen.getByRole('group', {
      name: T('references.preciseTitle'),
    })
    expect(
      accordion.querySelectorAll('[data-slot="image-accordion-slice"]'),
    ).toHaveLength(2)
    // V5 遮罩重绘与精确参考冲突提示出现，点一键清除后遮罩消失且恢复 +10 Anlas 计费显示。
    expect(
      screen.getByText(T('references.v5InpaintConflict')),
    ).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', {
        name: T('references.clearInpaintToUsePrecise'),
      }),
    )
    expect(studio.current.state.advancedParams.inpaintMask).toBeUndefined()
    expect(screen.getByText('+10 Anlas')).toBeInTheDocument()

    // 点手风琴第一片展开第一张卡，可切换类型、看到强度滑杆与同套服装开关（V5 含「服装」且无 V4.5 保真度滑杆）。
    fireEvent.click(
      accordion.querySelectorAll('[data-slot="image-accordion-slice"]')[0]!,
    )
    expect(
      screen.getByRole('button', { name: T('references.kinds.outfit') }),
    ).toBeInTheDocument()
    expect(screen.getByText(T('references.strengthLabel'))).toBeInTheDocument()
    expect(
      screen.getByText(T('references.preferSameOutfit')),
    ).toBeInTheDocument()
    expect(screen.queryByText(T('references.fidelityLabel'))).toBeNull()
  })

  it('V4.5 Full 精确参考卡展示保真度滑杆且不展示 V5 专属服装类型', async () => {
    const studio = await renderComposer(
      {},
      { modelId: AI_MODELS.NOVELAI_V45_FULL },
    )
    act(() => {
      const { dispatch, state } = studio.current
      dispatch({
        type: 'SET_ADVANCED_PARAMS',
        payload: {
          ...state.advancedParams,
          novelAi: {
            preciseReferences: [
              {
                id: 'ref-v45',
                url: 'https://cdn.example.com/v45.png',
                kind: 'character',
                strength: 0.8,
                fidelity: 0.65,
                preferSameOutfit: false,
                source: { type: 'user' },
              },
            ],
          },
        },
      })
    })
    fireEvent.click(
      screen.getByTestId('novelai-precise-ref-card').querySelector('button')!,
    )
    expect(screen.getByText(T('references.fidelityLabel'))).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: T('references.kinds.outfit') }),
    ).toBeNull()
    expect(screen.queryByText(T('references.preferSameOutfit'))).toBeNull()
  })

  it('加人：页签那颗 ＋ 打开菜单，挑「空白」加一位并切过去', async () => {
    const studio = await renderComposer()
    fireEvent.click(screen.getByRole('button', { name: T('addMenu.trigger') }))
    fireEvent.click(
      await screen.findByRole('button', {
        name: new RegExp(T('addMenu.blank.girl')),
      }),
    )
    expect(layoutOf(studio).map((c) => c.prompt)).toEqual(['red eyes', 'girl'])
    expect(studio.current.state.activeTagCharacterIndex).toBe(1)
  })

  it('当前角色页签带 ⋯，其他页签没有', async () => {
    await renderComposer(
      {},
      { active: 0, characters: [person('girl'), person('boy')] },
    )
    expect(
      screen.getAllByRole('button', {
        name: new RegExp(`^${T('tabs.more', { who: '.+' })}$`),
      }),
    ).toHaveLength(1)
  })

  it('角色页：「＋ 台词」打开一行，写的字进这个人的台词', async () => {
    const studio = await renderComposer(
      {},
      { active: 0, characters: [person('girl'), person('boy')] },
    )
    expect(
      screen.getByRole('button', { name: CAST('addInteraction') }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: CAST('addDialogue') }))
    fireEvent.change(
      screen.getByRole('textbox', {
        name: CAST('dialogueAria', { number: 1 }),
      }),
      { target: { value: 'Hi' } },
    )
    expect(layoutOf(studio)[0]?.dialogue).toBe('Hi')
  })

  it('一个人时没有「＋ 互动」（没有对象）', async () => {
    await renderComposer({}, { active: 0, characters: [person('girl')] })
    expect(
      screen.queryByRole('button', { name: CAST('addInteraction') }),
    ).toBeNull()
    expect(
      screen.getByRole('button', { name: CAST('addDialogue') }),
    ).toBeInTheDocument()
  })

  it('整体页：「＋ 画面文字」加一行，人数对不上时一键改', async () => {
    const studio = await renderComposer(
      {},
      { characters: [person('girl, red hair'), person('girl')] },
    )
    fireEvent.click(screen.getByRole('button', { name: CAST('sceneText') }))
    expect(studio.current.state.advancedParams.novelAiSceneTexts).toEqual([
      { kind: 'sign', text: '' },
    ])

    expect(
      screen.getByText(CAST('countHint', { count: 2, tags: 'solo' }), {
        exact: false,
      }),
    ).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', {
        name: CAST('countFix', { tags: '2girls' }),
      }),
    )
    expect(tagsOf(studio)).toEqual(['2girls'])
  })
})

describe('标签台底部输入框（手机）', () => {
  beforeEach(() => setViewportWidth(MOBILE_WIDTH))

  it('默认只展开正向；展开负向可编辑，收起后再打开标签还在', async () => {
    const studio = await renderComposer(
      { mobile: true },
      { negative: ['blurry'] },
    )
    expect(field(T('positiveLabel'))).toBeInTheDocument()
    const toggle = screen.getByRole('button', {
      name: new RegExp(`${T('negativeLabel')}\\s*1`),
    })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(
      screen.queryByRole('combobox', { name: T('negativeLabel') }),
    ).not.toBeInTheDocument()

    fireEvent.click(toggle)
    // 手机上展开的负向栏要滚进来。
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' })
    const input = field(T('negativeLabel'))
    expect(input).toHaveValue('blurry')
    appendRain(input)
    expect(
      studio.current.state.tagNegativeChips.map((chip) => chip.text),
    ).toEqual(['blurry', 'rain'])

    fireEvent.click(toggle)
    fireEvent.click(toggle)
    expect(field(T('negativeLabel'))).toHaveValue('blurry, rain')
  })

  it('角色页展开负向只更新当前角色', async () => {
    const studio = await renderComposer({ mobile: true }, { active: 0 })
    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(T('negativeLabel')) }),
    )
    appendRain(field(T('negativeLabel')))
    expect(layoutOf(studio)[0]?.negativePrompt).toBe('rain')
    expect(studio.current.state.tagNegativeChips).toEqual([])
  })

  // owner 2026-10-15「看图片作为重点」：手机收起态只有一行摘要 + 工具行。
  it('收起态只留一行摘要，点它交给宿主展开', async () => {
    const onExpand = vi.fn()
    await renderComposer({ mobile: true, compact: true, onExpand })
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: new RegExp(T('negativeLabel')) }),
    ).not.toBeInTheDocument()
    const summary = screen.getByRole('button', { name: T('compactExpand') })
    expect(summary).toHaveTextContent('solo')
    fireEvent.click(summary)
    expect(onExpand).toHaveBeenCalledTimes(1)
    expect(
      screen.getByRole('button', { name: text('StudioMobile.add') }),
    ).toBeInTheDocument()
  })

  // 2026-10-07 起画中文字改成角色页的台词与整体页的画面文字，「＋」里不再有那一页。
  it('「＋」里是模板 · 查资料 · 识图 · 构图，没有画中文字那一页', async () => {
    const onOpenPanel = vi.fn()
    await renderComposer({ mobile: true, onOpenPanel })
    fireEvent.click(
      screen.getByRole('button', { name: text('StudioMobile.add') }),
    )
    fireEvent.click(
      await screen.findByRole('button', { name: T('workbench.lookup') }),
    )
    expect(onOpenPanel).toHaveBeenCalledWith('catalog')
    expect(screen.queryByTestId('studio-mobile-add-text')).toBeNull()
  })

  it('桌面整体页将前置画师积木挂在正向输入框上方、后置积木挂在下方，切角色页回落到独立栏', async () => {
    replaceTagPromptBlocks([
      {
        id: 'artist-1',
        name: '画师·微光夜露',
        target: 'positive',
        position: 'prefix',
        mode: 'fixed',
        enabled: true,
        locked: false,
        weight: 1,
        items: ['0.8::artist:keisea::', '0.55::artist:guweiz::'],
        cursor: 0,
      },
      {
        id: 'expr-1',
        name: '表情',
        target: 'positive',
        position: 'suffix',
        mode: 'random',
        enabled: true,
        locked: false,
        weight: 1,
        items: ['smile'],
        cursor: 0,
      },
    ])

    const onOpenPanel = vi.fn()
    const studio = await renderComposer({ onOpenPanel })
    const prefixBar = screen.getByTestId('active-tag-blocks-positive-prefix')
    const suffixBar = screen.getByTestId('active-tag-blocks-positive-suffix')
    const positiveInput = field(T('positiveLabel'))

    expect(prefixBar).toHaveTextContent(
      '0.8::artist:keisea::, 0.55::artist:guweiz::',
    )
    expect(
      prefixBar.compareDocumentPosition(positiveInput) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      positiveInput.compareDocumentPosition(suffixBar) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()

    // 点前置画师块正文直接唤起右侧「提示词积木」编排面板
    const prefixMainBtn = prefixBar.querySelector(
      '[data-testid="active-tag-block-item"] button',
    )
    expect(prefixMainBtn).not.toBeNull()
    fireEvent.click(prefixMainBtn!)
    expect(onOpenPanel).toHaveBeenCalledWith('blocks')

    // 切到角色 1 时整体积木不再混入角色卡片，而是收成底部的独立胶囊带
    act(() => {
      studio.current.dispatch({ type: 'SET_ACTIVE_TAG_CHARACTER', payload: 0 })
    })
    expect(
      screen.queryByTestId('active-tag-blocks-positive-prefix'),
    ).not.toBeInTheDocument()
    expect(screen.getByTestId('active-tag-blocks-bar')).toHaveTextContent(
      '画师·微光夜露',
    )
  })
})
