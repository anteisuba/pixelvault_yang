import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'

import { KeyboardInsetBridge } from './KeyboardInsetBridge'

class FakeVisualViewport extends EventTarget {
  height = 844
  offsetTop = 0
}

describe('KeyboardInsetBridge', () => {
  let viewport: FakeVisualViewport

  beforeEach(() => {
    viewport = new FakeVisualViewport()
    vi.stubGlobal('visualViewport', viewport)
    Object.defineProperty(window, 'innerHeight', {
      value: 844,
      configurable: true,
    })
    document.documentElement.style.removeProperty('--keyboard-inset')
    document.documentElement.dataset.keyboardOpen = 'false'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    document.documentElement.style.removeProperty('--keyboard-inset')
    document.documentElement.dataset.keyboardOpen = 'false'
  })

  it('publishes keyboard inset to the document root', () => {
    render(<KeyboardInsetBridge />)

    expect(
      document.documentElement.style.getPropertyValue('--keyboard-inset'),
    ).toBe('0px')
    expect(document.documentElement.dataset.keyboardOpen).toBe('false')

    act(() => {
      viewport.height = 500
      viewport.dispatchEvent(new Event('resize'))
    })

    expect(
      document.documentElement.style.getPropertyValue('--keyboard-inset'),
    ).toBe('344px')
    expect(document.documentElement.dataset.keyboardOpen).toBe('true')
  })
})
