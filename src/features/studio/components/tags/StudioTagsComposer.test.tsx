import { act, fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AI_MODELS } from '@/constants/models'
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

  // 标签台 A：负向是最右边那一格；进去后「写给」切整体 / 每位角色各自的负向。
  it('负向页签：同一个框换成负向，写给谁由下面那一行切', async () => {
    const studio = await renderComposer(
      {},
      {
        negative: ['lowres'],
        characters: [person('girl', 'bad hands'), person('boy')],
      },
    )
    // 在整体页：负向页签只数整体那一份。
    const negativeTab = screen.getByRole('tab', {
      name: new RegExp(`^${T('tabs.negative')}`),
    })
    expect(negativeTab).toHaveTextContent('1')
    fireEvent.click(negativeTab)

    const input = field(T('tabs.negative'))
    expect(input).toHaveValue('lowres')
    appendRain(input)
    expect(
      studio.current.state.tagNegativeChips.map((chip) => chip.text),
    ).toEqual(['lowres', 'rain'])
    expect(screen.getByText(T('tabs.writeFor'))).toBeInTheDocument()
  })

  // owner 2026-10-25：选着角色 N，右上那格就是「角色 N 负向」，点了直接进她的负面。
  it('选着角色 1 时负向页签写「角色 1 负向」，点了改的是那一位的负向', async () => {
    const studio = await renderComposer(
      {},
      {
        active: 0,
        negative: ['lowres'],
        characters: [person('girl', 'bad hands')],
      },
    )
    const negativeTab = screen.getByRole('tab', {
      name: new RegExp(`^${T('tabs.characterNegative', { number: 1 })}`),
    })
    expect(negativeTab).toHaveTextContent('1')
    fireEvent.click(negativeTab)

    const input = field(
      `${T('tabs.negative')} · ${T('workbench.characterNumber', { number: 1 })}`,
    )
    expect(input).toHaveValue('bad hands')
    appendRain(input)
    expect(layoutOf(studio)[0]?.negativePrompt).toBe('bad hands, rain')
    expect(
      studio.current.state.tagNegativeChips.map((chip) => chip.text),
    ).toEqual(['lowres'])
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
})
