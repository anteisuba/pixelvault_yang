import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useOverlayFocusReturn } from '@/hooks/node/use-overlay-focus-return'

describe('useOverlayFocusReturn', () => {
  let trigger: HTMLButtonElement
  const originalRequestAnimationFrame = window.requestAnimationFrame
  const originalCancelAnimationFrame = window.cancelAnimationFrame

  beforeEach(() => {
    trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()
    // Run the deferred restore synchronously so assertions don't need to
    // wait a real frame — same stub pattern as CanvasAddMenu.test.tsx.
    window.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    window.cancelAnimationFrame = vi.fn()
  })

  afterEach(() => {
    window.requestAnimationFrame = originalRequestAnimationFrame
    window.cancelAnimationFrame = originalCancelAnimationFrame
    trigger.remove()
  })

  it('captures the focused element on the false→true edge and restores it on true→false', () => {
    const { rerender } = renderHook(
      ({ active }: { active: boolean }) => useOverlayFocusReturn(active),
      { initialProps: { active: false } },
    )

    // Overlay opens — the trigger loses focus (as it would when a panel
    // steals it), mirroring the real "open a panel, focus moves inside it"
    // sequence.
    rerender({ active: true })
    trigger.blur()
    expect(document.activeElement).not.toBe(trigger)

    // Overlay closes — focus returns to the captured trigger.
    rerender({ active: false })
    expect(document.activeElement).toBe(trigger)
  })

  it('is a no-op when the captured trigger has left the DOM by the time the overlay closes', () => {
    const { rerender } = renderHook(
      ({ active }: { active: boolean }) => useOverlayFocusReturn(active),
      { initialProps: { active: false } },
    )

    rerender({ active: true })
    trigger.remove()

    expect(() => rerender({ active: false })).not.toThrow()
  })

  it('does nothing while active stays false (no trigger captured, nothing to restore)', () => {
    const { rerender } = renderHook(
      ({ active }: { active: boolean }) => useOverlayFocusReturn(active),
      { initialProps: { active: false } },
    )

    rerender({ active: false })
    expect(document.activeElement).toBe(trigger)
  })
})
