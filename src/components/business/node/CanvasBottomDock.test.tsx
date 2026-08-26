import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CanvasBottomDock } from './CanvasBottomDock'

const { fitView, zoomIn, zoomOut } = vi.hoisted(() => ({
  fitView: vi.fn(),
  zoomIn: vi.fn(),
  zoomOut: vi.fn(),
}))

vi.mock('@xyflow/react', () => ({
  useReactFlow: () => ({ fitView, zoomIn, zoomOut }),
  useViewport: () => ({ zoom: 1.25 }),
}))

vi.mock('next-intl', () => ({
  useTranslations:
    () => (key: string, params?: Record<string, string | number>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
}))

vi.mock('sonner', () => ({ toast: { info: vi.fn() } }))

describe('CanvasBottomDock', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows only real canvas tools and reports the live zoom', () => {
    render(
      <CanvasBottomDock
        activeMode="pointer"
        canUndo
        canRedo={false}
        onModeChange={vi.fn()}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        nodeCount={3}
        relationsCollapsed={false}
        onRelationsCollapsedChange={vi.fn()}
      />,
    )

    expect(
      screen.getByRole('button', { name: 'bottomDock.pointer' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'bottomDock.hand' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'bottomDock.connect' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'bottomDock.cut' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByText('bottomDock.zoomLevel:{"percent":125}'),
    ).toBeInTheDocument()
  })

  it('controls zoom and fit view through the React Flow viewport', () => {
    render(
      <CanvasBottomDock
        activeMode="pointer"
        canUndo={false}
        canRedo={false}
        onModeChange={vi.fn()}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        nodeCount={3}
        relationsCollapsed={false}
        onRelationsCollapsedChange={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'bottomDock.zoomOut' }))
    fireEvent.click(screen.getByRole('button', { name: 'bottomDock.zoomIn' }))
    fireEvent.click(screen.getByRole('button', { name: 'bottomDock.fitView' }))

    expect(zoomOut).toHaveBeenCalledWith({ duration: 160 })
    expect(zoomIn).toHaveBeenCalledWith({ duration: 160 })
    expect(fitView).toHaveBeenCalledWith({
      padding: 0.16,
      duration: 220,
      maxZoom: 2,
    })
  })

  // G2（画布修法 P2 收口）：调查实测底栏曾有两颗同名同义的「适应画布」
  // （zoom-level 文本按钮 + Focus 图标按钮，点哪个都调用同一个 fitView）。
  // `getByRole` 本身就是回归闸——如果重新长出第二个同名按钮，它会因为
  // 「匹配到多个元素」直接抛错而不是静默通过。
  it('底栏只剩一颗「适应画布」，缩放百分比只做只读展示', () => {
    render(
      <CanvasBottomDock
        activeMode="pointer"
        canUndo={false}
        canRedo={false}
        onModeChange={vi.fn()}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        nodeCount={3}
        relationsCollapsed={false}
        onRelationsCollapsedChange={vi.fn()}
      />,
    )

    expect(
      screen.getAllByRole('button', { name: 'bottomDock.fitView' }),
    ).toHaveLength(1)
    expect(
      screen.getByText('bottomDock.zoomLevel:{"percent":125}'),
    ).toBeInTheDocument()
  })

  it('toggles the 关系线 collapse switch and reflects its pressed (收起) state', () => {
    // FB-B（真机反馈拍板反转默认）: default `relationsCollapsed={false}` =
    // 全显 → aria-pressed starts false; clicking collapses (aria-pressed
    // becomes true).
    const onRelationsCollapsedChange = vi.fn()
    const { rerender } = render(
      <CanvasBottomDock
        activeMode="pointer"
        canUndo={false}
        canRedo={false}
        onModeChange={vi.fn()}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        nodeCount={3}
        relationsCollapsed={false}
        onRelationsCollapsedChange={onRelationsCollapsedChange}
      />,
    )

    const toggle = screen.getByRole('button', {
      name: 'bottomDock.relationsCollapse',
    })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(toggle)
    expect(onRelationsCollapsedChange).toHaveBeenCalledWith(true)

    rerender(
      <CanvasBottomDock
        activeMode="pointer"
        canUndo={false}
        canRedo={false}
        onModeChange={vi.fn()}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        nodeCount={3}
        relationsCollapsed
        onRelationsCollapsedChange={onRelationsCollapsedChange}
      />,
    )
    expect(
      screen.getByRole('button', { name: 'bottomDock.relationsCollapse' }),
    ).toHaveAttribute('aria-pressed', 'true')
  })

  // owner 2026-08-02：「右上整理画布这个加在底部编辑栏中」。它重排的是节点
  // 位置，跟这条胶囊里的缩放/适应/关系线同属「看画布」。
  describe('整理画布（从顶栏搬来）', () => {
    it('点了就派发，空画布时禁用', () => {
      const onArrange = vi.fn()
      const { rerender } = render(
        <CanvasBottomDock
          activeMode="pointer"
          canUndo={false}
          canRedo={false}
          onModeChange={vi.fn()}
          onUndo={vi.fn()}
          onRedo={vi.fn()}
          nodeCount={3}
          relationsCollapsed={false}
          onRelationsCollapsedChange={vi.fn()}
          onArrange={onArrange}
        />,
      )

      const arrange = screen.getByRole('button', { name: 'topbar.arrange' })
      expect(arrange).toBeEnabled()
      fireEvent.click(arrange)
      expect(onArrange).toHaveBeenCalledTimes(1)

      rerender(
        <CanvasBottomDock
          activeMode="pointer"
          canUndo={false}
          canRedo={false}
          onModeChange={vi.fn()}
          onUndo={vi.fn()}
          onRedo={vi.fn()}
          nodeCount={0}
          relationsCollapsed={false}
          onRelationsCollapsedChange={vi.fn()}
          onArrange={onArrange}
        />,
      )
      expect(
        screen.getByRole('button', { name: 'topbar.arrange' }),
      ).toBeDisabled()
    })
  })
})
