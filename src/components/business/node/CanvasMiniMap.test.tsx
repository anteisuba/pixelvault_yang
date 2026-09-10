import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@xyflow/react', () => ({
  MiniMap: ({ pannable, zoomable, className }: Record<string, unknown>) => (
    <div
      data-testid="minimap"
      data-pannable={String(pannable)}
      data-zoomable={String(zoomable)}
      className={String(className)}
    />
  ),
}))

import { CanvasMiniMap } from './CanvasMiniMap'

describe('CanvasMiniMap', () => {
  it('保留拖拽缩放能力并自身恢复指针事件', () => {
    render(<CanvasMiniMap />)

    const minimap = screen.getByTestId('minimap')
    expect(minimap).toHaveAttribute('data-pannable', 'true')
    expect(minimap).toHaveAttribute('data-zoomable', 'true')
    expect(minimap).toHaveClass('pointer-events-auto')
  })
  it('默认展开，点击收起后仍能重新打开（按钮文案跟着换）', () => {
    render(<CanvasMiniMap />)
    const toggle = screen.getByRole('button', { name: 'collapse' })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(toggle)
    expect(screen.queryByTestId('minimap')).not.toBeInTheDocument()
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveAccessibleName('expand')
    fireEvent.click(toggle)
    expect(screen.getByTestId('minimap')).toBeInTheDocument()
  })

  // S7 §7：常显可收。⛔ 空项目里不自己藏起来 —— 会自己消失的控件，用户第二次
  // 找不到它时不会想到是因为画布空了。
  it('画布上一个节点都没有时照样在', () => {
    render(<CanvasMiniMap />)
    expect(screen.getByTestId('minimap')).toBeInTheDocument()
  })
})
