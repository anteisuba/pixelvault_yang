import { afterEach, describe, expect, it, vi } from 'vitest'

import { focusUnlessTouch, isTouchPrimary } from './touch'

function stubHoverNone(isTouch: boolean) {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: query === '(hover: none)' ? isTouch : false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }) as unknown as MediaQueryList,
  )
}

describe('isTouchPrimary', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('is true when the primary pointer cannot hover (touch device)', () => {
    stubHoverNone(true)
    expect(isTouchPrimary()).toBe(true)
  })

  it('is false on hover-capable (desktop) devices', () => {
    stubHoverNone(false)
    expect(isTouchPrimary()).toBe(false)
  })

  it('falls back to false when matchMedia is unavailable (SSR/JSDOM)', () => {
    vi.stubGlobal('matchMedia', undefined)
    expect(isTouchPrimary()).toBe(false)
  })
})

describe('focusUnlessTouch', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
  })

  it('focuses (and optionally selects) on desktop', () => {
    stubHoverNone(false)
    const el = document.createElement('input')
    el.value = 'abc'
    document.body.appendChild(el)

    focusUnlessTouch(el, { select: true })

    expect(document.activeElement).toBe(el)
    expect(el.selectionStart).toBe(0)
    expect(el.selectionEnd).toBe(3)
  })

  it('does NOT focus on touch devices (avoids popping the keyboard)', () => {
    stubHoverNone(true)
    const el = document.createElement('input')
    document.body.appendChild(el)

    focusUnlessTouch(el)

    expect(document.activeElement).not.toBe(el)
  })

  it('is a no-op for a nullish element', () => {
    stubHoverNone(false)
    expect(() => focusUnlessTouch(null)).not.toThrow()
  })
})
