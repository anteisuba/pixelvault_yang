/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ASSISTANT_TOUCH_FLASH_MOTION, DURATION_MS } from '@/constants/motion'
import { STUDIO_OPERATOR_FIELD_IDS } from '@/constants/studio-assistant-operator'
import {
  ASSISTANT_FIELD_TOUCH_CLASS,
  flashAssistantTouchedField,
} from '@/lib/studio-operator-flash'

/**
 * 助手光标（owner 2026-10-07 动效第 2 批「改工作台」）：桌面且动效开着时，
 * 一格一格走过去、到了才闪；同一时间只动一处。
 */

function mountField(field: string): HTMLElement {
  const el = document.createElement('div')
  el.setAttribute('data-assistant-field', field)
  /* jsdom 不排版：给它一个「在屏幕上」的矩形，光标才会往这儿走。 */
  el.getClientRects = () =>
    [{ left: 0, top: 0, width: 80, height: 24 }] as unknown as DOMRectList
  document.body.append(el)
  return el
}

const touched = (el: HTMLElement) =>
  el.classList.contains(ASSISTANT_FIELD_TOUCH_CLASS)

beforeEach(() => {
  vi.useFakeTimers()
  window.matchMedia = ((query: string) => ({
    matches: query === '(pointer: fine)',
  })) as unknown as typeof window.matchMedia
  HTMLElement.prototype.animate = vi.fn(
    () => ({}) as Animation,
  ) as unknown as typeof HTMLElement.prototype.animate
})

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('助手光标', () => {
  it('⭐ 两格排队：先走到第一格再闪，闪完才去第二格', async () => {
    const model = mountField(STUDIO_OPERATOR_FIELD_IDS.model)
    const count = mountField(STUDIO_OPERATOR_FIELD_IDS.count)
    flashAssistantTouchedField(STUDIO_OPERATOR_FIELD_IDS.model)
    flashAssistantTouchedField(STUDIO_OPERATOR_FIELD_IDS.count)

    // 光标还在路上：谁都没闪。
    expect(touched(model)).toBe(false)
    expect(document.querySelector('.assistant-cursor')).not.toBeNull()

    await vi.advanceTimersByTimeAsync(DURATION_MS.base)
    expect(touched(model)).toBe(true)
    expect(touched(count)).toBe(false)

    await vi.advanceTimersByTimeAsync(
      ASSISTANT_TOUCH_FLASH_MOTION.durationMs + DURATION_MS.slow,
    )
    expect(touched(count)).toBe(true)
  })

  it('减少动效时不排队，当场闪', () => {
    window.matchMedia = ((query: string) => ({
      matches:
        query === '(pointer: fine)' ||
        query === '(prefers-reduced-motion: reduce)',
    })) as unknown as typeof window.matchMedia
    const model = mountField(STUDIO_OPERATOR_FIELD_IDS.model)
    flashAssistantTouchedField(STUDIO_OPERATOR_FIELD_IDS.model)
    expect(touched(model)).toBe(true)
  })
})
