import { afterEach, describe, expect, it, vi } from 'vitest'

import { STUDIO_PROMPT_TEXTAREA_ID } from '@/constants/studio'

import { focusStudioPrompt } from './focus-studio-prompt'

function mountTextarea() {
  const el = document.createElement('textarea')
  el.id = STUDIO_PROMPT_TEXTAREA_ID
  el.value = 'hello'
  document.body.appendChild(el)
  return el
}

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

describe('focusStudioPrompt', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
  })

  it('focuses the prompt textarea on fine-pointer (desktop) devices', () => {
    const el = mountTextarea()
    stubHoverNone(false)

    focusStudioPrompt()

    expect(document.activeElement).toBe(el)
  })

  it('does NOT focus on touch-primary devices (avoids popping the keyboard)', () => {
    const el = mountTextarea()
    stubHoverNone(true)

    focusStudioPrompt()

    expect(document.activeElement).not.toBe(el)
  })

  it('selects the text when { select: true } on desktop', () => {
    const el = mountTextarea()
    stubHoverNone(false)

    focusStudioPrompt({ select: true })

    expect(el.selectionStart).toBe(0)
    expect(el.selectionEnd).toBe(el.value.length)
  })

  it('is a no-op when the textarea is absent', () => {
    stubHoverNone(false)
    expect(() => focusStudioPrompt()).not.toThrow()
  })
})
