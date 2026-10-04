import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ROUTES } from '@/constants/routes'

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  dispatch: vi.fn(),
  dialect: 'natural' as string,
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))
vi.mock('motion/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('motion/react')>()),
  useReducedMotion: () => true,
}))
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}))
vi.mock('@/contexts/studio-context', () => ({
  useStudioForm: () => ({
    state: { promptDialect: mocks.dialect },
    dispatch: mocks.dispatch,
  }),
}))

vi.mock('@/hooks/use-image-model-options', () => ({
  useImageModelOptions: () => ({
    modelOptions: [
      {
        optionId: 'nai-route',
        modelId: 'nai-diffusion-5-full',
        adapterType: 'novelai',
      },
    ],
  }),
}))

import { StudioDialectJumpHint } from './StudioDialectJumpHint'

import { StudioDialectHeader } from './StudioDialectHeader'

describe('两台之间那扇门', () => {
  beforeEach(() => {
    mocks.push.mockClear()
    mocks.dispatch.mockClear()
    mocks.dialect = 'natural'
  })

  it('编辑入口只进入编辑会话，不改 prompt dialect 或路由', () => {
    const onEdit = vi.fn()
    render(<StudioDialectHeader onEdit={onEdit} />)
    fireEvent.click(screen.getByRole('tab', { name: 'editMode' }))
    expect(onEdit).toHaveBeenCalledOnce()
    expect(mocks.push).not.toHaveBeenCalled()
    expect(mocks.dispatch).not.toHaveBeenCalled()
  })

  it('编辑中选择生成写法先退出编辑，运行时禁止换台', () => {
    const onGenerate = vi.fn()
    const view = render(
      <StudioDialectHeader
        editing
        onEdit={vi.fn()}
        onGenerate={onGenerate}
        disabled
      />,
    )
    fireEvent.click(screen.getByRole('tab', { name: 'dialect.tags' }))
    expect(onGenerate).not.toHaveBeenCalled()
    view.rerender(
      <StudioDialectHeader editing onEdit={vi.fn()} onGenerate={onGenerate} />,
    )
    fireEvent.click(screen.getByRole('tab', { name: 'dialect.tags' }))
    expect(onGenerate).toHaveBeenCalledOnce()
    expect(mocks.push).toHaveBeenCalledWith(ROUTES.STUDIO_IMAGE_TAGS)
  })

  it('两颗都在，高亮跟着当前这一台走', () => {
    render(<StudioDialectHeader />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'dialect.natural',
      'dialect.tags',
    ])
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false')
  })

  it('普通换台不携带表单，显式跳转才记录目标与提示词携带', () => {
    const close = vi.fn()
    const view = render(<StudioDialectHeader />)
    fireEvent.click(screen.getByRole('tab', { name: 'dialect.tags' }))
    expect(mocks.dispatch).not.toHaveBeenCalled()
    view.unmount()
    render(<StudioDialectJumpHint query="nai" close={close} />)
    fireEvent.click(screen.getByRole('button', { name: 'jumpToTags' }))
    expect(mocks.dispatch.mock.calls).toEqual([
      [
        {
          type: 'TRANSFER_IMAGE_PROMPT',
          payload: { dialect: 'tags', optionId: 'nai-route' },
        },
      ],
    ])
    expect(close).toHaveBeenCalledOnce()
    expect(mocks.push).toHaveBeenLastCalledWith(ROUTES.STUDIO_IMAGE_TAGS)
  })

  it('从自然语言台点「标签」落到标签台', () => {
    render(<StudioDialectHeader />)
    fireEvent.click(screen.getByRole('tab', { name: 'dialect.tags' }))
    expect(mocks.push).toHaveBeenCalledWith(ROUTES.STUDIO_IMAGE_TAGS)
  })

  it('从标签台点「自然语言」回得来', () => {
    mocks.dialect = 'tags'
    render(<StudioDialectHeader />)
    fireEvent.click(screen.getByRole('tab', { name: 'dialect.natural' }))
    expect(mocks.push).toHaveBeenCalledWith(ROUTES.STUDIO_IMAGE)
  })

  // 液态分段（owner 2026-09-26）：点下去当场就走，⛔ 不等路由报回来才动。
  it('点下去当场选中，不等路由换完', () => {
    render(<StudioDialectHeader />)
    fireEvent.click(screen.getByRole('tab', { name: 'dialect.tags' }))
    expect(screen.getByRole('tab', { name: 'dialect.tags' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('点已经站着的那一台不跳路由', () => {
    render(<StudioDialectHeader />)
    fireEvent.click(screen.getByRole('tab', { name: 'dialect.natural' }))
    expect(mocks.push).not.toHaveBeenCalled()
  })
})

/**
 * ⭐ 真机 2026-09-20：`/studio/image` 上整页查不到这对切换，标签台只能手敲地址
 * 进 —— 门只装了一侧就不是门，是单向阀。这条扫源码锁住「三个宿主都挂它」，
 * 因为渲染测只能证明装了的那一侧还在，证不了没装的那一侧。
 * 手机自然语言台那一侧 2026-10-02 起住在舞台左上角（`StudioWorkspaceUI` 传给
 * `StudioWorkbenchLayout` 的 `header`），不再在输入条里。
 */
describe('三个参数宿主都挂着这扇门', () => {
  it.each([
    'src/components/business/studio/StudioPromptArea.tsx',
    'src/components/business/StudioWorkspaceUI.tsx',
    'src/components/business/studio/tags/StudioTagsWorkbench.tsx',
  ])('%s 渲染 StudioDialectHeader', (file) => {
    const source = readFileSync(join(process.cwd(), file), 'utf8')
    expect(source).toContain('<StudioDialectHeader')
  })
})
