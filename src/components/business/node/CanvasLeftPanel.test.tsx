import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  CANVAS_LEFT_PANEL_RAIL_PX,
  CANVAS_LEFT_PANEL_WIDTH_PX,
  CanvasLeftPanel,
} from './CanvasLeftPanel'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

function renderPanel(overrides?: {
  expanded?: boolean
  onExpandedChange?: (expanded: boolean) => void
  onAddClick?: () => void
}) {
  const onExpandedChange = overrides?.onExpandedChange ?? vi.fn()
  const onAddClick = overrides?.onAddClick ?? vi.fn()
  render(
    <CanvasLeftPanel
      expanded={overrides?.expanded ?? true}
      onExpandedChange={onExpandedChange}
      nodeCount={3}
      onAddClick={onAddClick}
    >
      <div data-testid="panel-content">卡匣内容</div>
    </CanvasLeftPanel>,
  )
  return { onExpandedChange, onAddClick }
}

describe('CanvasLeftPanel', () => {
  // S2b 规格 §8：展开 = 56 图标轨 + 240 内容区；收起只剩图标轨。
  // 宽度是**内联**给的而不是 CSS 类——真机上同一条 [data-expanded='false']
  // 规则里 border-radius 生效了、width 没生效，所以这里断言内联值，防止有人
  // 好心把它挪回 CSS 又悄悄失效。
  it('is 296px wide when expanded and renders the hosted panel', () => {
    renderPanel({ expanded: true })

    const panel = screen.getByTestId('canvas-left-panel')
    expect(panel).toHaveAttribute('data-expanded', 'true')
    expect(panel.style.width).toBe(`${CANVAS_LEFT_PANEL_WIDTH_PX}px`)
    expect(screen.getByTestId('panel-content')).toBeInTheDocument()
  })

  // 收起时内容区是**不渲染**而不是 hidden：留着一个 0 宽的盒子，里面的滚动
  // 容器还会继续测量它。
  it('shrinks to the icon rail and unmounts the content when collapsed', () => {
    renderPanel({ expanded: false })

    const panel = screen.getByTestId('canvas-left-panel')
    expect(panel).toHaveAttribute('data-expanded', 'false')
    expect(panel.style.width).toBe(`${CANVAS_LEFT_PANEL_RAIL_PX}px`)
    expect(screen.queryByTestId('panel-content')).not.toBeInTheDocument()
  })

  it('toggles from the rail icon and closes from the header button', () => {
    const onExpandedChange = vi.fn()
    renderPanel({ expanded: true, onExpandedChange })

    fireEvent.click(screen.getByRole('button', { name: 'collapse' }))
    expect(onExpandedChange).toHaveBeenLastCalledWith(false)

    // 图标轨上的班底按钮是同一个开关的另一端（aria-pressed 反映当前态）。
    const railToggle = screen.getAllByRole('button', { name: 'title' })[0]
    expect(railToggle).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(railToggle)
    expect(onExpandedChange).toHaveBeenLastCalledWith(false)
  })

  // 规格 §0.6：＋添加是全画面唯一的墨色实底。它靠 canvas-rail-action 上色，
  // 类名掉了就等于这条唯一性没了。
  it('keeps the add action on the ink-solid rail class', () => {
    const onAddClick = vi.fn()
    renderPanel({ onAddClick })

    const add = screen.getByRole('button', { name: 'addNode' })
    expect(add).toHaveClass('canvas-rail-action')
    fireEvent.click(add)
    expect(onAddClick).toHaveBeenCalledTimes(1)
  })
})
