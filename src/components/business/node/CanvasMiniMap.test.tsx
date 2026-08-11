import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@xyflow/react', () => ({
  useNodes: () => [{ id: 'node-1' }],
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
})
