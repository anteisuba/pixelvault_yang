import { fireEvent, render, screen } from '@testing-library/react'
import { useState, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${Object.values(values).join('/')}` : key,
}))

import {
  CANVAS_PROMPT_DOCK,
  CANVAS_SHELL_LAYOUT,
  canvasPromptDockRegionLeftPx,
} from '@/constants/canvas-shell'

import { promptDockRevealLift } from '../../../workbench-v4/node-canvas-camera'
import {
  NodePromptDock,
  NodePromptDockTarget,
  NodePromptDockTargetProvider,
  isPromptDockOwner,
} from './NodePromptDock'
import { NodePromptBar } from './NodePromptBar'

function DockHost({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLDivElement | null>(null)
  return (
    <NodePromptDockTargetProvider value={target}>
      <div data-testid="card">{children}</div>
      <div ref={setTarget} data-testid="dock" />
    </NodePromptDockTargetProvider>
  )
}

describe('谁占底部那条栏', () => {
  const base = { nodeId: 'a', selected: true, selectedCount: 1 }

  it('唯一选中的那张占', () => {
    expect(isPromptDockOwner({ ...base, expandedNodeId: null })).toBe(true)
  })

  it('没选中 / 多选 → 没有栏', () => {
    expect(
      isPromptDockOwner({
        ...base,
        selected: false,
        selectedCount: 0,
        expandedNodeId: null,
      }),
    ).toBe(false)
    expect(
      isPromptDockOwner({ ...base, selectedCount: 3, expandedNodeId: null }),
    ).toBe(false)
  })

  it('画中框开着：只有框里那张占（不管选没选中）', () => {
    expect(
      isPromptDockOwner({
        ...base,
        selected: false,
        selectedCount: 0,
        expandedNodeId: 'a',
      }),
    ).toBe(true)
    expect(isPromptDockOwner({ ...base, expandedNodeId: 'b' })).toBe(false)
  })
})

describe('NodePromptDock 传送门', () => {
  it('栏渲染进停靠区，⛔ 留在卡里', () => {
    render(
      <DockHost>
        <NodePromptDock show>
          <span>bar</span>
        </NodePromptDock>
      </DockHost>,
    )
    expect(screen.getByTestId('dock')).toHaveTextContent('bar')
    expect(screen.getByTestId('card')).toBeEmptyDOMElement()
    expect(
      screen.getByTestId('dock').querySelector('[data-canvas-prompt-dock-bar]'),
    ).toHaveStyle({ maxWidth: `${CANVAS_PROMPT_DOCK.widthPx}px` })
  })

  it('show=false 或宿主没挂停靠区 → 什么都不渲染', () => {
    render(
      <DockHost>
        <NodePromptDock show={false}>
          <span>bar</span>
        </NodePromptDock>
      </DockHost>,
    )
    expect(screen.getByTestId('dock')).toBeEmptyDOMElement()
    const { container } = render(
      <NodePromptDock show>
        <span>orphan</span>
      </NodePromptDock>,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('停靠格里的提示词栏撑满这一格（⛔ 按内容定宽）；格外的栏不受影响', () => {
    const bar = (
      <NodePromptBar
        value=""
        onValueChange={() => {}}
        onSubmit={() => {}}
        placeholder="p"
        ariaLabel="a"
      />
    )
    render(
      <DockHost>
        <NodePromptDock show>{bar}</NodePromptDock>
      </DockHost>,
    )
    expect(
      screen
        .getByTestId('dock')
        .querySelector('[data-node-chrome="prompt-bar"]'),
    ).toHaveClass('w-full')
    const { container } = render(bar)
    expect(
      container.querySelector('[data-node-chrome="prompt-bar"]'),
    ).not.toHaveClass('w-full')
  })

  it('「对象」药丸点了定位那张卡', () => {
    const onLocate = vi.fn()
    render(<NodePromptDockTarget name="镜头 3" onLocate={onLocate} />)
    const pill = screen.getByRole('button', { name: 'dockTarget:镜头 3' })
    expect(pill).toHaveClass('h-8', 'text-2sm', 'font-semibold')
    fireEvent.click(pill)
    expect(onLocate).toHaveBeenCalledTimes(1)
  })
})

describe('停靠位置由画布可视区决定', () => {
  it('左侧面板开着从面板右缘算，关着贴画布左缘', () => {
    expect(canvasPromptDockRegionLeftPx({ panelOpen: false })).toBe(0)
    expect(canvasPromptDockRegionLeftPx({ panelOpen: true })).toBe(
      CANVAS_SHELL_LAYOUT.edgeInsetPx + CANVAS_SHELL_LAYOUT.panelWidthPx,
    )
  })

  it('栏底在底栏上方 8px', () => {
    expect(CANVAS_PROMPT_DOCK.bottomPx).toBe(
      CANVAS_SHELL_LAYOUT.edgeInsetPx + CANVAS_SHELL_LAYOUT.iconButtonPx + 16,
    )
  })

  it('被栏压住才上移，移到卡下沿露在栏上方 24；卡太高先保卡顶', () => {
    const dock = { dockTop: 600, gap: 24, minTop: 64 }
    expect(
      promptDockRevealLift({ ...dock, nodeTop: 100, nodeBottom: 500 }),
    ).toBe(0)
    expect(
      promptDockRevealLift({ ...dock, nodeTop: 300, nodeBottom: 700 }),
    ).toBe(124)
    expect(
      promptDockRevealLift({ ...dock, nodeTop: 120, nodeBottom: 900 }),
    ).toBe(56)
  })
})
