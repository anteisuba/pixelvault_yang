/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  endMediaDragGhost,
  liftMediaDragGhost,
} from '@/hooks/node/node-media-drag-ghost'

/**
 * 素材拖上画布（动效样片 AF）：拿起时放一张跟手的影子并关掉浏览器拖影；
 * 没落进画布就收掉 —— 影子一定会被摘掉。
 */

function stubMotion(reduce: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: reduce && query === '(prefers-reduced-motion: reduce)',
  })) as unknown as typeof window.matchMedia
}

function mountTile() {
  const tile = document.createElement('div')
  tile.getBoundingClientRect = () =>
    ({ left: 10, top: 20, width: 80, height: 60 }) as DOMRect
  document.body.append(tile)
  return tile
}

function dragEvent() {
  return {
    clientX: 30,
    clientY: 40,
    dataTransfer: { setDragImage: vi.fn() } as unknown as DataTransfer,
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  HTMLElement.prototype.animate = vi.fn(
    () => ({ cancel: vi.fn() }) as unknown as Animation,
  ) as unknown as typeof HTMLElement.prototype.animate
  stubMotion(false)
})

afterEach(() => {
  vi.runAllTimers()
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('liftMediaDragGhost', () => {
  it('puts a lifted ghost under the pointer and swaps out the browser drag image', () => {
    const tile = mountTile()
    const event = dragEvent()
    const transparent = new Image()
    liftMediaDragGhost(event, tile, '/a.png', transparent)

    expect(event.dataTransfer.setDragImage).toHaveBeenCalledWith(
      transparent,
      0,
      0,
    )
    const ghost = document.body.lastElementChild as HTMLElement
    expect(ghost).not.toBe(tile)
    expect(ghost.style.translate).toBe('10px 20px')
    expect(ghost.animate).toHaveBeenCalled()

    document.dispatchEvent(
      Object.assign(new Event('dragover'), { clientX: 120, clientY: 140 }),
    )
    expect(ghost.style.translate).toBe('100px 120px')
  })

  it('is removed when the drag ends outside the canvas', () => {
    const tile = mountTile()
    liftMediaDragGhost(dragEvent(), tile, '/a.png', null)
    endMediaDragGhost()
    vi.runAllTimers()
    expect(document.body.children).toHaveLength(1)
  })

  it('still follows the pointer but does not scale under reduced motion', () => {
    stubMotion(true)
    const tile = mountTile()
    liftMediaDragGhost(dragEvent(), tile, '/a.png', null)
    expect(HTMLElement.prototype.animate).not.toHaveBeenCalled()
    endMediaDragGhost()
    expect(document.body.children).toHaveLength(1)
  })
})
