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
    expect(stageRef.current).toBe(stage)
    expect(stage.parentElement).toBe(workspace)
    expect(rail.parentElement).toBe(workspace)
    expect(rail).toHaveClass('pointer-events-none')

    // S0 画布域皮肤作用域：.domain-canvas 声明 color-scheme:light（画布域是浅色
    // 档，而 app 全局是 <html class="dark">）。它必须**只包 stage**——助手 dock
    // 仍是深色面板，被圈进来的话原生滚动条/输入控件会按浅色渲染。
    expect(stage).toHaveClass('domain-canvas')
    expect(workspace).not.toHaveClass('domain-canvas')
    expect(rail.closest('.domain-canvas')).toBeNull()
  })
})
