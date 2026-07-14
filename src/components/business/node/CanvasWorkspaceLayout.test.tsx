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
  })
})
