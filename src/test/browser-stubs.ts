/**
 * jsdom 缺的几样浏览器 API（边界，不是自己的代码）：
 *
 * - `ResizeObserver`：Radix Slider / Switch / Popover 挂载时要。
 * - `requestIdleCallback`：真 `deferToIdle` 没有它就退回 1 秒 `setTimeout`
 *   （key 名单等首屏后才拉的请求会白等 1 秒），这里换成下一拍就跑。
 *
 * 用完 `vi.unstubAllGlobals()`。
 */
import { vi } from 'vitest'

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

export function stubBrowserLayout() {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  vi.stubGlobal('requestIdleCallback', (callback: () => void) =>
    window.setTimeout(callback, 0),
  )
  vi.stubGlobal('cancelIdleCallback', (id: number) => window.clearTimeout(id))
}
