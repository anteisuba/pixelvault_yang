import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'

import { useKeyboardInset } from './use-keyboard-inset'

class FakeVisualViewport extends EventTarget {
  height = 844
  offsetTop = 0
}

describe('useKeyboardInset', () => {
  let viewport: FakeVisualViewport

  beforeEach(() => {
    viewport = new FakeVisualViewport()
    vi.stubGlobal('visualViewport', viewport)
    Object.defineProperty(window, 'innerHeight', {
      value: 844,
      configurable: true,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns 0 when no keyboard occludes the viewport', () => {
    const { result } = renderHook(() => useKeyboardInset())
    expect(result.current).toBe(0)
  })

  it('returns the occluded height when the visual viewport shrinks', () => {
    const { result } = renderHook(() => useKeyboardInset())

    act(() => {
      viewport.height = 500
      viewport.dispatchEvent(new Event('resize'))
    })
    expect(result.current).toBe(344)

    // 键盘收起 → 复原
    act(() => {
      viewport.height = 844
      viewport.dispatchEvent(new Event('resize'))
    })
    expect(result.current).toBe(0)
  })

  it('ignores small visual viewport chrome changes', () => {
    const { result } = renderHook(() => useKeyboardInset())

    act(() => {
      viewport.height = 790
      viewport.dispatchEvent(new Event('resize'))
    })

    expect(result.current).toBe(0)
  })

  it('accounts for visual viewport scroll offset (iOS)', () => {
    const { result } = renderHook(() => useKeyboardInset())

    act(() => {
      viewport.height = 500
      viewport.offsetTop = 100
      viewport.dispatchEvent(new Event('scroll'))
    })
    expect(result.current).toBe(244)
  })

  it('returns 0 in environments without visualViewport', () => {
    vi.stubGlobal('visualViewport', undefined)
    const { result } = renderHook(() => useKeyboardInset())
    expect(result.current).toBe(0)
  })
})
