import { fireEvent, render } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { Slider } from './slider'

/** jsdom 不排版：轨道固定在 x = 0–200。 */
beforeAll(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    right: 200,
    top: 0,
    bottom: 6,
    width: 200,
    height: 6,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  })
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(200)
  // Radix 用它量拇指尺寸。
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  HTMLElement.prototype.setPointerCapture = vi.fn()
  HTMLElement.prototype.releasePointerCapture = vi.fn()
  HTMLElement.prototype.hasPointerCapture = vi.fn(() => true)
})

function dragPastRightEnd(stretch?: boolean) {
  const { container } = render(
    <Slider
      min={0}
      max={10}
      value={[5]}
      aria-label="步数"
      {...(stretch === undefined ? {} : { stretch })}
    />,
  )
  const root = container.querySelector('[data-slot="slider"]') as HTMLElement
  const track = container.querySelector(
    '[data-slot="slider-track"]',
  ) as HTMLElement
  fireEvent.pointerDown(root, { clientX: 190, pointerId: 1, button: 0 })
  fireEvent.pointerMove(root, { clientX: 260, pointerId: 1 })
  return { root, track, container }
}

describe('Slider · 拖过头的橡皮筋（owner 2026-10-08 B）', () => {
  it('拉过右端：条从左端往右拉长、变细，圆钮跟着出去', () => {
    const { track, container } = dragPastRightEnd()
    expect(track.style.transformOrigin).toBe('left center')
    expect(track.style.transform).toMatch(/^scale\(1\.\d+, 0\.\d+\)$/)
    const thumb = container.querySelector(
      '[data-slot="slider-thumb"]',
    ) as HTMLElement
    expect(thumb.style.transform).toBe('translateX(18px)')
  })

  it('stretch={false}（笔刷、时间线缩放）拉过头也不变形', () => {
    const { track } = dragPastRightEnd(false)
    expect(track.style.transform).toBe('')
  })
})
