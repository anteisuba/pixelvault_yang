import { createRef } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { CanvasWorkspaceLayout } from './CanvasWorkspaceLayout'

describe('CanvasWorkspaceLayout', () => {
  it('keeps the stage and assistant as separate geometry siblings', () => {
    const stageRef = createRef<HTMLDivElement>()
    render(
      <CanvasWorkspaceLayout
        assistantMode="chat"
        stageRef={stageRef}
        assistant={<aside>Assistant</aside>}
      >
        <div>Canvas</div>
      </CanvasWorkspaceLayout>,
    )

    const workspace = screen.getByTestId('canvas-workspace-layout')
    const stage = screen.getByTestId('canvas-stage')
    const rail = screen.getByTestId('canvas-assistant-rail')

    expect(workspace).toHaveAttribute('data-assistant-mode', 'chat')
    expect(workspace).toHaveAttribute('data-canvas-workspace')
    expect(stageRef.current).toBe(stage)
    expect(stage.parentElement).toBe(workspace)
    expect(rail.parentElement).toBe(workspace)
    expect(rail).toHaveClass('pointer-events-none')
    expect(rail).toHaveClass('lg:top-16', 'lg:right-4', 'lg:bottom-4')
    expect(rail).not.toHaveClass('lg:pointer-events-auto')

    // S0 画布域皮肤作用域：.domain-canvas 声明 color-scheme:light + 全部
    // --canvas-* token。v0.2（2026-07-27，owner 拍板）之前它只包 stage——
    // 助手 dock 那时仍是深色面板，圈进来会让原生滚动条/输入控件被带偏成浅色。
    // owner 纠正画布助手表面也要显式改白后，前提翻转：rail 现在**也**独立
    // 挂这个 class（与 stage 各自一份，两者仍是 workspace 下的平级兄弟，见
    // 上面 parentElement 断言），StudioNodeAssistantDock.tsx 才读得到
    // --canvas-*；workspace 自己仍然不挂，作用域粒度不下放到共同祖先。
    expect(stage).toHaveClass('domain-canvas')
    expect(rail).toHaveClass('domain-canvas')
    expect(workspace).not.toHaveClass('domain-canvas')
  })

  /**
   * ⭐ **rail 是 none，装进去的东西自己声明 auto**（2026-09-19 真机：画布页面板
   * 点不动）。rail 必须 none —— 它是一条全屏层，可点就会盖住整张画布；所以
   * 「这块可点」这件事由助手自己说（见 `StudioOperatorDock` 的 aside）。
   */
  it('⭐ rail 不吃点击，而自己声明 auto 的子元素照旧可点', () => {
    const stageRef = createRef<HTMLDivElement>()
    render(
      <CanvasWorkspaceLayout
        assistantMode="chat"
        stageRef={stageRef}
        assistant={
          <aside
            data-testid="assistant-surface"
            className="pointer-events-auto"
          >
            Assistant
          </aside>
        }
      >
        <div>Canvas</div>
      </CanvasWorkspaceLayout>,
    )
    const rail = screen.getByTestId('canvas-assistant-rail')
    const surface = screen.getByTestId('assistant-surface')
    expect(rail).toHaveClass('pointer-events-none')
    expect(surface.parentElement).toBe(rail)
    expect(surface).toHaveClass('pointer-events-auto')
  })

  it('script mode is the expanded two-column rail, not a second geometry owner', () => {
    const stageRef = createRef<HTMLDivElement>()
    render(
      <CanvasWorkspaceLayout
        assistantMode="script"
        stageRef={stageRef}
        assistant={<aside>Assistant</aside>}
      >
        <div>Canvas</div>
      </CanvasWorkspaceLayout>,
    )

    expect(screen.getByTestId('canvas-workspace-layout')).toHaveAttribute(
      'data-assistant-mode',
      'script',
    )
  })
})
