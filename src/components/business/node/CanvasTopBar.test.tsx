import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { CanvasTopBar } from './CanvasTopBar'

vi.mock('next-intl', () => ({
  useTranslations:
    () => (key: string, params?: Record<string, string | number>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
}))

vi.mock('sonner', () => ({
  toast: {
    info: vi.fn(),
  },
}))

vi.mock('./CanvasAppearancePanel', () => ({
  CanvasAppearancePanel: () => <button type="button">trigger</button>,
}))

function renderTopBar(overrides?: { isSaving?: boolean; nodeCount?: number }) {
  render(
    <CanvasTopBar
      nodeCount={overrides?.nodeCount ?? 3}
      projectName="Storyboard"
      canvasAppearance={undefined}
      onCanvasAppearanceChange={vi.fn()}
      isSaving={overrides?.isSaving}
    />,
  )
}

describe('CanvasTopBar', () => {
  it('does not expose a global default-video-model control', () => {
    renderTopBar()

    expect(screen.queryByText('topbar.defaultModel')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'trigger' })).toBeInTheDocument()
  })

  // 2026-08-02 owner「移出统一」：项目管理整体搬进左侧面板，保存本就是自动的，
  // 「添加节点」的唯一常驻入口改为左侧 rail。顶栏因此不再有主动作，回归纯 chrome。
  it('顶栏保留项目名，不重复保存和添加节点操作', () => {
    renderTopBar()

    // 项目名还在，但只是只读面包屑，不是下拉触发器
    expect(screen.getByText('Storyboard')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'projectMenu.triggerLabel' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'topbar.save' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'topbar.addNode' }),
    ).not.toBeInTheDocument()
  })

  // owner 2026-08-02：「整理画布」搬进底部编辑栏（CanvasBottomDock 有对应
  // 用例）。顶栏右侧现在只剩外观设置。
  it('顶栏不再有整理画布', () => {
    renderTopBar()
    expect(
      screen.queryByRole('button', { name: 'topbar.arrange' }),
    ).not.toBeInTheDocument()
  })

  it('保存中仍在片名旁给出进行态', () => {
    renderTopBar({ isSaving: true })
    // Spinner 用 role="status"（见 ui/spinner.tsx）
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('没在保存时不显示进行态', () => {
    renderTopBar({ isSaving: false })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
  it('项目名打开项目面板，助手入口复用开启回调', () => {
    const onOpenProjects = vi.fn()
    const onOpenAssistant = vi.fn()
    render(
      <CanvasTopBar
        nodeCount={3}
        projectName="Storyboard"
        canvasAppearance={undefined}
        onCanvasAppearanceChange={vi.fn()}
        onOpenProjects={onOpenProjects}
        onOpenAssistant={onOpenAssistant}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'projectMenu.current' }))
    fireEvent.click(screen.getByRole('button', { name: 'assistant.toggle' }))
    expect(onOpenProjects).toHaveBeenCalledOnce()
    expect(onOpenAssistant).toHaveBeenCalledOnce()
  })
})
