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
        relationsCollapsed={false}
        onRelationsCollapsedChange={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'bottomDock.zoomOut' }))
    fireEvent.click(screen.getByRole('button', { name: 'bottomDock.zoomIn' }))
    fireEvent.click(
      screen.getAllByRole('button', { name: 'bottomDock.fitView' })[0]!,
    )

    expect(zoomOut).toHaveBeenCalledWith({ duration: 160 })
    expect(zoomIn).toHaveBeenCalledWith({ duration: 160 })
    expect(fitView).toHaveBeenCalledWith({
      padding: 0.16,
      duration: 220,
      maxZoom: 2,
    })
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
        relationsCollapsed
        onRelationsCollapsedChange={onRelationsCollapsedChange}
      />,
    )
    expect(
      screen.getByRole('button', { name: 'bottomDock.relationsCollapse' }),
    ).toHaveAttribute('aria-pressed', 'true')
  })
})
