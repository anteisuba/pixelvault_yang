import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { act, fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ROUTES } from '@/constants/routes'
import { text } from '@/test/i18n-text'
import {
  fakeStudioServer,
  renderWithStudio,
  type StudioHandle,
} from '@/test/studio-harness'

import { StudioDialectJumpHint } from './StudioDialectJumpHint'
import { StudioDialectHeader } from './StudioDialectHeader'

const push = vi.hoisted(() => vi.fn())

vi.mock('motion/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('motion/react')>()),
  useReducedMotion: () => true,
}))
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/studio/image',
}))
vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: 'user-a' }),
}))

const T = (key: string) => text(`StudioTags.${key}`)
const EDIT = () => text('StudioImageEdit.editMode')

/** 工作台表单里和「换台」有关的那几格：没动过 = 换台没往表单里写东西。 */
function formSnapshot(studio: StudioHandle) {
  const { promptDialect, prompt, pendingPromptTransfer } = studio.state
  return { promptDialect, prompt, pendingPromptTransfer }
}

function inTagsStudio(studio: { current: StudioHandle }) {
  act(() =>
    studio.current.dispatch({ type: 'SET_PROMPT_DIALECT', payload: 'tags' }),
  )
}

describe('两台之间那扇门', () => {
  beforeEach(() => {
    push.mockClear()
    fakeStudioServer()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('编辑入口只进入编辑会话，不改 prompt dialect 或路由', () => {
    const onEdit = vi.fn()
    const { studio } = renderWithStudio(<StudioDialectHeader onEdit={onEdit} />)
    const before = formSnapshot(studio.current)
    fireEvent.click(screen.getByRole('tab', { name: EDIT() }))
    expect(onEdit).toHaveBeenCalledOnce()
    expect(push).not.toHaveBeenCalled()
    expect(formSnapshot(studio.current)).toEqual(before)
  })

  it('编辑中选择生成写法先退出编辑，运行时禁止换台', () => {
    const onGenerate = vi.fn()
    const view = renderWithStudio(
      <StudioDialectHeader
        editing
        onEdit={vi.fn()}
        onGenerate={onGenerate}
        disabled
      />,
    )
    fireEvent.click(screen.getByRole('tab', { name: T('dialect.tags') }))
    expect(onGenerate).not.toHaveBeenCalled()
    view.rerender(
      <StudioDialectHeader editing onEdit={vi.fn()} onGenerate={onGenerate} />,
    )
    fireEvent.click(screen.getByRole('tab', { name: T('dialect.tags') }))
    expect(onGenerate).toHaveBeenCalledOnce()
    expect(push).toHaveBeenCalledWith(ROUTES.STUDIO_IMAGE_TAGS)
  })

  it('两颗都在，高亮跟着当前这一台走', () => {
    renderWithStudio(<StudioDialectHeader />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      T('dialect.natural'),
      T('dialect.tags'),
    ])
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false')
  })

  it('普通换台不携带表单，显式跳转才记录目标与提示词携带', () => {
    const close = vi.fn()
    const view = renderWithStudio(<StudioDialectHeader />)
    act(() =>
      view.studio.current.dispatch({
        type: 'SET_PROMPT',
        payload: '雨夜的城市',
      }),
    )
    const before = formSnapshot(view.studio.current)
    fireEvent.click(screen.getByRole('tab', { name: T('dialect.tags') }))
    expect(formSnapshot(view.studio.current)).toEqual(before)
    view.unmount()

    const hint = renderWithStudio(
      <StudioDialectJumpHint query="nai" close={close} />,
    )
    act(() =>
      hint.studio.current.dispatch({
        type: 'SET_PROMPT',
        payload: '雨夜的城市',
      }),
    )
    // 「{model} 是标签模型…」：模型名是真目录里搜到的那条 NovelAI。
    const [, suffix] = text('StudioTags.jumpToTags', { model: '\u0000' }).split(
      '\u0000',
    )
    fireEvent.click(
      screen.getByRole('button', {
        name: (name) => name.endsWith(suffix!),
      }),
    )
    const transfer = hint.studio.current.state.pendingPromptTransfer
    expect(transfer).toMatchObject({ dialect: 'tags', prompt: '雨夜的城市' })
    expect(transfer?.optionId).toMatch(/nai/)
    expect(close).toHaveBeenCalledOnce()
    expect(push).toHaveBeenLastCalledWith(ROUTES.STUDIO_IMAGE_TAGS)
  })

  it('从自然语言台点「标签」落到标签台', () => {
    renderWithStudio(<StudioDialectHeader />)
    fireEvent.click(screen.getByRole('tab', { name: T('dialect.tags') }))
    expect(push).toHaveBeenCalledWith(ROUTES.STUDIO_IMAGE_TAGS)
  })

  it('从标签台点「自然语言」回得来', () => {
    const { studio } = renderWithStudio(<StudioDialectHeader />)
    inTagsStudio(studio)
    fireEvent.click(screen.getByRole('tab', { name: T('dialect.natural') }))
    expect(push).toHaveBeenCalledWith(ROUTES.STUDIO_IMAGE)
  })

  // 液态分段（owner 2026-09-26）：点下去当场就走，⛔ 不等路由报回来才动。
  it('点下去当场选中，不等路由换完', () => {
    renderWithStudio(<StudioDialectHeader />)
    fireEvent.click(screen.getByRole('tab', { name: T('dialect.tags') }))
    expect(
      screen.getByRole('tab', { name: T('dialect.tags') }),
    ).toHaveAttribute('aria-selected', 'true')
  })

  it('点已经站着的那一台不跳路由', () => {
    renderWithStudio(<StudioDialectHeader />)
    fireEvent.click(screen.getByRole('tab', { name: T('dialect.natural') }))
    expect(push).not.toHaveBeenCalled()
  })
})

/**
 * ⭐ 真机 2026-09-20：`/studio/image` 上整页查不到这对切换，标签台只能手敲地址
 * 进 —— 门只装了一侧就不是门，是单向阀。这条扫源码锁住参数列与公共工作台的入口，
 * 因为渲染测只能证明装了的那一侧还在，证不了没装的那一侧。
 * 手机自然语言台那一侧 2026-10-02 起住在舞台左上角（`StudioWorkspaceUI` 传给
 * `StudioWorkbenchLayout` 的 `header`），不再在输入条里。
 */
describe('参数列与公共工作台都挂着这扇门', () => {
  it.each([
    'src/features/studio/components/StudioPromptArea.tsx',
    'src/features/studio/components/StudioWorkspaceUI.tsx',
  ])('%s 渲染 StudioDialectHeader', (file) => {
    const source = readFileSync(join(process.cwd(), file), 'utf8')
    expect(source).toContain('<StudioDialectHeader')
  })
})
