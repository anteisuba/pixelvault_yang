import { act, fireEvent, screen } from '@testing-library/react'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { AI_MODELS } from '@/constants/models'
import { findNovelAiInteractionPreset } from '@/constants/novelai'
import type { NovelAiCharacterLayout } from '@/types/novelai'
import { text } from '@/test/i18n-text'
import {
  fakeStudioServer,
  renderWithStudio,
  type StudioHandle,
} from '@/test/studio-harness'

import { StudioTagCastStage } from './StudioTagCastLayer'

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: 'user-a' }),
}))
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/studio/image/tags',
  useRouter: () => ({ push: vi.fn() }),
}))

const T = (key: string, values?: Record<string, string | number>) =>
  text(`StudioTags.cast.${key}`, values)

const person = (
  prompt: string,
  extra: Partial<NovelAiCharacterLayout['characters'][number]> = {},
) => ({
  prompt,
  negativePrompt: '',
  position: { x: 0.5, y: 0.5 },
  ...extra,
})

const originalRect = HTMLElement.prototype.getBoundingClientRect
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  HTMLElement.prototype.setPointerCapture = vi.fn()
  // 舞台 400 × 400：空画框 = 左右各留 16、顶上 48、底下 16 → 336 见方，左上角 (32, 48)。
  HTMLElement.prototype.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      right: 400,
      bottom: 400,
      width: 400,
      height: 400,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect
})
afterAll(() => {
  HTMLElement.prototype.getBoundingClientRect = originalRect
})

beforeEach(() => {
  fakeStudioServer()
})
afterEach(() => vi.unstubAllGlobals())

const TWO: NovelAiCharacterLayout = {
  positioning: 'auto',
  characters: [person('1girl'), person('1boy')],
}

/**
 * 真标签台：选 NovelAI（V5 自由站位 / V4.5 网格），把人物布局与画面文字写进真表单，
 * 当前选中第 1 位。量尺寸走 rAF —— 等它跑完一帧。
 */
async function renderStage({
  layout = TWO as NovelAiCharacterLayout | undefined,
  modelId = AI_MODELS.NOVELAI_V5_FULL as string,
  sceneTexts = undefined as
    | { kind: 'title' | 'other' | 'sign' | 'cover'; text: string }[]
    | undefined,
} = {}) {
  const view = renderWithStudio(
    <StudioTagCastStage active>
      <div data-testid="results" />
    </StudioTagCastStage>,
  )
  act(() => {
    const { dispatch } = view.studio.current
    dispatch({ type: 'SET_PROMPT_DIALECT', payload: 'tags' })
    dispatch({ type: 'SET_OPTION_ID', payload: `workspace:${modelId}` })
    dispatch({
      type: 'SET_ADVANCED_PARAMS',
      payload: { novelAiLayout: layout, novelAiSceneTexts: sceneTexts },
    })
    dispatch({ type: 'SET_ACTIVE_TAG_CHARACTER', payload: 0 })
  })
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
  })
  return view.studio
}

const layoutOf = (studio: { current: StudioHandle }) =>
  studio.current.state.advancedParams.novelAiLayout as
    | NovelAiCharacterLayout
    | undefined

describe('舞台人物层', () => {
  it('没有角色时只有结果区', async () => {
    await renderStage({ layout: undefined })
    expect(screen.getByTestId('results')).toBeInTheDocument()
    expect(screen.queryByText(T('layer', { count: 0 }))).not.toBeInTheDocument()
  })

  it('左上胶囊报人数与站位；每人一颗点，点一下切到他', async () => {
    const studio = await renderStage()
    expect(screen.getByText(T('layer', { count: 2 }))).toBeInTheDocument()
    expect(screen.getByText(T('autoStatus'))).toBeInTheDocument()
    const dot = screen.getByRole('button', { name: T('who', { number: 2 }) })
    fireEvent.pointerDown(dot, { button: 0, clientX: 300, clientY: 200 })
    fireEvent.pointerUp(dot, { button: 0, clientX: 300, clientY: 200 })
    expect(studio.current.state.activeTagCharacterIndex).toBe(1)
    expect(layoutOf(studio)).toEqual(TWO)
  })

  it('拖一下：全员变手动，其余人钉在等距位置，松手只写回一次', async () => {
    const studio = await renderStage()
    const dot = screen.getByRole('button', { name: T('who', { number: 1 }) })
    fireEvent.pointerDown(dot, { button: 0, clientX: 144, clientY: 216 })
    fireEvent.pointerMove(dot, { clientX: 300, clientY: 100 })
    // 拖动途中还没写回表单。
    expect(layoutOf(studio)).toEqual(TWO)
    fireEvent.pointerUp(dot, { clientX: 300, clientY: 100 })
    const next = layoutOf(studio)!
    expect(next.positioning).toBe('manual')
    expect(next.characters[0].position.x).toBeCloseTo((300 - 32) / 336)
    expect(next.characters[0].position.y).toBeCloseTo((100 - 48) / 336)
    expect(next.characters[1].position).toEqual({ x: 2 / 3, y: 0.5 })
    expect(studio.current.state.activeTagCharacterIndex).toBe(0)
  })

  it('V4.5 网格档：松手吸到格心', async () => {
    const studio = await renderStage({ modelId: AI_MODELS.NOVELAI_V45_FULL })
    const dot = screen.getByRole('button', { name: T('who', { number: 1 }) })
    fireEvent.pointerDown(dot, { button: 0, clientX: 144, clientY: 216 })
    fireEvent.pointerMove(dot, { clientX: 300, clientY: 100 })
    fireEvent.pointerUp(dot, { clientX: 300, clientY: 100 })
    const next = layoutOf(studio)!
    expect(next.characters[0].position).toEqual({ x: 0.7, y: 0.1 })
    expect(next.characters[1].position).toEqual({ x: 0.7, y: 0.5 })
  })

  it('手动摆位时点状态胶囊回到交给模型', async () => {
    const studio = await renderStage({
      layout: { ...TWO, positioning: 'manual' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(T('manualStatus')) }),
    )
    expect(layoutOf(studio)?.positioning).toBe('auto')
  })

  it('互动画成动作名，台词画成气泡，画面文字挂在画框左上角', async () => {
    await renderStage({
      layout: {
        positioning: 'auto',
        characters: [
          person('1girl', { interactions: [{ tag: 'headpat', target: 1 }] }),
          person('1boy', { dialogue: 'Good morning!' }),
        ],
      },
      sceneTexts: [{ kind: 'sign', text: 'CAFE' }],
    })
    const preset = findNovelAiInteractionPreset('headpat')!
    expect(screen.getByText(T(`actions.${preset.key}`))).toBeInTheDocument()
    expect(screen.getByText('Good morning!')).toBeInTheDocument()
    expect(screen.getByText(T('sceneKinds.sign'))).toBeInTheDocument()
    expect(screen.getByText('CAFE')).toBeInTheDocument()
  })

  it('点「人物层」= 关；关了点不到人', async () => {
    await renderStage()
    const pill = screen.getByRole('button', {
      name: new RegExp(T('layer', { count: 2 })),
    })
    fireEvent.click(pill)
    expect(pill).toHaveAttribute('aria-pressed', 'false')
    expect(
      screen
        .getByRole('button', { name: T('who', { number: 1 }) })
        .closest('[inert]'),
    ).not.toBeNull()
  })
})
