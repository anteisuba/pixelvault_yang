/**
 * jsdom 没有 2D 画布（`getContext('2d')` 回 null、`toDataURL` 没实现）：这里替的是
 * **浏览器**那一层，让蒙版编辑器等真代码照常画、照常导出。
 *
 * - 画笔类调用不真画，只记下「这块画布被画过」；`getImageData` 回按尺寸分配的像素块，
 *   画过的那块第一个像素不透明（够让「有没有涂到」这类判断成立）。
 * - `toDataURL` 回 `data:image/png;base64,canvas-<宽>x<高>`：断言「导出的那张多大」用。
 *
 * 用完 `vi.restoreAllMocks()`。
 */
import { vi } from 'vitest'

function imageData(width: number, height: number, painted = false) {
  const data = new Uint8ClampedArray(Math.max(0, width * height * 4))
  if (painted && data.length >= 4) data[3] = 255
  return { width, height, colorSpace: 'srgb', data } as ImageData
}

const PAINT_CALLS = new Set(['fill', 'stroke', 'fillRect', 'drawImage'])

export function installFakeCanvas2d(): void {
  // 同一块画布每次 `getContext` 回同一个上下文（与浏览器一样），「画过没有」跟着它走。
  const contexts = new WeakMap<HTMLCanvasElement, unknown>()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    function (this: HTMLCanvasElement) {
      const existing = contexts.get(this)
      if (existing) return existing
      let painted = false
      const noop = () => {}
      const paint = () => {
        painted = true
      }
      const known: Record<string, unknown> = {
        canvas: this,
        getImageData: (_x: number, _y: number, w: number, h: number) =>
          imageData(w, h, painted),
        createImageData: (w: number, h: number) => imageData(w, h),
        clearRect: () => {
          painted = false
        },
      }
      const context = new Proxy(known, {
        get: (target, key) =>
          typeof key === 'string' && key in target
            ? target[key]
            : typeof key === 'string' && PAINT_CALLS.has(key)
              ? paint
              : noop,
        set: () => true,
      })
      contexts.set(this, context)
      return context
    } as unknown as HTMLCanvasElement['getContext'],
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(
    function (this: HTMLCanvasElement) {
      return `data:image/png;base64,canvas-${this.width}x${this.height}`
    },
  )
}
