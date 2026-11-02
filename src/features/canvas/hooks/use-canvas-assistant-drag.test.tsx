import { createRef } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useCanvasAssistantDrag } from './use-canvas-assistant-drag'

function rect({
  left,
  top,
  width,
  height,
}: {
  left: number
  top: number
  width: number
  height: number
}): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  }
}

function Harness() {
  const panelRef = createRef<HTMLElement>()
  const drag = useCanvasAssistantDrag(panelRef, true)

  return (
    <div
      data-canvas-workspace
      ref={(element) => {
        if (element) {
          element.getBoundingClientRect = () =>
            rect({ left: 48, top: 0, width: 1079, height: 912 })
        }
      }}
    >
      <aside
        ref={(element) => {
          panelRef.current = element
          if (element) {
            element.getBoundingClientRect = () =>
              rect({ left: 751, top: 16, width: 360, height: 880 })
          }
        }}
      >
        <header aria-label="move" tabIndex={0} {...drag.handleProps}>
          <span>Title</span>
          <button aria-label="action" />
        </header>
      </aside>
    </div>
  )
}

describe('useCanvasAssistantDrag', () => {
  it('moves from the handle and clamps the panel inside the canvas workspace', () => {
    Element.prototype.setPointerCapture = vi.fn()
    Element.prototype.releasePointerCapture = vi.fn()
    render(<Harness />)

    const handle = screen.getByLabelText('move')
    const panel = handle.closest('aside')
    fireEvent.pointerDown(handle, {
      button: 0,
      pointerId: 1,
      clientX: 780,
      clientY: 24,
    })
    fireEvent.pointerMove(handle, {
      pointerId: 1,
      clientX: 500,
      clientY: 200,
    })

    expect(panel).toHaveStyle({
      transform: 'translate3d(-280px, 0px, 0)',
    })
    fireEvent.pointerUp(handle, { pointerId: 1 })
  })

  it('supports keyboard movement and Home reset', () => {
    render(<Harness />)

    const handle = screen.getByLabelText('move')
    const panel = handle.closest('aside')
    fireEvent.keyDown(handle, { key: 'ArrowLeft' })
    expect(panel).toHaveStyle({
      transform: 'translate3d(-24px, 0px, 0)',
    })

    fireEvent.keyDown(handle, { key: 'Home' })
    expect(panel).toHaveStyle({ transform: 'translate3d(0px, 0px, 0)' })
  })

  it('leaves header buttons clickable instead of starting a panel drag', () => {
    render(<Harness />)

    const header = screen.getByLabelText('move')
    const action = screen.getByRole('button', { name: 'action' })
    const panel = header.closest('aside')
    fireEvent.pointerDown(action, {
      button: 0,
      pointerId: 2,
      clientX: 900,
      clientY: 24,
    })
    fireEvent.pointerMove(header, {
      pointerId: 2,
      clientX: 600,
      clientY: 24,
    })

    expect(panel?.style.transform).toBe('')
  })
})
