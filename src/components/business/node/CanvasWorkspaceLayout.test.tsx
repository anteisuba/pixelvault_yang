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
})
